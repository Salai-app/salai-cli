import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

export function registerRecommendCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean
) {
  program
    .command('recommend <itemCode>')
    .alias('rec')
    .description('Get complementary product recommendations')
    .option('--limit <n>', 'max results (default 5)')
    .action(async (itemCode: string, opts) => {
      const client = await getClient();
      const args: Record<string, unknown> = { itemCode };
      if (opts.limit) args.limit = Number(opts.limit);

      const result = await callTool(client, 'get_complementary_recommendations', args);
      isJson()
        ? outputRaw(result)
        : outputResult(result, 'get_complementary_recommendations');
      await client.close();
    });
}
