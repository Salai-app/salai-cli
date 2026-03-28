import { readFileSync } from 'fs';
import { Command, Option } from 'commander';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { callTool } from '../mcpClient.js';
import { outputResult, outputRaw } from '../formatters/index.js';

export function registerFulfillCommands(
  program: Command,
  getClient: () => Promise<Client>,
  isJson: () => boolean,
) {
  program
    .command('fulfill [items...]')
    .description(
      'Find the best store for a shopping list. ' +
        'Pass items inline (comma/space separated) or via --file.',
    )
    .addOption(
      new Option(
        '--scope <mode>',
        'Store universe: online_only (default) or all_active. For explicit store IDs use salai call.',
      )
        .choices(['online_only', 'all_active'])
        .default('online_only'),
    )
    .option('--max-stores <n>', 'Max stores to compare (default 10; server may cap higher values)', '10')
    .option('--file <path>', 'Read shopping list from file (newline separated)')
    .option('--brand-strict', 'Set alternatives.policy to same_brand (no brand substitution)')
    .option('--no-alternatives', 'Disable alternative resolution (alternatives.enabled false)')
    .action(async (inlineItems: string[], opts) => {
      const client = await getClient();

      let rawList: string | undefined;
      if (opts.file) {
        rawList = readFileSync(opts.file, 'utf-8');
      } else if (inlineItems.length > 0) {
        rawList = inlineItems.join(', ');
      }

      if (!rawList) {
        console.error('Error: provide items inline or via --file');
        process.exitCode = 1;
        await client.close();
        return;
      }

      const args: Record<string, unknown> = {
        rawList,
        scope: {
          mode: opts.scope,
          maxStores: parseInt(opts.maxStores, 10) || 10,
        },
        alternatives: {
          enabled: opts.alternatives !== false,
        },
        mode: 'quote',
      };

      if (opts.brandStrict) {
        (args.alternatives as Record<string, unknown>).policy = 'same_brand';
      }

      const result = await callTool(client, 'fulfill_shopping_list', args);
      isJson() ? outputRaw(result) : outputResult(result, 'fulfill_shopping_list');
      await client.close();
    })
    .addHelpText(
      'after',
      `
Global options (same as root salai --help; often placed after the subcommand, e.g. salai fulfill "…" --json)
  -k, --api-key <key>   Salai API key (or SALAI_API_KEY env)
  --url <url>           MCP endpoint URL (or SALAI_MCP_URL env)
  --json                Raw JSON output instead of formatted tables

Agent / automation
  Use --json on every invoke so output matches MCP structured payloads.

  fulfill does not use the selected store (quote mode is fully request-scoped).
  Higher token cost than search; errors may include TOKEN_LIMIT_REACHED or RATE_LIMIT_EXCEEDED.

CLI vs full MCP tool
  This subcommand sends rawList + scope (mode, maxStores) + alternatives (enabled, policy if --brand-strict).
  Not exposed as flags (use: salai call fulfill_shopping_list --args '<json>' --json):
    items[] (structured lines), scope.stores + scope.mode explicit, alternatives.maxPerItem,
    alternatives.policy (cheapest | closest_size | same_brand | best_unit_price),
    resolution.policy (favorites_first | cheapest | brand_strict | closest_size | ask),
    llmRawListExtraction (default true on server for rawList), includeDiagnostics, mode (quote).

Examples
  salai fulfill "חלב, לחם, ביצים" --json
  salai fulfill --file ./list.txt --scope all_active --max-stores 5 --json
  salai fulfill "חלב" --brand-strict --no-alternatives --json
  salai call fulfill_shopping_list --args '{"items":[{"query":"חלב","quantity":2}],"scope":{"mode":"online_only","maxStores":3}}' --json
`,
    );
}
