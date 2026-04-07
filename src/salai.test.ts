import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'salai.js');
const TIMEOUT = 30_000;

const KNOWN_ITEM_CODE = '7290000042015'; // חלב שקית 3% תנובה

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function run(
  args: string[],
  envOverrides?: Record<string, string | undefined>,
): Promise<RunResult> {
  const env = { ...process.env, ...envOverrides };
  try {
    const { stdout, stderr } = await execFileP('node', [CLI, ...args], {
      env,
      timeout: TIMEOUT,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

function parseJson(stdout: string): any {
  const trimmed = stdout.trim();
  assert.ok(trimmed.length > 0, 'Expected non-empty stdout');
  return JSON.parse(trimmed);
}

// ---------------------------------------------------------------------------
// Negative cases — no valid API key needed
// ---------------------------------------------------------------------------

describe('negative: no API key', () => {
  it('should error when no API key from env or credential file', async () => {
    const emptyConfig = mkdtempSync(join(tmpdir(), 'salai-cli-no-key-'));
    try {
      const r = await run(['retailers', '--json'], {
        XDG_CONFIG_HOME: emptyConfig,
        SALAI_API_KEY: '',
        MCP_API_KEY: '',
      });
      assert.notEqual(r.exitCode, 0, 'should exit non-zero');
      const combined = r.stderr + r.stdout;
      assert.ok(
        /api.key|SALAI_API_KEY|login|unauthorized|error/i.test(combined),
        `expected API key error, got: ${combined.slice(0, 300)}`,
      );
    } finally {
      rmSync(emptyConfig, { recursive: true, force: true });
    }
  });

  it('should error with an invalid API key', async () => {
    const r = await run(['retailers', '--json'], {
      SALAI_API_KEY: 'bad-key-that-does-not-exist-xxx',
    });
    assert.notEqual(r.exitCode, 0, 'should exit non-zero');
  });
});

describe('negative: bad arguments', () => {
  it('should error when search query is missing', async () => {
    const r = await run(['search']);
    assert.notEqual(r.exitCode, 0);
    const combined = r.stderr + r.stdout;
    assert.ok(
      /missing|required|argument/i.test(combined),
      `expected missing argument error, got: ${combined.slice(0, 300)}`,
    );
  });

  it('should error on unknown command', async () => {
    const r = await run(['nonexistent-command-xyz']);
    assert.notEqual(r.exitCode, 0);
  });

  it('should error when call --args is not valid JSON', async () => {
    const r = await run(['call', 'get_retailers', '--args', 'not-json!!!']);
    assert.notEqual(r.exitCode, 0);
    const combined = r.stderr + r.stdout;
    assert.ok(
      /json/i.test(combined),
      `expected JSON parse error, got: ${combined.slice(0, 300)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Meta commands
// ---------------------------------------------------------------------------

describe('meta', () => {
  it('--help should print usage', async () => {
    const r = await run(['--help']);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes('salai'), 'help should mention salai');
    assert.ok(r.stdout.includes('search'), 'help should list search command');
  });

  it('--version should print version', async () => {
    const r = await run(['--version']);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('tools --json should list available tools', async () => {
    const r = await run(['tools', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const tools = parseJson(r.stdout);
    assert.ok(Array.isArray(tools), 'tools should be an array');
    assert.ok(tools.length > 0, 'should have at least one tool');
    assert.ok(
      tools.some((t: any) => t.name === 'search_products'),
      'should include search_products tool',
    );
  });
});

// ---------------------------------------------------------------------------
// Store commands
// ---------------------------------------------------------------------------

describe('stores', () => {
  it('retailers --json should return an array', async () => {
    const r = await run(['retailers', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    const retailers = data?.retailers ?? data;
    assert.ok(Array.isArray(retailers), 'retailers should be an array');
    assert.ok(retailers.length > 0, 'should have at least one retailer');
    const first = retailers[0];
    assert.ok(first.retailerId || first.id, 'retailer should have an id');
  });

  it('stores --json should return an array of stores', async () => {
    const r = await run(['stores', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    const stores = data?.stores ?? data;
    assert.ok(Array.isArray(stores), 'stores should be an array');
    assert.ok(stores.length > 0, 'should have at least one store');
  });

  it('store --json should show current context', async () => {
    const r = await run(['store', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'store context should not be null');
  });

  it('store set should change the selected store', async () => {
    // Set to a known store (Shufersal Online)
    const r = await run(['store', 'set', '7290027600007', '413']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Search commands (require selected store — set above)
// ---------------------------------------------------------------------------

describe('search', () => {
  before(async () => {
    await run(['store', 'set', '7290027600007', '413']);
  });

  it('search --json should return numbered products', async () => {
    const r = await run(['search', 'חלב', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    const products = data?.numberedProducts ?? data?.products ?? data;
    assert.ok(Array.isArray(products), 'should return a products array');
    assert.ok(products.length > 0, 'should return at least one product');
    const first = products[0];
    assert.ok(first.itemCode, 'product should have itemCode');
    assert.ok(first.itemName, 'product should have itemName');
  });

  it('autocomplete --json should return products', async () => {
    const r = await run(['autocomplete', 'חלב', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    const products =
      data?.numberedProducts ?? data?.products ?? (Array.isArray(data) ? data : null);
    assert.ok(Array.isArray(products), 'should return a products array');
    assert.ok(products.length > 0, 'should return at least one product');
  });

  it('ac alias should work the same as autocomplete', async () => {
    const r = await run(['ac', 'חלב', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'ac should return data');
  });

  it('ac --method semantic should return products', async () => {
    const r = await run(['ac', 'חלב', '--method', 'semantic', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'semantic autocomplete should return data');
  });

  it('search with --limit should respect the limit', async () => {
    const r = await run(['search', 'חלב', '--limit', '3', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    const products = data?.numberedProducts ?? data?.products ?? data;
    assert.ok(Array.isArray(products), 'should be an array');
    assert.ok(products.length <= 3, `expected <=3 products, got ${products.length}`);
  });
});

// ---------------------------------------------------------------------------
// Price commands
// ---------------------------------------------------------------------------

describe('prices', () => {
  it('prices --json should return price data for a known item', async () => {
    const r = await run(['prices', KNOWN_ITEM_CODE, '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return price data');
  });

  it('compare --json should return store comparison', async () => {
    const r = await run(['compare', `${KNOWN_ITEM_CODE}:1`, '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return comparison data');
    const retailers = data?.retailers ?? data?.stores ?? data?.storeComparisons;
    if (Array.isArray(retailers)) {
      assert.ok(retailers.length > 0, 'should compare across at least one retailer');
    }
  });

});

// ---------------------------------------------------------------------------
// Cart commands (sequential: add → show → set-qty → remove)
// ---------------------------------------------------------------------------

describe('cart', { concurrency: false }, () => {
  const testItemCode = KNOWN_ITEM_CODE;

  before(async () => {
    await run(['store', 'set', '7290027600007', '413']);
  });

  it('cart --json should return cart overview', async () => {
    const r = await run(['cart', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data?.viewType === 'cart_overview' || data?.items || data?.raw, 'should be a cart');
  });

  it('cart add should add an item', async () => {
    const r = await run(['cart', 'add', testItemCode, '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return cart after add');
    const items = data?.items ?? data?.raw?.items;
    if (Array.isArray(items)) {
      assert.ok(
        items.some((i: any) => i.itemCode === testItemCode),
        'added item should appear in cart',
      );
    }
  });

  it('cart set-qty should update quantity', async () => {
    const r = await run(['cart', 'set-qty', testItemCode, '2', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return cart after set-qty');
    const items = data?.items ?? data?.raw?.items;
    if (Array.isArray(items)) {
      const item = items.find((i: any) => i.itemCode === testItemCode);
      assert.ok(item, 'item should still be in cart');
      assert.equal(item.quantity, 2, 'quantity should be 2');
    }
  });

  it('cart remove should remove the item', async () => {
    const r = await run(['cart', 'remove', testItemCode, '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return cart after remove');
  });

  it('cart compare --json should compare across stores', async () => {
    const r = await run(['cart', 'compare', '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return comparison data');
  });
});

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

describe('recommend', () => {
  it('recommend --json should return suggestions', async () => {
    const r = await run(['recommend', KNOWN_ITEM_CODE, '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'should return recommendation data');
    const recs = data?.recommendations ?? data?.numberedProducts ?? data;
    if (Array.isArray(recs)) {
      assert.ok(recs.length > 0, 'should have at least one recommendation');
    }
  });

  it('rec alias should work', async () => {
    const r = await run(['rec', KNOWN_ITEM_CODE, '--json']);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'rec alias should return data');
  });
});

// ---------------------------------------------------------------------------
// Generic call command
// ---------------------------------------------------------------------------

describe('call', () => {
  it('call get_retailers --json should return retailers', async () => {
    const r = await run([
      'call',
      'get_retailers',
      '--args',
      '{}',
      '--json',
    ]);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'call should return data');
  });

  it('call with args should pass them through', async () => {
    const r = await run([
      'call',
      'autocomplete_products',
      '--args',
      JSON.stringify({ query: 'חלב', limit: 2 }),
      '--json',
    ]);
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    const data = parseJson(r.stdout);
    assert.ok(data != null, 'call with args should return data');
  });
});
