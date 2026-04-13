import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

export function registerHistoryCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean,
): void {
  program
    .command('history [itemCode]')
    .description(
      'Price history from price_history (MCP get_price_history). Window is by processed_at (ingestion), not retailer file time.',
    )
    .option('-b, --barcode <code>', 'Resolve barcode / short code to catalog item_code')
    .option('-q, --query <text>', 'Product name (may return DISAMBIGUATION_REQUIRED)')
    .option('--retailer <id>', 'With --store, limit to one store')
    .option('--store <id>', 'With --retailer, limit to one store')
    .option('--online-only', 'Only rows for active online stores')
    .option('--days <n>', 'Lookback days by processed_at (default: 365)', '365')
    .option('--limit <n>', 'Max rows returned (server default often 500)')
    .option(
      '--select <n>',
      'After DISAMBIGUATION_REQUIRED: candidate option 1–10 (same --query and scope)',
    )
    .option('--select-code <code>', 'After disambiguation: itemCode from candidate list')
    .option('--select-name <name>', 'After disambiguation: exact itemName from candidate list')
    .addHelpText(
      'after',
      `
Examples:
  salai history 7290000042015 --json
  salai history --barcode 7290000042015 --days 90 --json
  salai history --query "חלב 3%" --json
  salai history --query "חלב" --select 2 --json
  salai history 7290000042015 --retailer 7290027600007 --store 413 --json

Notes:
  - Product names / Hebrew: use --query only; a bare positional is always itemCode (catalog code).
  - DISAMBIGUATION_REQUIRED: rerun with same --query and scope plus --select N, --select-code, or --select-name.
  - Global --json: prefer "salai --json history …" or "node dist/salai.js --json history …" (see docs/product-price-history.md).
  - With --query, the server may require a selected store (store-first mode); use salai store set first.
  - itemCode positional, --barcode, and --query are mutually exclusive.
`,
    )
    .action(async (itemCode: string | undefined, opts) => {
      const pos = itemCode?.trim() ?? '';
      const barcode = String(opts.barcode ?? '').trim();
      const query = String(opts.query ?? '').trim();

      const modes = [pos.length > 0, barcode.length > 0, query.length > 0].filter(Boolean).length;
      if (modes === 0) {
        throw new Error('Provide itemCode, --barcode, or --query');
      }
      if (modes > 1) {
        throw new Error('Use only one of: itemCode argument, --barcode, or --query');
      }

      const retailerId = String(opts.retailer ?? '').trim();
      const storeId = String(opts.store ?? '').trim();
      if ((retailerId && !storeId) || (!retailerId && storeId)) {
        throw new Error('--retailer and --store must be used together');
      }

      const args: Record<string, unknown> = {};
      if (pos) args.itemCode = pos;
      if (barcode) args.barcode = barcode;
      if (query) args.query = query;

      if (retailerId && storeId) {
        args.retailerId = retailerId;
        args.storeId = storeId;
      }

      if (opts.onlineOnly === true) {
        args.onlineOnly = true;
      }

      const daysNum = Number(opts.days);
      if (Number.isFinite(daysNum) && daysNum > 0) {
        args.days = daysNum;
      }

      if (opts.limit != null && String(opts.limit).trim() !== '') {
        const lim = Number(opts.limit);
        if (Number.isFinite(lim) && lim > 0) args.limit = lim;
      }

      if (opts.select != null && String(opts.select).trim() !== '') {
        const sel = Number(opts.select);
        if (Number.isInteger(sel)) args.selectedOption = sel;
      }
      const selectCode = String(opts.selectCode ?? '').trim();
      const selectName = String(opts.selectName ?? '').trim();
      if (selectCode) args.selectedItemCode = selectCode;
      if (selectName) args.selectedItemName = selectName;

      const client = await getClient();
      const result = await callTool(client, 'get_price_history', args);
      isJson() ? outputRaw(result) : outputResult(result, 'get_price_history');
      await client.close();
    });
}
