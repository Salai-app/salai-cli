---
name: salai-cli
description: Israeli grocery shopping via the Salai CLI. Use when the user asks for the salai CLI, salai command line, or shell-based search, price comparison, price history (`salai history`), cart management, store discovery, or one-shot shopping-list quotes (`salai shopping-list`, alias `salai fulfill`). Prefer the salai-mcp skill when MCP tools are available; use this skill when only shell access is available.
homepage: https://app.salai.co.il
---

# Salai CLI Skill (Shell / Terminal)

Use the `salai` CLI to search Israeli grocery products, compare prices, manage carts, and (recommended) quote whole shopping lists in one call. All commands talk to `https://mcp.salai.co.il/mcp`.

Longer agent guidance: `docs/agent-spec-short.md` in this repository; full `docs/agent-spec.md` may live in the [SalAi monorepo](https://github.com/IdoZiv/SalAi).

## Prerequisites

- `salai` CLI installed: `npm i -g salai` or `npx salai <command>`
- `SALAI_API_KEY` set (or pass `--api-key`)
- **Selected store** is required for `search`, `autocomplete`, `cart`, and for `compare` / `prices` scope — **not** for `shopping-list` / `fulfill` (quote mode is request-scoped; no `SELECTED_STORE_REQUIRED`)

## CRITICAL: Always use `--json`

When calling `salai` as an agent, **always append `--json`** to every command. Parse structured JSON from the output.

## Commands Reference

### Shopping list (recommended — no selected store)

Resolves a shopping list, compares baskets across stores, returns ranked stores, per-item match types, promotions, and alternatives. Uses MCP tool `fulfill_shopping_list` (quote mode). CLI: `salai shopping-list` (alias `salai fulfill`). Higher token cost and stricter rate limits than search; handle `TOKEN_LIMIT_REACHED` and `RATE_LIMIT_EXCEEDED`.

```bash
# Inline list (comma-separated); Hebrew quantities supported in the text
salai shopping-list "חלב, לחם, ביצים" --json

salai shopping-list "פעמיים חלב, לחם" --json

# List file (newline-separated lines)
salai shopping-list --file ./list.txt --json

# Store universe: online_only (default) or all_active (explicit store IDs: salai call, not this subcommand)
salai shopping-list "חלב" --scope all_active --max-stores 5 --json

# Alternatives: same-brand substitutions only; or disable alternatives
salai shopping-list "חלב" --brand-strict --json
salai shopping-list "חלב" --no-alternatives --json
```

For **`scope.mode: explicit`** with a specific `stores[]` list, use the escape hatch — the `shopping-list` subcommand does not pass explicit store pairs:

```bash
salai call fulfill_shopping_list --args '{"rawList":"חלב","scope":{"mode":"explicit","stores":[{"retailerId":"...","storeId":"..."}]}}' --json
```

### Stores (no store selection required)

```bash
salai retailers --json               # List all retailers [{retailerId, name}]
salai stores --json                  # List all stores [{retailerId, storeId, retailerName, name}]
salai store --json                   # Show current selected store context
salai store set <retailerId> <storeId>  # Set selected store (no --json needed)
```

### Search (requires selected store)

```bash
salai search "<Hebrew query>" --json          # Semantic search, returns numbered products
salai autocomplete "<Hebrew query>" --json    # Fast text lookup
salai ac "<query>" --json                     # Alias for autocomplete
salai ac "<query>" --method semantic --json   # Semantic autocomplete fallback
```

**Search JSON output shape** (structuredContent):

```json
{
  "viewType": "numbered_products",
  "query": "חלב",
  "numberedProducts": [
    { "index": 1, "itemCode": "7290000042015", "itemName": "חלב שקית 3% תנובה", "price": 6.35, "displayPrice": "₪6.35" }
  ]
}
```

Extract `itemCode` from results for cart and price commands.

### Pricing (requires selected store for scope)

```bash
salai prices <itemCode> [<itemCode>...] --json     # Prices for specific items
salai compare <itemCode:qty> [<itemCode:qty>...] --json  # Compare across retailers
```

**Compare format**: `salai compare 7290000042015:2 7290019489443:1 --json`

### Price history (usually no selected store for `itemCode` / `--barcode`)

Time series from `price_history` (MCP `get_price_history`). **`--query`** may require a selected store when the server uses store-first mode.

- **Names / Hebrew:** use **`--query '…'`** — a bare positional is always **`itemCode`**, not a search string.
- **`DISAMBIGUATION_REQUIRED`:** repeat the **same** `--query` and scope and add **`--select N`**, **`--select-code`**, or **`--select-name`**.
- **`--json`:** use `salai --json history …` or `node dist/salai.js --json history …` when developing; see `docs/product-price-history.md` for `tsx` quirks.

```bash
salai history <itemCode> --json
salai --json history --barcode <code> --days 90 --online-only
salai --json history --query "חלב"
salai --json history --query "חלב" --select 2
salai history <itemCode> --retailer <rid> --store <sid> --json
```

Longer reference: `docs/product-price-history.md` in the salai-cli repository.

### Cart (requires selected store)

```bash
salai cart --json                              # Show current cart
salai cart add <itemCode> --json               # Add item (qty defaults to 1)
salai cart add <itemCode> --qty 3 --json       # Add with quantity
salai cart set-qty <itemCode> <quantity> --json # Set quantity (0 = remove)
salai cart remove <itemCode> --json            # Remove item
salai cart compare --json                      # Compare cart across stores
salai cart delete <cartId> --json              # Delete a cart
```

The `cart add` command auto-resolves the cart ID — no `--cart-id`.

### Recommendations

```bash
salai recommend <itemCode> --json    # Complementary product suggestions
salai rec <itemCode> --json          # Alias
```

### Low-level (escape hatch)

```bash
salai tools --json                                    # List all MCP tools
salai call <toolName> --args '{"key":"value"}' --json # Call any tool by name
```

## Workflow

### Shopping list in one call (preferred when quoting)

1. `salai shopping-list "<items>" --json` or `salai shopping-list --file path --json`
2. Parse ranked stores, line items, `tokenUsage` if present; respect rate limits before retrying

### Legacy granular cart workflow

1. **Check store**: `salai store --json` — if none, continue
2. **Set store**: `salai stores --json` → pick → `salai store set <retailerId> <storeId>`
3. **Search**: `salai search "חלב" --json` → `numberedProducts[].itemCode`
4. **Add to cart**: `salai cart add <itemCode> --json`
5. **Compare**: `salai cart compare --json`

### Price comparison without cart

1. `salai search "חלב" --json` → `itemCode`
2. `salai compare <itemCode>:1 --json`

## Store and scope behavior

| Commands | Behavior |
|---|---|
| `shopping-list` / `fulfill` | No selected store; scope from flags / tool args (`online_only`, `all_active`, or explicit via `salai call`) |
| `store`, `stores`, `retailers` | Work without a selected store |
| `search`, `autocomplete`, `cart *` | Require a selected store |
| `compare`, `prices` | Cross-store comparison (needs selected store for scope) |
| `history` | `itemCode` / `--barcode` usually need no store; `--query` may require selected store (store-first) |
| `recommend`, `tools` | Work without a selected store |

If no store is set, store-scoped commands return `status: "blocked"`, `errorCode: "SELECTED_STORE_REQUIRED"`. Use `salai store set` first — **unless** you are using `shopping-list` / `fulfill`, which does not use the selected-store context for quote mode.

## Error handling

- **No output / connection error** — check `SALAI_API_KEY` and network
- **`SELECTED_STORE_REQUIRED`** — `salai store set <retailerId> <storeId>` (not applicable to `shopping-list` / `fulfill`)
- **`TOKEN_LIMIT_REACHED`** / **`RATE_LIMIT_EXCEEDED`** — especially on shopping list quotes; back off, reduce frequency, or upgrade plan; read response `retryAfterMs` if present
- **`AUTH_REQUIRED`** — missing or invalid API key
- **`INVALID_INPUT`** — empty list, bad scope, etc.
- **Empty search results** — try `salai ac "<query>" --method semantic --json`
- **`DISAMBIGUATION_REQUIRED` on `history`** — same `--query` + scope + `--select` / `--select-code` / `--select-name` (`docs/product-price-history.md`)
- **Never log or expose the API key**
