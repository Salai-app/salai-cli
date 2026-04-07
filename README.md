# salai

> Salai grocery intelligence CLI — search products, compare prices, and manage your cart from the terminal.

```bash
npx salai search "חלב"
npx salai retailers
npx salai cart add 7290019489443
```

## What's New in v0.1.9

- **`salai login` / `logout` / `whoami`** — browser sign-in with a short user code; credentials saved under `~/.config/salai/credentials.json` (mode `0600`). Resolution order: `--api-key` → `SALAI_API_KEY` / `MCP_API_KEY` → credential file.
- **`salai logout --revoke`** — removes the local credential file and deactivates that API key on the server.

## What's New in v0.1.8

- **`salai --version` / banner** now match the npm package version (`PACKAGE_VERSION` kept in sync with `package.json`).
- **Bare `salai`** (no subcommand): no spurious `Error: (outputHelp)`; exits cleanly after showing usage (Commander `commander.help` handling).

## Earlier

- **v0.1.7** — Startup banner, `--no-banner` / `--compact-header`, Store/Retailer IDs in banner, no-key fail-fast, sketch script.
- **v0.1.5** — `salai shopping-list` alias for `salai fulfill`; README / agent docs alignment.

## Install

```bash
# Run without installing
npx salai <command>

# Or install globally
npm i -g salai
salai <command>
```

### Agent skill (optional)

If your coding agent supports [Vercel Skills](https://github.com/vercel-labs/skills), you can install the Salai CLI skill from the repo ([`skills/salai-cli`](https://github.com/Salai-app/salai-cli/tree/main/skills/salai-cli)):

```bash
npx skills add Salai-app/salai-cli
```

Global install (all projects):

```bash
npx skills add Salai-app/salai-cli -g
```

Target one agent, e.g. Claude Code:

```bash
npx skills add Salai-app/salai-cli -a claude-code -g
```

`npx skills` detects supported agents and copies the skill to the right config location.

## Setup

### Browser sign-in

```bash
salai login
# Complete sign-in in the browser using the user code shown in the terminal
salai whoami
```

Use `SALAI_API_URL` when the API is not production (default `https://api.salai.co.il`). Example:

```bash
SALAI_API_URL=https://your-api-host salai login
```

`--no-browser` prints the URL only; `SALAI_LOGIN_NO_BROWSER=1` does the same. See **Auth** under Commands.

### API key in the environment

```bash
export SALAI_API_KEY="your-api-key-here"   # e.g. in ~/.zshrc or ~/.bashrc
```

Create a key in the Salai app → **Profile → API Key → Generate**, or use **`salai login`** to create a CLI-specific key.

---

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

---

## Commands

### Global Options

```
salai [options] <command>

  -k, --api-key <key>   Salai API key (or SALAI_API_KEY env var)
  --json                 Output raw JSON instead of formatted tables (also skips the banner)
  --no-banner            Hide the startup banner (human output only)
  --compact-header       One-line header instead of the full banner
  -v, --version          Print version
  -h, --help             Show help
```

`MCP_API_KEY` is also read if `SALAI_API_KEY` is unset (same as the CLI resolver).

### Auth

| Command | What it does |
|---------|----------------|
| **`salai login`** | Starts a device session; open the printed URL, sign in, enter the user code; on success writes `~/.config/salai/credentials.json`. |
| **`salai logout`** | Deletes the local credential file. With **`--revoke`**, also deactivates that API key on the server (Bearer must be the key you want revoked). |
| **`salai whoami`** | Calls the API with your current key and prints user id and key metadata (never the secret). Use **`--json`** for machines. |

```bash
salai login [--no-browser] [--name <label>]
salai logout [--revoke]
salai whoami [--json]
```

| Variable | Purpose |
|----------|---------|
| `SALAI_API_KEY` | API key (optional if credential file exists) |
| `SALAI_LOGIN_NO_BROWSER` | Set to `1` to skip opening the browser during `salai login` (same idea as `--no-browser`) |

**Advanced (custom MCP/API hosts)** — only for non-production or self-hosted backends: `SALAI_MCP_URL` (MCP HTTP URL), `SALAI_API_URL` (REST origin for login / whoami / revoke), or `salai login --api-url <url> --mcp-url <url>`.

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
| `SALAI_LOGIN_NO_BROWSER` | Set to `1` to skip opening a browser during `salai login` |
| `NO_COLOR` | Set to disable ANSI in the banner (when stdout is a TTY) |

### Advanced (custom hosts)

| Variable | Description |
|---|---|
| `SALAI_MCP_URL` | MCP HTTP URL (default: production) |
| `SALAI_API_URL` | REST API origin for `login` / `whoami` / `logout --revoke` (default: production) |

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
