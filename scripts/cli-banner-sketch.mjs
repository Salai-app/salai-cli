#!/usr/bin/env node
// Prototype: logo rail + status column + mini table. Run: node scripts/cli-banner-sketch.mjs
const d = (s) => `\x1b[2m${s}\x1b[0m`, b = (s) => `\x1b[1m${s}\x1b[0m`;
const vis = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - vis(s).length));
// FIGlet font "small" — `npx figlet Salai -f small`
const L = [
  '  ___       _      _ ',
  ' / __| __ _| |__ _(_)',
  ' \\__ \\/ _` | / _` | |',
  ' |___/\\__,_|_\\__,_|_|',
  '                     ',
];
const R = [b('CLI'), 'v0.1.8', 'API KEY: (set)', 'Store/Retailer: 413 / 7290027600007', d('cwd: ' + process.cwd())];
L.forEach((ln, i) => console.log(pad(ln, 24) + d('│ ') + R[i]));
const w = [10, 28];
const row = (a, c) => d('│') + ' ' + pad(a, w[0]) + ' ' + d('│') + ' ' + pad(c, w[1]) + ' ' + d('│');
console.log('\n' + d('┌' + '─'.repeat(w[0] + 2) + '┬' + '─'.repeat(w[1] + 2) + '┐'));
console.log(row(b('Field'), b('Value')));
console.log(d('├' + '─'.repeat(w[0] + 2) + '┼' + '─'.repeat(w[1] + 2) + '┤'));
console.log(row('version', '0.1.8'));
console.log(row('ids', '413 / 7290027600007'));
console.log(d('└' + '─'.repeat(w[0] + 2) + '┴' + '─'.repeat(w[1] + 2) + '┘'));
