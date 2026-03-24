/**
 * Output formatting for the Salai CLI.
 * Renders MCP tool results as human-friendly tables or raw JSON.
 */

import type { ToolResult } from '../mcpClient.js';
import { extractJson, extractText } from '../mcpClient.js';

// ── Helpers ──

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

function c(color: string, text: string | number): string {
  return `${color}${text}${RESET}`;
}

function pad(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - visible.length));
}

function padR(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  return ' '.repeat(Math.max(0, len - visible.length)) + str;
}

function table(headers: string[], rows: string[][], colAligns?: ('l' | 'r')[]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '').length))
  );
  const aligns = colAligns ?? headers.map(() => 'l' as const);

  const sep = widths.map((w) => '─'.repeat(w + 2)).join('┼');
  const formatRow = (cols: string[]) =>
    cols
      .map((col, i) =>
        aligns[i] === 'r'
          ? ' ' + padR(col, widths[i]!) + ' '
          : ' ' + pad(col, widths[i]!) + ' '
      )
      .join('│');

  const lines: string[] = [];
  lines.push(formatRow(headers.map((h) => c(BOLD, h))));
  lines.push(sep);
  for (const row of rows) {
    lines.push(formatRow(row));
  }
  return lines.join('\n');
}

function shekel(n: number | null | undefined): string {
  if (n == null) return c(DIM, '—');
  return `₪${n.toFixed(2)}`;
}

const RLM = '\u200F';

/** Wrap Hebrew text with RTL mark so terminals render it correctly in padded columns. */
function rtl(text: string): string {
  if (!text) return text;
  if (/[\u0590-\u05FF]/.test(text)) return RLM + text + RLM;
  return text;
}

// ── Public API ──

export function outputRaw(result: ToolResult): void {
  const json = extractJson(result);
  console.log(JSON.stringify(json ?? result, null, 2));
}

