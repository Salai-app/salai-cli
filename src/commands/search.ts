import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

export function registerSearchCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean
) {
  program
    .command('search <query>')
    .description('Search products by Hebrew query')
    .option('--limit <n>', 'max results (default 20)')
    .option('--mode <mode>', 'fast | hybrid | ai')
    .option('--store-scope <scope>', 'selected_only | retailer_wide | all_limited')
    .option('--retailer <id>', 'filter by retailer ID')
    .option('--store <id>', 'filter by store ID')
    .action(async (query: string, opts) => {
      const client = await getClient();
      const args: Record<string, unknown> = { query };
      if (opts.limit) args.limit = Number(opts.limit);
      if (opts.mode) args.mode = opts.mode;
      if (opts.storeScope) args.storeScope = opts.storeScope;
      if (opts.retailer) args.retailerId = opts.retailer;
      if (opts.store) args.storeId = opts.store;

      const result = await callTool(client, 'search_products', args);
      isJson() ? outputRaw(result) : outputResult(result, 'search_products');
      await client.close();
    });

  program
    .command('autocomplete <query>')
    .alias('ac')
    .description('Fast autocomplete product lookup')
    .option('--limit <n>', 'max results (default 15)')
    .option('--method <m>', 'text | semantic (default text)')
    .option('--store-scope <scope>', 'selected_only | retailer_wide | all_limited')
    .action(async (query: string, opts) => {
      const client = await getClient();
      const args: Record<string, unknown> = { query };
      if (opts.limit) args.limit = Number(opts.limit);
      if (opts.method) args.method = opts.method;
      if (opts.storeScope) args.storeScope = opts.storeScope;

      const result = await callTool(client, 'autocomplete_products', args);
      isJson() ? outputRaw(result) : outputResult(result, 'autocomplete_products');
      await client.close();
    });
}
