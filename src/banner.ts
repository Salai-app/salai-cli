/**
 * Human-mode startup banner (Socket-style). Skipped for --json, --no-banner, or parse-only exits.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  callTool,
  extractJson,
  PACKAGE_VERSION,
  resolveConfig,
} from './mcpClient.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function useAnsi(): boolean {
  return !!(process.stdout.isTTY && process.env.NO_COLOR == null);
}

function sty(color: string, text: string): string {
  if (!useAnsi()) return text;
  return `${color}${text}${RESET}`;
}

function visLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padEndVis(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - visLen(s)));
}

// FIGlet font "small" — matches scripts/cli-banner-sketch.mjs
const LOGO_LINES = [
  '  ___       _      _ ',
  ' / __| __ _| |__ _(_)',
  ' \\__ \\/ _` | / _` | |',
  ' |___/\\__,_|_\\__,_|_|',
  '                     ',
];

/** Banner line: storeId / retailerId from MCP `selectedStore` (stable ASCII, no name/Hebrew handling). */
function storeSummary(data: unknown): string {
  if (data == null || typeof data !== 'object') return '(none)';
  const root = data as Record<string, unknown>;
  const sel = root.selectedStore;
  if (sel == null || typeof sel !== 'object') return '(none)';
  const s = sel as Record<string, unknown>;

  const retailerId = s.retailerId != null ? String(s.retailerId).trim() : '';
  const storeId = s.storeId != null ? String(s.storeId).trim() : '';
  if (!retailerId && !storeId) return '(none)';
  if (!storeId) return retailerId;
  if (!retailerId) return storeId;
  return `${storeId} / ${retailerId}`;
}

export interface BannerProgramOpts {
  apiKey?: string;
  url?: string;
  json?: boolean;
  noBanner?: boolean;
  compactHeader?: boolean;
}

export async function printStartupBanner(
  getClient: () => Promise<Client>,
  opts: BannerProgramOpts,
): Promise<void> {
  if (opts.json || opts.noBanner) return;

  const config = resolveConfig({ apiKey: opts.apiKey, url: opts.url });
  const keyLabel = config.apiKey ? '(set)' : '(not set)';

  let storeLine = '(unknown)';
  try {
    const client = await getClient();
    const result = await callTool(client, 'get_my_store_context');
    if (!result.isError) {
      storeLine = storeSummary(extractJson(result));
    } else {
      storeLine = '(unavailable)';
    }
  } catch {
    storeLine = '(unavailable)';
  }

  const cwd = process.cwd();
  const dimSep = sty(DIM, ' · ');

  if (opts.compactHeader) {
    const parts = [
      `Salai CLI v${PACKAGE_VERSION}`,
      `API KEY: ${keyLabel}`,
      `Store/Retailer: ${storeLine}`,
      sty(DIM, cwd),
    ];
    console.log(parts.join(dimSep));
    return;
  }

  const rail: string[] = [
    sty(BOLD, 'CLI'),
    `v${PACKAGE_VERSION}`,
    `API KEY: ${keyLabel}`,
    `Store/Retailer: ${storeLine}`,
    sty(DIM, `cwd: ${cwd}`),
  ];

  const col = 24;
  for (let i = 0; i < LOGO_LINES.length; i++) {
    console.log(padEndVis(LOGO_LINES[i]!, col) + sty(DIM, '│ ') + rail[i]!);
  }
  console.log('');
}
