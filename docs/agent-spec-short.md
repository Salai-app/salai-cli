# Salai CLI Agent Quick Spec

- Use `salai` with `--json` for machine-readable output.
- Requires `SALAI_API_KEY`, or run `salai login` once (stores `~/.config/salai/credentials.json`).
- Store-scoped commands (`search`, `autocomplete`, `cart *`) require selected store.
- Prefer `salai shopping-list ... --json` for list-level "where should I buy?" tasks (alias: `salai fulfill`).
- On `SELECTED_STORE_REQUIRED`:
  1. `salai stores --json`
  2. `salai store set <retailerId> <storeId>`
  3. retry original command
- Extract product IDs from `numberedProducts[].itemCode`.
- Never print API keys or secrets.

## Auth (login / logout)

- **`salai login`** — Opens a browser flow (user code in terminal); stores credentials in `~/.config/salai/credentials.json`. Override API host with `SALAI_API_URL` when needed.
- **`salai logout`** — Deletes the local credential file. **`salai logout --revoke`** also deactivates that API key on the server.
- **`salai whoami`** — Safe identity check (`--json` for agents). Does not print the key.
- If `SALAI_API_KEY` or `MCP_API_KEY` is set, it overrides the credential file for resolution.

## Core commands

- `salai shopping-list "<item>" "<item>" ... --json`
- `salai store --json`
- `salai stores --json`
- `salai search "<query>" --json`
- `salai ac "<query>" --json`
- `salai compare <itemCode:qty>... --json`
- `salai cart add <itemCode> --json`
- `salai cart compare --json`

## Shopping list quick notes

- No selected store required (`shopping-list` / `fulfill`).
- Supports `--scope` (`online_only|all_active|explicit`) and `--max-stores`.
- Watch for structured errors: `AUTH_REQUIRED`, `TOKEN_LIMIT_REACHED`, `RATE_LIMIT_EXCEEDED`.
- Use re-quote pattern for edits: modify list client-side, call `salai shopping-list` again.
- MCP `fulfill_shopping_list` `rawList`: LLM line-split is on by default; set `llmRawListExtraction: false` for legacy parsing.
