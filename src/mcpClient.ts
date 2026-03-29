/**
 * Shared MCP client factory.
 * Connects to the Salai MCP HTTP endpoint and provides tool-calling helpers.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const DEFAULT_MCP_URL = 'https://mcp.salai.co.il/mcp';
export const PACKAGE_VERSION = '0.1.5';

export interface McpClientOptions {
  apiKey: string | null;
  url: string;
  clientName?: string;
}

export function resolveConfig(overrides?: {
  apiKey?: string;
  url?: string;
}): { apiKey: string | null; url: string } {
  return {
    apiKey:
      overrides?.apiKey ||
      process.env.SALAI_API_KEY ||
      process.env.MCP_API_KEY ||
      null,
    url: overrides?.url || process.env.SALAI_MCP_URL || DEFAULT_MCP_URL,
  };
}

export function buildHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function createClient(
  opts: McpClientOptions
): Promise<Client> {
  const headers = buildHeaders(opts.apiKey);
  const transport = new StreamableHTTPClientTransport(new URL(opts.url), {
    requestInit: { headers },
  });
  const client = new Client(
    { name: opts.clientName ?? 'salai-cli', version: PACKAGE_VERSION },
    { capabilities: {} }
  );
  await client.connect(transport);
  return client;
}

export interface ToolResult {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
  [k: string]: unknown;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

/** Extract the first text content block from an MCP tool result. */
export function extractText(result: ToolResult): string | null {
  if (!result.content) return null;
  const textBlock = result.content.find((c) => c.type === 'text');
  return textBlock?.text ?? null;
}

/**
 * Extract parsed JSON from an MCP tool result.
 * Prefers structuredContent, then tries each text block for valid JSON.
 */
export function extractJson(result: ToolResult): unknown {
  if (result.structuredContent != null) {
    return result.structuredContent;
  }

  if (!result.content) return null;

  const textBlocks = result.content.filter((c) => c.type === 'text' && c.text);
  for (const block of textBlocks) {
    try {
      return JSON.parse(block.text!);
    } catch {
      // not JSON, try next block
    }
  }

  return textBlocks[0]?.text ?? null;
}
