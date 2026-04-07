/**
 * Local credential store for `salai login` (XDG-style path, 0600 file).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CREDENTIALS_VERSION = 1;

export interface StoredCredentials {
  version: typeof CREDENTIALS_VERSION;
  apiKey: string;
  apiBaseUrl: string;
  mcpUrl: string;
  keyId: string;
  createdAt: string;
}

export function getCredentialsPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg ? join(xdg, 'salai') : join(homedir(), '.config', 'salai');
  return join(base, 'credentials.json');
}

export function readStoredCredentials(): StoredCredentials | null {
  const p = getCredentialsPath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, 'utf8');
    const data = JSON.parse(raw) as Partial<StoredCredentials>;
    if (
      data.version !== CREDENTIALS_VERSION ||
      typeof data.apiKey !== 'string' ||
      typeof data.apiBaseUrl !== 'string' ||
      typeof data.mcpUrl !== 'string'
    ) {
      return null;
    }
    return {
      version: CREDENTIALS_VERSION,
      apiKey: data.apiKey,
      apiBaseUrl: data.apiBaseUrl.replace(/\/$/, ''),
      mcpUrl: data.mcpUrl.replace(/\/$/, ''),
      keyId: typeof data.keyId === 'string' ? data.keyId : '',
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    };
  } catch {
    return null;
  }
}

export function writeStoredCredentials(cred: Omit<StoredCredentials, 'version'>): void {
  const p = getCredentialsPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const payload: StoredCredentials = {
    version: CREDENTIALS_VERSION,
    ...cred,
  };
  writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

export function removeStoredCredentials(): boolean {
  const p = getCredentialsPath();
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}
