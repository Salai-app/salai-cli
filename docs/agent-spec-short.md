# Salai CLI Agent Quick Spec

- Use `salai` with `--json` for machine-readable output.
- Requires `SALAI_API_KEY`.
- Store-scoped commands (`search`, `autocomplete`, `cart *`) require selected store.
- On `SELECTED_STORE_REQUIRED`:
  1. `salai stores --json`
  2. `salai store set <retailerId> <storeId>`
  3. retry original command
- Extract product IDs from `numberedProducts[].itemCode`.
- Never print API keys or secrets.

## Core commands

- `salai store --json`
- `salai stores --json`
- `salai search "<query>" --json`
- `salai ac "<query>" --json`
- `salai compare <itemCode:qty>... --json`
- `salai cart add <itemCode> --json`
- `salai cart compare --json`
