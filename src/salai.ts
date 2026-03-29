#!/usr/bin/env node
/**
 * Salai CLI — human-facing command-line interface for Salai grocery intelligence.
 *
 * Calls the Salai MCP server over HTTPS, same endpoint and auth as the MCP bridge.
 *
 * Usage:
 *   salai search "חלב"
 *   salai cart add 7290019489443 --qty 2
 *   salai compare 7290019489443:1 7290000123456:3
 *   salai tools
 */

import { Command } from 'commander';
import { createClient, resolveConfig, PACKAGE_VERSION } from './mcpClient.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { registerSearchCommands } from './commands/search.js';
import { registerPriceCommands } from './commands/prices.js';
import { registerStoreCommands } from './commands/stores.js';
import { registerCartCommands } from './commands/cart.js';
import { registerRecommendCommands } from './commands/recommend.js';
import { registerCallCommands } from './commands/call.js';
import { registerFulfillCommands } from './commands/fulfill.js';

const program = new Command()
  .name('salai')
  .description('Salai grocery intelligence CLI')
  .version(PACKAGE_VERSION, '-v, --version')
  .option('-k, --api-key <key>', 'Salai API key (or SALAI_API_KEY env)')
  .option('--url <url>', 'MCP endpoint URL (or SALAI_MCP_URL env)')
  .option('--json', 'output raw JSON instead of formatted tables')
  .configureOutput({
    writeErr: (str) => process.stderr.write(str),
  });

let _client: Client | null = null;

async function getClient(): Promise<Client> {
  if (_client) return _client;
  const opts = program.opts();
  const config = resolveConfig({
    apiKey: opts.apiKey,
    url: opts.url,
  });

  if (!config.apiKey) {
    console.error(
      'Warning: No API key. Set SALAI_API_KEY or use --api-key.\n' +
        'Get your key: https://app.salai.co.il → Profile → API Key'
    );
  }

  _client = await createClient({
    ...config,
    clientName: 'salai-cli',
  });
  return _client;
}

function isJson(): boolean {
  return !!program.opts().json;
}

registerSearchCommands(program, getClient, isJson);
registerPriceCommands(program, getClient, isJson);
registerStoreCommands(program, getClient, isJson);
registerCartCommands(program, getClient, isJson);
registerRecommendCommands(program, getClient, isJson);
registerCallCommands(program, getClient, isJson);
registerFulfillCommands(program, getClient, isJson);

program.addHelpText(
  'after',
  `
AI agents: use --json on every command. Run salai <command> --help for that command's flags
(e.g. salai shopping-list --help or salai fulfill --help). Full MCP args: salai call <toolName> --args '{"…"}' --json
or salai tools --json to list tools from the server.
`,
);

program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    const isCommanderExit =
      err && typeof err === 'object' && 'code' in err && (err as any).code === 'commander.helpDisplayed';
    if (isCommanderExit) return;

    const versionExit =
      err && typeof err === 'object' && 'code' in err && (err as any).code === 'commander.version';
    if (versionExit) return;

    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exitCode = 1;
  } finally {
    if (_client) {
      await _client.close().catch(() => {});
    }
  }
}

main();
