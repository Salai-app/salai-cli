import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

export function registerStoreCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean
) {
  program
    .command('stores')
    .description('List all online stores (one per retailer)')
    .action(async () => {
      const client = await getClient();
      const result = await callTool(client, 'get_stores');
      isJson() ? outputRaw(result) : outputResult(result, 'get_stores');
      await client.close();
    });

  program
    .command('retailers')
    .description('List all retailers')
    .action(async () => {
      const client = await getClient();
      const result = await callTool(client, 'get_retailers');
      isJson() ? outputRaw(result) : outputResult(result, 'get_retailers');
      await client.close();
    });

  const store = program.command('store').description('Store context management');

  store
    .command('show', { isDefault: true })
    .description('Show current selected store context')
    .action(async () => {
      const client = await getClient();
      const result = await callTool(client, 'get_my_store_context');
      isJson() ? outputRaw(result) : outputResult(result, 'get_my_store_context');
      await client.close();
    });

  store
    .command('set <retailerId> <storeId>')
    .description('Set selected store')
    .action(async (retailerId: string, storeId: string) => {
      const client = await getClient();
      const result = await callTool(client, 'set_my_selected_store', {
        retailerId,
        storeId,
      });
      isJson() ? outputRaw(result) : outputResult(result, 'set_my_selected_store');
      await client.close();
    });
}
