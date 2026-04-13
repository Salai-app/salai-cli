# Agent Integration

For vendor-neutral behavior, follow:

- `docs/agent-spec-short.md`

Core rules:

- Use `salai ... --json`
- Handle `SELECTED_STORE_REQUIRED` by setting store and retrying
- Extract `itemCode` from `numberedProducts`
- Price history: `salai history <itemCode> --json` or `--query` / `--barcode`; names require `--query` (not positional). On `DISAMBIGUATION_REQUIRED`, retry same `--query` + scope with `--select` / `--select-code` / `--select-name`. Prefer `salai --json history …` (see `docs/product-price-history.md`).
- Never output secrets (`SALAI_API_KEY`)
