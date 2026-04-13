# Product price history (`salai history`)

CLI surface for the Salai MCP tool **`get_price_history`**: time series from the `price_history` table (append-only price changes), with optional store scope, **`onlineOnly`**, summary stats, and name disambiguation.

**Canonical design notes** (schema, MCP contract, agent flows) live in the [SalAi monorepo](https://github.com/IdoZiv/SalAi) as [`docs/product-price-history-tool.md`](https://github.com/IdoZiv/SalAi/blob/main/docs/product-price-history-tool.md). This file is **CLI-focused**.

---

## How to run

| Method | Example |
|--------|---------|
| Installed / `npx` | `npx salai history 7290000042015 --json` |
| From repo (recommended for `--json` while developing) | `pnpm run build && node dist/salai.js history --query 'שמן זית' --json` |
| TypeScript dev | `pnpm run dev -- history --query 'שמן זית'` (human output; see **Global `--json` below**) |

**Auth:** `SALAI_API_KEY`, `salai login`, or `--api-key`. **Local API/MCP:** `SALAI_API_URL` (REST/login only) and **`SALAI_MCP_URL`** (where tools run); set both when testing against a dev backend.

### Global `--json` (Commander + `tsx`)

`--json` is a **root** option. With **`pnpm run dev`** (`tsx src/salai.ts`), a leading `--` before your args can make Commander treat `--json` as a subcommand (`unknown command '--json'`), and **`--json` after** `history` can be treated as extra positionals (`too many arguments`).

**Reliable patterns:**

- `node dist/salai.js --json history --query '…'`
- Or put `--json` immediately after the executable **without** an extra `--` before it (depends on how `tsx` forwards argv).

---

## Command

```bash
salai history [itemCode] [options]
```

Exactly **one** product selector:

| Selector | Example |
|----------|---------|
| Positional `itemCode` | `salai history 7290000042015 --json` — **digits/catalog code only** |
| `--barcode <code>` | `salai history --barcode 7290000042015 --json` |
| `--query <text>` | `salai history --query "חלב 3%" --json` — **required for Hebrew / product names** |

Do **not** pass a product name as the positional argument; the server will try to resolve it as `itemCode` and return `NOT_FOUND: Unknown itemCode in catalog.`

Agents should **always** pass **`--json`** when parsing output.

---

## Useful flags

| Flag | Maps to MCP | Notes |
|------|-------------|--------|
| `--retailer <id>` + `--store <id>` | `retailerId`, `storeId` | Both required together |
| `--online-only` | `onlineOnly: true` | Active online stores only |
| `--days <n>` | `days` | Lookback by **`processed_at`** (ingestion), default **365** on the server |
| `--limit <n>` | `limit` | Cap rows (e.g. 500) |
| `--select <n>` | `selectedOption` | After `DISAMBIGUATION_REQUIRED`, option **1–10** (`candidates[].option`) |
| `--select-code <code>` | `selectedItemCode` | Must match a candidate’s `itemCode` |
| `--select-name <name>` | `selectedItemName` | Must match **exactly** one candidate’s `itemName` (normalized spacing) |

---

## Disambiguation (`DISAMBIGUATION_REQUIRED`)

When **`--query`** matches several products, the first response has:

- `status`: `"DISAMBIGUATION_REQUIRED"`
- `candidates`: `[{ option, itemCode, itemName }, …]` (up to 10)
- `instruction`: reminds you to repeat scope fields

**Second call — pick exactly one** of:

1. **`--select <n>`** where `n` is `option` from the list (1–10).
2. **`--select-code <itemCode>`** from the list.
3. **`--select-name '<itemName>'`** — exact label from the list.

You **must** repeat the **same** **`--query`** string and the **same** scope you used the first time: **`--days`**, **`--online-only`**, **`--retailer` / `--store`**, **`--limit`**. Otherwise resolution may not match the same candidate set.

Example:

```bash
salai history --query 'שמן זית' --json
# → DISAMBIGUATION_REQUIRED + candidates

salai history --query 'שמן זית' --select 3 --json
# → OK with history for candidates[2]
```

If the option or code is wrong, you may get **`INVALID_SELECTION`** with `candidates` echoed again.

---

## Semantics (short)

- **`days`** filters on **`processed_at`** (when SalAi ingested the row), not **`price_update_time`** (retailer file timestamp). Each point still includes both times.
- **`dataSpanDays`** in JSON (when present) describes the inclusive UTC calendar span of **`price_update_time`** across returned rows and can exceed **`days`**.
- **Store-first mode**: For **`--query`**, the server may require a **selected store** (`SELECTED_STORE_REQUIRED`). Use `salai store set <retailerId> <storeId>` first. **`itemCode`** / **`--barcode`** usually do not need a selected store for history.

---

## Examples

```bash
# By item code (typical agent flow)
salai history 7290000042015 --json

# Shorter window, online stores only
salai history 7290000042015 --days 90 --online-only --json

# Name search → disambiguation → second call
salai history --query "חלב" --json
salai history --query "חלב" --select 2 --json

# One physical store
salai history 7290000042015 --retailer 7290027600007 --store 413 --json
```

Escape hatch (full MCP args):

```bash
salai call get_price_history --args '{"itemCode":"7290000042015","days":180}' --json
```

---

## JSON shape (success)

Structured content is **`price_history_chart`** with chart fields plus **`raw`** holding the tool payload (`status`, `dataPoints`, `summary`, `coverage`, `resolvedProduct`, `scope`, …). For errors / disambiguation, **`viewType`** is **`price_history`** with **`status`** and optional **`candidates`**.

Other useful statuses: **`NOT_FOUND`**, **`INVALID_SELECTION`**, **`blocked`** / **`SELECTED_STORE_REQUIRED`** (set store, retry).

---

## References

- SalAi: `docs/product-price-history-tool.md`, `packages/backend/src/mcp/tools/get_price_history.ts`
- Agent quick spec: `docs/agent-spec-short.md` in this repo
