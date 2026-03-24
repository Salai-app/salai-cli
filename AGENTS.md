# Agent Integration

For vendor-neutral behavior, follow:

- `docs/agent-spec-short.md`

Core rules:

- Use `salai ... --json`
- Handle `SELECTED_STORE_REQUIRED` by setting store and retrying
- Extract `itemCode` from `numberedProducts`
- Never output secrets (`SALAI_API_KEY`)
