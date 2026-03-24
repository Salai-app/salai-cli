import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool, extractJson } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

function parseStores(raw?: string): Array<{ retailerId: string; storeId: string }> | undefined {
  if (!raw) return undefined;
  return raw.split(',').map((pair) => {
    const [retailerId, storeId] = pair.split(':');
    return { retailerId: retailerId!, storeId: storeId! };
  });
}

async function resolveCartId(client: Client, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const result = await callTool(client, 'get_my_cart');
  const data = extractJson(result) as any;
  const id = data?.id ?? data?.cartId ?? data?.raw?.id ?? data?.raw?.cartId;
  if (!id) throw new Error('Could not resolve cart ID. Pass --cart-id explicitly.');
  return id;
}

export function registerCartCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean
) {
  const cart = program.command('cart').description('Shopping cart operations');

  cart
    .command('show', { isDefault: true })
    .description('Show current cart')
    .option('--cart-id <id>', 'specific cart ID (default: your cart)')
    .action(async (opts) => {
      const client = await getClient();
      let result;
      if (opts.cartId) {
        result = await callTool(client, 'get_cart', { cartId: opts.cartId });
        isJson() ? outputRaw(result) : outputResult(result, 'get_cart');
      } else {
        result = await callTool(client, 'get_my_cart');
        isJson() ? outputRaw(result) : outputResult(result, 'get_my_cart');
      }
      await client.close();
    });

  cart
    .command('add <itemCode>')
    .description('Add item to cart')
    .option('--qty <n>', 'quantity (default 1)')
    .option('--cart-id <id>', 'cart ID (default: auto-resolve)')
    .option('--name <name>', 'item name (optional)')
    .action(async (itemCode: string, opts) => {
      const client = await getClient();
      const cartId = await resolveCartId(client, opts.cartId);
      const args: Record<string, unknown> = {
        cartId,
        itemCode,
        quantity: Number(opts.qty || 1),
      };
      if (opts.name) args.itemName = opts.name;

      const result = await callTool(client, 'add_cart_item', args);
      isJson() ? outputRaw(result) : outputResult(result, 'add_cart_item');
      await client.close();
    });

  cart
    .command('set-qty <itemCode> <quantity>')
    .description('Set item quantity (0 = remove)')
    .option('--cart-id <id>', 'cart ID (default: auto-resolve)')
    .action(async (itemCode: string, quantity: string, opts) => {
      const client = await getClient();
      const cartId = await resolveCartId(client, opts.cartId);

      const result = await callTool(client, 'set_cart_item_quantity', {
        cartId,
        itemCode,
        quantity: Number(quantity),
      });
      isJson() ? outputRaw(result) : outputResult(result, 'set_cart_item_quantity');
      await client.close();
    });

  cart
    .command('remove <itemCode>')
    .description('Remove item from cart')
    .option('--cart-id <id>', 'cart ID (default: auto-resolve)')
    .action(async (itemCode: string, opts) => {
      const client = await getClient();
      const cartId = await resolveCartId(client, opts.cartId);

      const result = await callTool(client, 'remove_cart_item', {
        cartId,
        itemCode,
      });
      isJson() ? outputRaw(result) : outputResult(result, 'remove_cart_item');
      await client.close();
    });

  cart
    .command('compare')
    .description('Compare your cart across stores')
    .option('--cart-id <id>', 'cart ID (optional)')
    .option('--stores <pairs>', 'retailerId:storeId,... to limit scope')
    .action(async (opts) => {
      const client = await getClient();
      const args: Record<string, unknown> = {};
      if (opts.cartId) args.cartId = opts.cartId;
      const stores = parseStores(opts.stores);
      if (stores) args.stores = stores;

      const result = await callTool(client, 'compare_my_cart', args);
      isJson() ? outputRaw(result) : outputResult(result, 'compare_my_cart');
      await client.close();
    });

  cart
    .command('delete <cartId>')
    .description('Delete a cart')
    .action(async (cartId: string) => {
      const client = await getClient();
      const result = await callTool(client, 'delete_cart', { cartId });
      isJson() ? outputRaw(result) : outputResult(result, 'delete_cart');
      await client.close();
    });
}
