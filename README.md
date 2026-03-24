# salai

> Salai grocery intelligence CLI — search products, compare prices, and manage your cart from the terminal.

```bash
npx salai search "חלב"
npx salai retailers
npx salai cart add 7290019489443
```

## What's New in v0.1.3

- Improved npm metadata and discoverability
- Added vendor-neutral and tool-specific AI agent integration docs
- Documented JSON-first usage for automation workflows

## Agent Integration

AI agents should run Salai commands in JSON mode:

```bash
salai search "חלב" --json
```

See:

- `AGENTS.md`
- `docs/agent-spec-short.md`
- `docs/agents/`

## Install

```bash
# Use directly with npx (no install needed)
npx salai <command>

# Or install globally
npm i -g salai
salai <command>
```

## Setup

```bash
export SALAI_API_KEY="your-api-key-here"   # add to ~/.zshrc or ~/.bashrc
```

Get your API key from the Salai app → **Profile → API Key → Generate**.

---

## Commands

### Global Options

```
salai [options] <command>

  -k, --api-key <key>   Salai API key (or SALAI_API_KEY env var)
  --url <url>            MCP endpoint URL (default: https://mcp.salai.co.il/mcp)
  --json                 Output raw JSON instead of formatted tables
  -v, --version          Print version
  -h, --help             Show help
```

### Search

```bash
salai search <query>              # Semantic product search (Hebrew)
  --limit <n>                     # Max results (default 20)
  --mode <fast|hybrid|ai>         # Search mode
  --store-scope <scope>           # selected_only | retailer_wide | all_limited

salai autocomplete <query>        # Fast autocomplete lookup
salai ac <query>                  # Alias
  --limit <n>                     # Max results (default 15)
  --method <text|semantic>        # Search method (default text)
```

### Pricing

```bash
salai prices <itemCode...>        # Get prices for item codes
  --stores <rid:sid,...>           # Limit to specific stores

salai compare <code:qty...>       # Compare across retailers
  --stores <rid:sid,...>           # Limit to specific stores

```

### Stores

```bash
salai stores                      # List all online stores
salai retailers                   # List all retailers
salai store                       # Show selected store context
salai store set <rid> <sid>       # Set your selected store
```

### Cart

```bash
salai cart                        # Show your current cart
salai cart show --cart-id <id>    # Show a specific cart

salai cart add <itemCode>         # Add item to cart
  --qty <n>                       # Quantity (default 1)
  --cart-id <id>                  # Cart ID (auto-resolved if omitted)

salai cart set-qty <code> <qty>   # Set quantity (0 = remove)
salai cart remove <itemCode>      # Remove item
salai cart compare                # Compare cart across stores
salai cart delete <cartId>        # Delete a cart
```

### Recommendations

```bash
salai recommend <itemCode>        # Complementary product suggestions
salai rec <itemCode>              # Alias
  --limit <n>                     # Max results (default 5)
```

### Low-Level

```bash
salai tools                       # List all available MCP tools
salai call <toolName>             # Call any tool by name
  --args '{"key": "value"}'       # JSON arguments
```

---

## Pipe-Friendly

Every command supports `--json` for composable pipelines:

```bash
salai search "חלב" --json | jq '.products[0].itemCode'
salai cart --json | jq '.items[].itemName'
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `SALAI_API_KEY` | Your Salai API key from Profile |
| `SALAI_MCP_URL` | Override the MCP endpoint URL |

---

## How It Works

```
Terminal / Script
      │  salai search "חלב"
      ▼
  salai CLI (commander.js)
      │  MCP callTool() over HTTPS
      ▼
  https://mcp.salai.co.il/mcp
```

The CLI connects to the same Salai MCP HTTP endpoint used by the MCP bridge, using the same API key and accessing the same 18+ tools.
