# salai

> Salai grocery intelligence CLI — search products, compare prices, and manage your cart from the terminal.

```bash
npx salai search "חלב"
npx salai retailers
npx salai cart add 7290019489443
```

## What's New in v0.1.4

- `salai fulfill` — one-call shopping list quotes (MCP `fulfill_shopping_list`)
- Richer `--help` (including `salai fulfill --help`) and README guidance for AI agents

## Agent Integration

AI agents should run Salai commands in JSON mode:

```bash
salai search "חלב" --json
```

See:

- `AGENTS.md`
- `docs/agent-spec-short.md`
- `docs/agents/`

## Using with AI agents

Same idea as [dev-browser’s agent workflow](https://github.com/SawyerHood/dev-browser?tab=readme-ov-file#using-with-ai-agents): **have the agent read `--help`** so it sees every flag and the extra notes we embed for automation.

1. **`salai --help`** — command list plus a short reminder to use `--json` and subcommand help.
2. **`salai <command> --help`** — all options for that command. Shopping lists: **`salai fulfill --help`** (includes CLI vs full MCP tool, examples, billing errors).
3. **`salai tools --json`** — tool names and schemas as returned by the live server.

For MCP fields that are not CLI flags (structured `items`, `scope.stores` with `mode: explicit`, `resolution.policy`, `alternatives.maxPerItem`, `llmRawListExtraction`, `includeDiagnostics`, etc.), use:

```bash
salai call fulfill_shopping_list --args '{"rawList":"חלב, לחם","scope":{"mode":"online_only","maxStores":5}}' --json
```

### Claude Code (optional)

To reduce permission prompts, pre-approve the CLI in `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "permissions": {
    "allow": ["Bash(salai *)", "Bash(npx salai *)"]
  }
}
```

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

### Fulfill (shopping list quote)

Resolves a list, compares baskets across stores, returns ranked stores (MCP `fulfill_shopping_list`). **Does not require a selected store.** Prefer **`salai fulfill --help`** for the full agent-oriented help text.

```bash
salai fulfill [items...]          # Inline list (comma-separated) or use --file
  --scope <mode>                  # online_only (default) | all_active
  --max-stores <n>                # Cap stores compared (default 10)
  --file <path>                   # Newline-separated list file
  --brand-strict                  # alternatives.policy = same_brand
  --no-alternatives               # alternatives.enabled = false

# Explicit store lists and other MCP-only fields:
salai call fulfill_shopping_list --args '{"items":[...],"scope":{"mode":"explicit","stores":[...]}}' --json
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