export function outputResult(result: ToolResult, toolName: string): void {
  if (result.isError) {
    const text = extractText(result);
    console.error(c(RED, `Error: ${text ?? 'Unknown error'}`));
    process.exitCode = 1;
    return;
  }

  const data = extractJson(result) as any;
  if (!data) {
    const text = extractText(result);
    if (text) {
      console.log(text);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  switch (toolName) {
    case 'search_products':
      formatSearchProducts(data);
      break;
    case 'autocomplete_products':
      formatAutocomplete(data);
      break;
    case 'get_product_prices':
      formatProductPrices(data);
      break;
    case 'compare_prices':
      formatComparePrices(data);
      break;
    case 'get_stores':
      formatStores(data);
      break;
    case 'get_retailers':
      formatRetailers(data);
      break;
    case 'get_my_store_context':
      formatStoreContext(data);
      break;
    case 'set_my_selected_store':
      formatStoreContext(data);
      break;
    case 'get_my_cart':
    case 'get_cart':
      formatCart(data);
      break;
    case 'add_cart_item':
    case 'set_cart_item_quantity':
    case 'remove_cart_item':
      formatCartMutation(data, toolName);
      break;
    case 'compare_my_cart':
      formatCartComparison(data);
      break;
    case 'delete_cart':
      console.log(c(GREEN, '✓ Cart deleted'));
      break;
    case 'get_complementary_recommendations':
      formatRecommendations(data);
      break;
    default:
      console.log(JSON.stringify(data, null, 2));
  }
}

// ── Tool-specific formatters ──

function formatSearchProducts(data: any): void {
  // structuredContent: { numberedProducts: [{ itemCode, itemName, price }] }
  if (Array.isArray(data.numberedProducts)) {
    const products = data.numberedProducts;
    if (products.length === 0) {
      console.log(c(DIM, 'No products found.'));
      return;
    }
    if (data.query) console.log(c(DIM, `Search: "${data.query}"\n`));
    const rows = products.map((p: any) => [
      p.itemCode ?? '',
      rtl(p.itemName ?? ''),
      p.displayPrice ?? shekel(p.price),
    ]);
    console.log(table(['Code', 'Name', 'Price'], rows, ['l', 'l', 'r']));
    console.log(c(DIM, `\n${products.length} result(s)`));
    return;
  }

  // Raw JSON: { recommendations: [{ product: {...}, bestPrice: {...} }] }
  const recs = data.recommendations;
  if (Array.isArray(recs)) {
    if (recs.length === 0) {
      console.log(c(DIM, 'No products found.'));
      return;
    }
    if (data.query) console.log(c(DIM, `Search: "${data.query}"\n`));
    const rows = recs.map((rec: any) => {
      const p = rec.product ?? {};
      return [
        p.itemCode ?? '',
        rtl(p.manufactureItemDescription ?? p.itemName ?? ''),
        shekel(rec.bestPrice?.price),
      ];
    });
    console.log(table(['Code', 'Name', 'Price'], rows, ['l', 'l', 'r']));
    console.log(c(DIM, `\n${recs.length} result(s)`));
    return;
  }

  // Fallback: flat array
  const products = data.products ?? data.results ?? data;
  if (Array.isArray(products) && products.length > 0) {
    const rows = products.map((p: any) => [
      p.itemCode ?? '',
      rtl(p.itemName ?? p.name ?? ''),
      shekel(p.price ?? p.itemPrice),
    ]);
    console.log(table(['Code', 'Name', 'Price'], rows, ['l', 'l', 'r']));
    console.log(c(DIM, `\n${products.length} result(s)`));
    return;
  }

  console.log(c(DIM, 'No products found.'));
}

function formatAutocomplete(data: any): void {
  // structuredContent: { numberedProducts: [...] }
  if (Array.isArray(data.numberedProducts)) {
    const products = data.numberedProducts;
    if (products.length === 0) {
      console.log(c(DIM, 'No suggestions.'));
      return;
    }
    const rows = products.map((p: any) => [
      p.itemCode ?? '',
      rtl(p.itemName ?? ''),
      p.displayPrice ?? shekel(p.price),
    ]);
    console.log(table(['Code', 'Name', 'Price'], rows, ['l', 'l', 'r']));
    return;
  }

  // Raw JSON: flat array [{ itemCode, itemName, bestPrice }]
  const products = Array.isArray(data) ? data : (data.products ?? data.suggestions ?? []);
  if (!Array.isArray(products) || products.length === 0) {
    console.log(c(DIM, 'No suggestions.'));
    return;
  }

  const rows = products.map((p: any) => [
    p.itemCode ?? '',
    rtl(p.itemName ?? p.name ?? ''),
    shekel(p.bestPrice ?? p.price ?? p.itemPrice),
  ]);
  console.log(table(['Code', 'Name', 'Price'], rows, ['l', 'l', 'r']));
}

function formatProductPrices(data: any): void {
  const items = data.prices ?? data.items ?? data;
  if (!Array.isArray(items) || items.length === 0) {
    console.log(c(DIM, 'No price data.'));
    return;
  }

  const rows = items.map((p: any) => [
    p.itemCode ?? '',
    rtl(p.itemName ?? ''),
    shekel(p.price ?? p.itemPrice),
    rtl(p.retailerName ?? p.retailerId ?? ''),
    rtl(p.storeName ?? p.storeId ?? ''),
  ]);
  console.log(table(['Code', 'Name', 'Price', 'Retailer', 'Store'], rows, ['l', 'l', 'r', 'l', 'l']));
}

function formatComparePrices(data: any): void {
  // structuredContent: { viewType: 'store_comparison', stores: [...], summary: {...} }
  if (data.viewType === 'store_comparison' && Array.isArray(data.stores)) {
    const stores = data.stores;
    if (stores.length === 0) {
      console.log(c(DIM, 'No comparison data.'));
      return;
    }
    const rows = stores.map((s: any) => {
      const missing = s.availabilitySummary?.missingCount ?? 0;
      const cheapest = s.isCheapest ? c(GREEN, ' ★') : '';
      return [
        rtl(s.storeLabel ?? s.retailerName ?? s.retailerId ?? ''),
        s.displaySubtotal ?? shekel(s.subtotal),
        String(missing),
        cheapest,
      ];
    });
    console.log(table(['Store', 'Total', 'Missing', ''], rows, ['l', 'r', 'r', 'l']));
    if (data.summary?.cheapestStoreLabel) {
      console.log(`\n${c(GREEN, '★')} Cheapest: ${c(BOLD, data.summary.cheapestStoreLabel)}`);
    }
    return;
  }

  // Raw JSON: { comparison: { retailers: [...] } } or { retailers: [...] }
  const comparePayload = data.comparison ?? data;
  const retailers = comparePayload.retailers ?? data.stores ?? data;
  if (!Array.isArray(retailers) || retailers.length === 0) {
    console.log(c(DIM, 'No comparison data.'));
    return;
  }

  const rows = retailers.map((s: any) => {
    const total = s.subtotal ?? s.total ?? s.totalPrice ?? s.basketTotal;
    const missing = (s.items ?? []).filter((i: any) => !i.available).length;
    return [
      rtl(s.retailerName ?? s.retailerId ?? ''),
      shekel(total),
      String(missing),
    ];
  });
  console.log(table(['Retailer', 'Total', 'Missing'], rows, ['l', 'r', 'r']));
}

function formatStores(data: any): void {
  const stores = data.stores ?? data;
  if (!Array.isArray(stores) || stores.length === 0) {
    console.log(c(DIM, 'No stores.'));
    return;
  }

  const rows = stores.map((s: any) => [
    s.retailerId ?? '',
    s.storeId ?? '',
    rtl(s.retailerName ?? ''),
    rtl(s.storeName ?? s.name ?? ''),
  ]);
  console.log(table(['Retailer ID', 'Store ID', 'Retailer', 'Store'], rows));
}

function formatRetailers(data: any): void {
  const retailers = data.retailers ?? data;
  if (!Array.isArray(retailers) || retailers.length === 0) {
    console.log(c(DIM, 'No retailers.'));
    return;
  }

  const rows = retailers.map((r: any) => [
    r.id ?? r.retailerId ?? '',
    rtl(r.name ?? r.displayName ?? ''),
  ]);
  console.log(table(['ID', 'Name'], rows));
}

function formatStoreContext(data: any): void {
  const sel = data.selectedStore ?? data;
  if (sel?.retailerName || sel?.retailerId) {
    console.log(
      `${c(BOLD, 'Selected store:')} ${rtl(sel.retailerName ?? sel.retailerId)} — ${rtl(sel.storeName ?? sel.storeId ?? '')}`
    );
  } else {
    console.log(c(YELLOW, 'No store selected. Use: salai store set <retailerId> <storeId>'));
  }
  if (data.activeStores && Array.isArray(data.activeStores)) {
    console.log(c(DIM, `\n${data.activeStores.length} active store(s) available`));
  }
}

function formatCart(data: any): void {
  // structuredContent: { viewType: 'cart_overview', items: [...], summary: {...} }
  if (data.viewType === 'cart_overview') {
    const summary = data.summary ?? {};
    console.log(`${c(BOLD, 'Cart')} ${c(DIM, '—')} ${rtl(summary.storeLabel ?? '')}`);

    const items = data.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      console.log(c(DIM, 'Cart is empty.'));
      return;
    }

    const rows = items.map((it: any) => [
      it.itemCode ?? '',
      rtl(it.itemName ?? ''),
      String(it.quantity ?? 1),
      it.displayPrice ?? shekel(it.unitPrice),
      it.displaySubtotal ?? shekel(it.subtotal),
    ]);
    console.log(table(['Code', 'Name', 'Qty', 'Unit', 'Subtotal'], rows, ['l', 'l', 'r', 'r', 'r']));
    console.log(`\n${c(BOLD, 'Total:')} ${c(GREEN, summary.displayGrandTotal ?? shekel(summary.grandTotal))}`);
    return;
  }

  // Raw JSON fallback
  const cartId = data.id ?? data.cartId ?? '';
  const items = data.items ?? data.itemsWithPrices ?? data.storeCarts?.[0]?.items ?? [];

  console.log(`${c(BOLD, 'Cart:')} ${c(DIM, cartId)}`);

  if (!Array.isArray(items) || items.length === 0) {
    console.log(c(DIM, 'Cart is empty.'));
    return;
  }

  const rows = items.map((entry: any) => {
    const it = entry.item ?? entry;
    const price = entry.productPrice?.itemPrice ?? it.price ?? it.itemPrice;
    const qty = it.quantity ?? 1;
    return [
      it.itemCode ?? '',
      rtl(it.itemName ?? it.name ?? ''),
      String(qty),
      shekel(price),
      shekel(entry.subtotal ?? (price != null ? price * qty : null)),
    ];
  });
  console.log(table(['Code', 'Name', 'Qty', 'Unit', 'Subtotal'], rows, ['l', 'l', 'r', 'r', 'r']));

  const total = data.grandTotal ?? data.total ?? data.totalPrice;
  if (total != null) {
    console.log(`\n${c(BOLD, 'Total:')} ${c(GREEN, shekel(total))}`);
  }
}

function formatCartMutation(data: any, tool: string): void {
  // structuredContent: cart_overview after mutation
  if (data.viewType === 'cart_overview') {
    const verb =
      tool === 'add_cart_item' ? 'Added to' : tool === 'remove_cart_item' ? 'Removed from' : 'Updated';
    console.log(`${c(GREEN, '✓')} ${verb} cart`);
    formatCart(data);
    return;
  }

  const verb =
    tool === 'add_cart_item'
      ? 'Added'
      : tool === 'remove_cart_item'
        ? 'Removed'
        : 'Updated';
  const addResult = data._addItemResult ?? data;
  const itemAdded = addResult.itemAdded ?? addResult.item ?? addResult;
  const name = itemAdded?.itemName ?? itemAdded?.itemCode ?? '';
  console.log(`${c(GREEN, '✓')} ${verb} ${c(BOLD, rtl(name))}`);

  if (addResult.notAvailable) {
    console.log(c(YELLOW, '⚠ Item is not available at selected store'));
  }

  if (data.itemsWithPrices || data.items || data.cart) {
    formatCart(data.cart ?? data);
  }
}

function formatCartComparison(data: any): void {
  formatComparePrices(data);
}

function formatRecommendations(data: any): void {
  const recs = data.recommendations ?? data.products ?? data;
  if (!Array.isArray(recs) || recs.length === 0) {
    console.log(c(DIM, 'No recommendations.'));
    return;
  }

  const rows = recs.map((r: any) => [
    r.itemCode ?? '',
    rtl(r.itemName ?? r.name ?? ''),
    shekel(r.price ?? r.itemPrice),
  ]);
  console.log(table(['Code', 'Name', 'Price'], rows, ['l', 'l', 'r']));
}
