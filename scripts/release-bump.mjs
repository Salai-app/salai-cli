#!/usr/bin/env node
/**
 * Bump patch version from max(package.json, npm salai@next) and sync PACKAGE_VERSION.
 * Used by CI before publish; safe to run locally (dry-run: RELEASE_BUMP_DRY=1).
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const PKG_PATH = 'package.json';
const MCP_CLIENT_PATH = 'src/mcpClient.ts';

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function maxSemver(...versions) {
  return versions.reduce((best, v) => (compareSemver(v, best) > 0 ? v : best));
}

function incPatch(v) {
  const [major, minor, patch] = parseSemver(v);
  return `${major}.${minor}.${patch + 1}`;
}

function readNpmNextVersion() {
  try {
    return execSync('npm view salai@next version 2>/dev/null', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
const pkgVersion = pkg.version;
const npmNext = readNpmNextVersion();
const base = maxSemver(pkgVersion, npmNext || '0.0.0');
const next = incPatch(base);

if (process.env.RELEASE_BUMP_DRY === '1') {
  console.log(
    `Would bump salai to ${next} (base: max(package=${pkgVersion}, npm@next=${npmNext || '(none)'}) → ${base})`,
  );
  process.exit(0);
}

pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);

let mcp = readFileSync(MCP_CLIENT_PATH, 'utf8');
const replaced = mcp.replace(
  /export const PACKAGE_VERSION = '[^']+';/,
  `export const PACKAGE_VERSION = '${next}';`,
);
if (replaced === mcp) {
  throw new Error(`Could not update PACKAGE_VERSION in ${MCP_CLIENT_PATH}`);
}
writeFileSync(MCP_CLIENT_PATH, replaced);
console.log(`Bumped salai to ${next}`);
