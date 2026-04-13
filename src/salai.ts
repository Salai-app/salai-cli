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
 *   salai history 7290000042015
 *   salai tools
 */

import { Command, Option } from 'commander';
import { createClient, resolveConfig, PACKAGE_VERSION } from './mcpClient.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { registerSearchCommands } from './commands/search.js';
import { registerPriceCommands } from './commands/prices.js';
import { registerHistoryCommands } from './commands/history.js';
import { registerStoreCommands } from './commands/stores.js';
import { registerCartCommands } from './commands/cart.js';
import { registerRecommendCommands } from './commands/recommend.js';
import { registerCallCommands } from './commands/call.js';
import { registerFulfillCommands } from './commands/fulfill.js';
import { AUTH_COMMAND_NAMES, registerAuthCommands } from './commands/auth.js';
import { printStartupBanner } from './banner.js';

const program = new Command()
  .name('salai')
  .description('Salai grocery intelligence CLI')
  .version(PACKAGE_VERSION, '-v, --version')
  .option('-k, --api-key <key>', 'Salai API key (or SALAI_API_KEY; overrides salai login credentials file)')
  .addOption(
    new Option('--url <url>', 'MCP endpoint URL (or SALAI_MCP_URL env)').hideHelp(),
  )
  .option('--json', 'output raw JSON instead of formatted tables')
  .option('--no-banner', 'hide the startup banner (human output only)')
  .option(
    '--compact-header',
    'use a compact single-line header instead of the full banner',
  )
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
    throw new Error(
      'Missing API key. Run `salai login`, or set SALAI_API_KEY, or use --api-key. ' +
        'Profile keys: https://app.salai.co.il → Profile → API Key',
    );
  }

  _client = await createClient({
    apiKey: config.apiKey,
    url: config.url,
    clientName: 'salai-cli',
  });
  return _client;
}

function isJson(): boolean {
  return !!program.opts().json;
}

registerSearchCommands(program, getClient, isJson);
registerPriceCommands(program, getClient, isJson);
registerHistoryCommands(program, getClient, isJson);
registerStoreCommands(program, getClient, isJson);
registerCartCommands(program, getClient, isJson);
registerRecommendCommands(program, getClient, isJson);
registerCallCommands(program, getClient, isJson);
registerFulfillCommands(program, getClient, isJson);
registerAuthCommands(program);

program.hook('preAction', async (_thisCommand, actionCommand) => {
  if (AUTH_COMMAND_NAMES.has(actionCommand.name())) {
    return;
  }
  const o = program.opts();
  await printStartupBanner(getClient, {
    apiKey: o.apiKey,
    url: o.url,
    json: o.json,
    noBanner: o.noBanner,
    compactHeader: o.compactHeader,
  });
});

program.addHelpText(
  'after',
  `
Auth: salai login — open the link, sign in, enter the user code; saves ~/.config/salai/credentials.json (or set SALAI_API_KEY / use -k).
      salai whoami — show account/key info (add --json for agents). salai logout — drop saved creds; add --revoke to deactivate that key on the server.
      salai login --help | salai logout --help | salai whoami --help for flags.

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
    const code = err && typeof err === 'object' && 'code' in err ? (err as any).code : null;
    if (code === 'commander.helpDisplayed' || code === 'commander.help') return;

    if (code === 'commander.version') return;

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
