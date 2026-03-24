---
name: salai-cli
description: Israeli grocery shopping via the Salai CLI. Use when the user asks to use the salai CLI, salai command line, or when you need shell-based product search, price comparison, cart management, and store discovery. Prefer the salai-mcp skill when MCP tools are available; use this skill when only shell access is available.
homepage: https://app.salai.co.il
---

# Salai CLI Skill (Shell / Terminal)

Use the `salai` CLI to search Israeli grocery products, compare prices, and manage shopping carts from the terminal. All commands talk to `https://mcp.salai.co.il/mcp`.

## Prerequisites

- `salai` CLI must be installed: `npm i -g salai`
- `SALAI_API_KEY` environment variable must be set (or pass `--api-key`)
- A store must be selected before search/cart commands work

## CRITICAL: Always use `--json`

When calling `salai` as an agent, **always append `--json`** to every command. This outputs machine-readable JSON instead of formatted tables. Parse the JSON output to extract data.

## Commands Reference

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

Extract `itemCode` from results to use with cart and price commands.

### Pricing (requires selected store for scope)

```bash
salai prices <itemCode> [<itemCode>...] --json     # Prices for specific items
salai compare <itemCode:qty> [<itemCode:qty>...] --json  # Compare across retailers
```

**Compare format**: `salai compare 7290000042015:2 7290019489443:1 --json`

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

The `cart add` command auto-resolves the cart ID - no need to pass `--cart-id`.

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

### Standard cart workflow

1. **Check store**: `salai store --json` - if no store is set, proceed to step 2
2. **Set store**: `salai stores --json` -> pick a store -> `salai store set <retailerId> <storeId>`
3. **Search**: `salai search "חלב" --json` -> extract `itemCode` from `numberedProducts[].itemCode`
4. **Add to cart**: `salai cart add <itemCode> --json`
5. **Compare**: `salai cart compare --json` - find the cheapest store

### Price comparison (no cart needed)

1. `salai search "חלב" --json` -> get `itemCode`
2. `salai compare <itemCode>:1 --json` -> see prices across retailers

## Store-first behavior

| Commands | Behavior |
|---|---|
| `store`, `stores`, `retailers` | Work without a selected store |
| `search`, `autocomplete`, `cart *` | Require a selected store |
| `compare`, `prices` | Cross-store comparison (needs selected store for scope) |
| `recommend`, `tools` | Work without a selected store |

If no store is set, store-scoped commands return `status: "blocked"`, `errorCode: "SELECTED_STORE_REQUIRED"`. When you see this, call `salai store set` first.

## Error handling

- **No output / connection error** - check `SALAI_API_KEY` is set and valid
- **`SELECTED_STORE_REQUIRED`** - run `salai store set <retailerId> <storeId>` first
- **Empty search results** - try `salai ac "<query>" --method semantic --json` as fallback
- **Never log or expose the API key in output**
