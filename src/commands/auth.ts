/**
 * salai login | logout | whoami — device flow and credential file.
 */

import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { DEFAULT_API_URL, DEFAULT_MCP_URL, resolveConfig } from '../mcpClient.js';
import {
  getCredentialsPath,
  removeStoredCredentials,
  writeStoredCredentials,
} from '../credentials.js';

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Only http(s) URLs from the device flow may be passed to the OS opener. */
function assertSafeHttpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('login: invalid verification URL from server');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('login: unsupported verification URL protocol');
  }
  return parsed.href;
}

/**
 * Open URL in the system default browser without waiting for the browser process.
 * Returns false if spawning failed (e.g. xdg-open missing).
 */
function openUrlInBrowser(url: string): Promise<boolean> {
  let safeUrl: string;
  try {
    safeUrl = assertSafeHttpUrl(url);
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const platform = process.platform;
    let executable: string;
    let args: string[];
    if (platform === 'darwin') {
      executable = 'open';
      args = [safeUrl];
    } else if (platform === 'win32') {
      executable = 'rundll32';
      args = ['url.dll,FileProtocolHandler', safeUrl];
    } else {
      executable = 'xdg-open';
      args = [safeUrl];
    }
    try {
      const child = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
      });
      child.on('error', () => resolve(false));
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description(
      'Browser sign-in with user code; writes ~/.config/salai/credentials.json (see also SALAI_API_KEY, -k)',
    )
    .option('--no-browser', 'do not open a browser automatically')
    .option(
      '--api-url <url>',
      `Salai API base URL (default ${DEFAULT_API_URL} or SALAI_API_URL)`,
    )
    .option('--name <label>', 'optional label for this CLI key (shown in Profile)')
    .option(
      '--mcp-url <url>',
      `MCP endpoint URL to store (default ${DEFAULT_MCP_URL} or SALAI_MCP_URL)`,
    )
    .action(
      async (opts: {
        browser?: boolean;
        apiUrl?: string;
        name?: string;
        mcpUrl?: string;
      }) => {
        const apiBase = (opts.apiUrl || process.env.SALAI_API_URL || DEFAULT_API_URL).replace(
          /\/$/,
          '',
        );
        const mcpUrl = (opts.mcpUrl || process.env.SALAI_MCP_URL || DEFAULT_MCP_URL).replace(
          /\/$/,
          '',
        );

        const deviceBody: Record<string, string> = {};
        if (opts.name?.trim()) {
          deviceBody.client_label = opts.name.trim().slice(0, 120);
        }

        const deviceRes = await fetch(`${apiBase}/api/cli/device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deviceBody),
        });

        if (!deviceRes.ok) {
          const t = await deviceRes.text();
          throw new Error(`device: HTTP ${deviceRes.status} ${t.slice(0, 200)}`);
        }

        const device = (await deviceRes.json()) as {
          device_code: string;
          user_code: string;
          verification_uri: string;
          verification_uri_complete: string;
          expires_in: number;
          interval: number;
        };

        console.error('');
        console.error(`User code: ${device.user_code}`);
        console.error(`Open: ${device.verification_uri_complete}`);
        console.error('');

        const skipBrowser =
          opts.browser === false || process.env.SALAI_LOGIN_NO_BROWSER === '1';
        if (!skipBrowser) {
          const opened = await openUrlInBrowser(device.verification_uri_complete);
          if (opened) {
            console.error('Opened in your default browser.');
          } else {
            console.error(
              'Could not open a browser automatically; open the URL printed above.',
            );
          }
        }

        const intervalMs = Math.max(1000, (device.interval || 5) * 1000);
        const deadline = Date.now() + (device.expires_in || 900) * 1000;

        while (Date.now() < deadline) {
          await sleep(intervalMs);
          const tokenRes = await fetch(`${apiBase}/api/cli/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: DEVICE_GRANT,
              device_code: device.device_code,
            }),
          });

          const body = (await tokenRes.json()) as Record<string, unknown>;

          if (tokenRes.ok) {
            const access = typeof body.access_token === 'string' ? body.access_token : '';
            const keyId = typeof body.api_key_id === 'string' ? body.api_key_id : '';
            if (!access) {
              throw new Error('login: missing access_token in response');
            }
            writeStoredCredentials({
              apiKey: access,
              apiBaseUrl: apiBase,
              mcpUrl,
              keyId,
              createdAt: new Date().toISOString(),
            });
            console.error(`Logged in. Credentials saved to ${getCredentialsPath()}`);
            return;
          }

          const err = typeof body.error === 'string' ? body.error : '';
          if (err === 'authorization_pending' || err === 'slow_down') {
            continue;
          }
          if (err === 'expired_token') {
            throw new Error('Login expired. Run salai login again.');
          }
          if (err === 'access_denied') {
            throw new Error('Login denied.');
          }

          const desc =
            typeof body.error_description === 'string' ? body.error_description : '';
          throw new Error(`login failed: ${err || tokenRes.status} ${desc}`.trim());
        }

        throw new Error('Login timed out waiting for browser authorization.');
      },
    );

  program
    .command('logout')
    .description('Remove ~/.config/salai/credentials.json; --revoke also deactivates the API key on the server')
    .option('--revoke', 'also deactivate this API key on the server')
    .action(async (opts: { revoke?: boolean }) => {
      const cfg = resolveConfig({});
      if (opts.revoke) {
        if (!cfg.apiKey) {
          throw new Error('No API key in environment or credentials file to revoke.');
        }
        const res = await fetch(`${cfg.apiBaseUrl}/api/cli/revoke`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`revoke: HTTP ${res.status} ${t.slice(0, 200)}`);
        }
      }
      const removed = removeStoredCredentials();
      if (removed) {
        console.error(`Removed ${getCredentialsPath()}`);
      } else {
        console.error('No credential file to remove.');
      }
    });

  program
    .command('whoami')
    .description('Print user/key metadata for the current API key (never the secret); use --json for scripts')
    .option('--json', 'machine-readable output')
    .action(async (opts: { json?: boolean }) => {
      const cfg = resolveConfig({});
      if (!cfg.apiKey) {
        throw new Error(
          'Not logged in. Run salai login or set SALAI_API_KEY.',
        );
      }
      const res = await fetch(`${cfg.apiBaseUrl}/api/cli/me`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`whoami: HTTP ${res.status} ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(`userId: ${data.userId ?? ''}`);
      console.log(`email: ${data.email ?? ''}`);
      console.log(`displayName: ${data.displayName ?? ''}`);
      console.log(`authType: ${data.authType ?? ''}`);
      if (data.keyName != null) console.log(`keyName: ${data.keyName}`);
      if (data.keyId != null) console.log(`keyId: ${data.keyId}`);
    });
}

/** Commander command names that must skip MCP startup banner */
export const AUTH_COMMAND_NAMES = new Set(['login', 'logout', 'whoami']);
