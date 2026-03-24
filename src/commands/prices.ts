import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

function parseStores(raw?: string): Array<{ retailerId: string; storeId: string }> | undefined {
  if (!raw) return undefined;
  return raw.split(',').map((pair) => {
    const [retailerId, storeId] = pair.split(':');
    return { retailerId: retailerId!, storeId: storeId! };
  });
}

export function registerPriceCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean
) {
  program
    .command('prices <itemCodes...>')
    .description('Get prices for item codes')
    .option('--stores <pairs>', 'retailerId:storeId,... to limit scope')
    .action(async (itemCodes: string[], opts) => {
      const client = await getClient();
      const args: Record<string, unknown> = { itemCodes };
      const stores = parseStores(opts.stores);
      if (stores) args.stores = stores;

      const result = await callTool(client, 'get_product_prices', args);
      isJson() ? outputRaw(result) : outputResult(result, 'get_product_prices');
      await client.close();
    });

  program
    .command('compare <items...>')
    .description('Compare prices across retailers (itemCode:qty ...)')
    .option('--stores <pairs>', 'retailerId:storeId,... to limit scope')
    .action(async (rawItems: string[], opts) => {
      const client = await getClient();
      const items = rawItems.map((raw) => {
        const [itemCode, qty] = raw.split(':');
        return { itemCode: itemCode!, quantity: Number(qty || 1) };
      });
      const args: Record<string, unknown> = { items };
      const stores = parseStores(opts.stores);
      if (stores) args.stores = stores;

      const result = await callTool(client, 'compare_prices', args);
      isJson() ? outputRaw(result) : outputResult(result, 'compare_prices');
      await client.close();
    });
}
