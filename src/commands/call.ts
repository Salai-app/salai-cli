import type { Command } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

export function registerCallCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean
) {
  program
    .command('call <toolName>')
    .description('Call any MCP tool by name (escape hatch)')
    .option('--args <json>', 'JSON arguments', '{}')
    .action(async (toolName: string, opts) => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(opts.args);
      } catch {
        console.error('Error: --args must be valid JSON');
        process.exitCode = 1;
        return;
      }

      const client = await getClient();
      const result = await callTool(client, toolName, args);
      isJson() ? outputRaw(result) : outputResult(result, toolName);
      await client.close();
    });

  program
    .command('tools')
    .description('List all available MCP tools')
    .action(async () => {
      const client = await getClient();
      const { tools } = await client.listTools();

      if (isJson()) {
        console.log(JSON.stringify(tools, null, 2));
      } else {
        const maxName = Math.max(...tools.map((t) => t.name.length));
        for (const tool of tools) {
          const name = tool.name.padEnd(maxName);
          const desc = tool.description ?? '';
          console.log(`  ${name}  ${desc}`);
        }
        console.log(`\n${tools.length} tool(s) available`);
      }
      await client.close();
    });
}
