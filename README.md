# salai

> Salai grocery intelligence CLI — search products, compare prices, and manage your cart from the terminal.

```bash
npx salai search "חלב"
npx salai retailers
npx salai cart add 7290019489443
```

## What's New in v0.1.6

- **Startup banner** (human output, TTY): Salai ASCII header with CLI version, **API KEY: (set)/(not set)**, and **Store/Retailer:** (`storeId / retailerId` from `get_my_store_context`). Omit with **`--no-banner`**, or use **`--compact-header`** for a single-line header.
- **No API key**: fails fast with a short message (no MCP “Streamable HTTP” / JSON error spam). Banner still shows **`API KEY: (not set)`** and **`Store/Retailer: (unavailable)`** when the banner runs.
- **`scripts/cli-banner-sketch.mjs`** — optional local prototype for banner layout (`node scripts/cli-banner-sketch.mjs`).

## Earlier

- **v0.1.5** — `salai shopping-list` alias for `salai fulfill`; README / agent docs alignment.

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

**Have the agent read `--help`** so it sees every flag and the extra notes we embed for automation.

1. **`salai --help`** — command list plus a short reminder to use `--json` and subcommand help.
2. **`salai <command> --help`** — all options for that command. Shopping lists: **`salai shopping-list --help`** (includes CLI vs full MCP tool, examples, billing errors).
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

### Option 1: Agent skill (recommended)

Skill source: [github.com/Salai-app/salai-cli](https://github.com/Salai-app/salai-cli) (`skills/salai-cli`).

```bash
npx skills add Salai-app/salai-cli
```

Uses [`npx skills`](https://github.com/vercel-labs/skills) (Vercel Labs). It detects your installed coding agents (OpenCode, Claude Code, Codex, Cursor, and [40+ more](https://github.com/vercel-labs/skills#supported-agents)) and installs the skill to the right location.

Install globally (available across all projects):

```bash
npx skills add Salai-app/salai-cli -g
```

Target a specific agent:

```bash
npx skills add Salai-app/salai-cli -a claude-code -g
```

### Option 2: CLI only

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
  --json                 Output raw JSON instead of formatted tables (also skips the banner)
  --no-banner            Hide the startup banner (human output only)
  --compact-header       One-line header instead of the full banner
  -v, --version          Print version
  -h, --help             Show help
```

`MCP_API_KEY` is also read if `SALAI_API_KEY` is unset (same as the CLI resolver).

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

### Shopping list (shopping-list / fulfill)

Resolves a list, compares baskets across stores, returns ranked stores (MCP `fulfill_shopping_list`). **Does not require a selected store.** Prefer **`salai shopping-list --help`** for the full agent-oriented help text.

```bash
salai shopping-list [items...]    # Inline list (comma-separated) or use --file (alias: salai fulfill)
  --scope <mode>                  # online_only (default) | all_active
  --max-stores <n>                # Cap stores compared (default 10)
  --file <path>                   # Newline-separated list file
  --brand-strict                  # alternatives.policy = same_brand
  --no-alternatives               # alternatives.enabled = false

# Explicit store lists and other MCP-only fields:
salai call fulfill_shopping_list --args '{"items":[...],"scope":{"mode":"explicit","stores":[...]}}' --json
```

Same command as `salai fulfill …` (legacy name).

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
| `SALAI_API_KEY` | Your Salai API key from Profile (primary) |
| `MCP_API_KEY` | Alternative env name for the API key if `SALAI_API_KEY` is unset |
| `SALAI_MCP_URL` | Override the MCP endpoint URL |
| `NO_COLOR` | Set to disable ANSI in the banner (when stdout is a TTY) |

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
