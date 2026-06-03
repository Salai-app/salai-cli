# CLI login: short-lived access tokens + refresh (design)

This document describes how the Salai CLI **could** evolve from storing a single long-lived bearer secret in `credentials.json` to **short-lived access tokens** plus a **refresh token**, with explicit assumptions about backend behavior. It is a **design spec** plus a **full implementation plan** (§ [Full implementation plan](#full-implementation-plan-salai-backend--salai-cli)) covering `SalAi/packages/backend` and `salai-cli`. The server and CLI must be implemented and deployed together, or with backward-compatible fallbacks (see rollout).

## Goals

- Reduce blast radius if `credentials.json` leaks: stolen material should stop working quickly or be detectable via rotation.
- Keep **good UX**: no extra prompts beyond today’s device login; refresh should be automatic and invisible during normal use.
- Stay compatible with **Bearer** `Authorization` headers for MCP and REST (no protocol change on the wire beyond token lifetime).

## Non-goals

- OS keychain integration (separate effort; can stack on top of this design).
- Changing the device-authorization user experience (still “open link, approve, CLI polls”).

## Current behavior (baseline)

Today the CLI:

1. Starts device flow: `POST /api/cli/device`.
2. Polls: `POST /api/cli/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` and `device_code`.
3. On success, persists JSON at `~/.config/salai/credentials.json` (mode `0600`) including `apiKey` set from `access_token` in the response.
4. Sends `Authorization: Bearer <apiKey>` to MCP and REST (`whoami`, `revoke`, etc.).

See `src/commands/auth.ts` and `src/credentials.ts`.

## Assumptions about the backend

These are **intentional assumptions** so the CLI team can implement against a stable contract. Adjust names/TTLs as needed, but keep the semantics.

### A1. Token roles


| Token         | Lifetime         | Purpose                                            | Stored on disk (CLI)        |
| ------------- | ---------------- | -------------------------------------------------- | --------------------------- |
| Access token  | Short (e.g. 30m) | Sent as `Authorization: Bearer …` on API/MCP calls | Optionally (see § Storage)  |
| Refresh token | Long (e.g. 180d) | Only used to obtain new access tokens              | Yes (unless keychain later) |


The access token may be a signed JWT or opaque string; the CLI treats it as an opaque bearer secret.

### A2. Device flow response (initial grant)

After the user completes device authorization, `POST /api/cli/token` (device grant) returns **JSON** including at least:

- `access_token` — short-lived access token.
- `refresh_token` — long-lived refresh token (high entropy, server-side revocable).
- `expires_in` — seconds until `access_token` expires (integer).
- `token_type` — optional; if present, `Bearer` for access token usage.

Existing fields such as `api_key_id` (CLI maps to `keyId`) may remain for revocation and display.

**Optional but recommended:** `refresh_expires_in` — seconds until refresh token expires, so the CLI can warn before forced re-login.

### A3. Refresh grant

The same endpoint `POST /api/cli/token` accepts a **second grant type** (OAuth-style), for example:

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh token>"
}
```

**Successful response** (same shape as device grant success):

- New `access_token`, new `expires_in`.
- **Non-rotating refresh token (chosen for simplicity):** return the same `refresh_token` value (or omit it) on refresh. If the server does rotate for internal reasons, the CLI should still accept and persist a new `refresh_token`, but rotation is not required by this design.

**Error responses** (OAuth-style `error` field in JSON body):

- `invalid_grant` — refresh unknown, revoked, or expired → CLI deletes local credentials and tells user to run `salai login`.
- `invalid_request` — malformed body → CLI bug or version skew; surface error.

HTTP status codes should be consistent (e.g. 400 for `invalid_grant`); the CLI should key off `error` when present.

### A4. Authorization on APIs

- **MCP and REST** accept the **access token** in `Authorization: Bearer …`.
- **Refresh token** must **not** be accepted as a bearer on product APIs (only on `/api/cli/token`).

### A5. Revocation

`POST /api/cli/revoke` should invalidate the **refresh session** (and all derived access tokens), not only the current access token.

**Assumption:** The CLI sends `Authorization: Bearer <access_token>` as today **or** the backend also accepts `refresh_token` in a dedicated field for revoke when access is already expired. Prefer: accept **either** bearer access **or** JSON body `{ "refresh_token": "…" }` so `salai logout --revoke` still works if access expired minutes ago.

### A6. `GET /api/cli/me` (`whoami`)

Continues to work with a **valid access token**. If the server returns `401` with a machine-readable hint, the CLI refreshes once and retries (see § Refresh orchestration).

### A7. `SALAI_API_KEY` and `--api-key`

Environment or flag overrides are assumed to supply a **long-lived API key** (current behavior) **or** an access token. Document server behavior:

- **Requirement (backward compatibility):** long-lived API keys (including keys already issued) **must continue to work** for CI/scripts and power users. These keys do not participate in refresh and should keep today’s “just a Bearer token” behavior.
- **Requirement (avoid breaking scripts):** `SALAI_API_KEY` / `--api-key` must not become “short-lived access tokens only”. If the backend ever issues short-lived tokens in these paths, scripts will break unless they implement refresh, which is out of scope. Therefore **CLI file login** uses refresh; **env/flag keys** remain long-lived opaque keys.

## Credential file schema (CLI)

Bump `CREDENTIALS_VERSION` (e.g. to `2`) when introducing refresh fields.

**Proposed stored shape** (JSON on disk, still `0600` / dir `0700`):

```json
{
  "version": 2,
  "apiBaseUrl": "https://api.salai.co.il",
  "mcpUrl": "https://mcp.salai.co.il/mcp",
  "keyId": "…",
  "createdAt": "2026-04-16T12:00:00.000Z",
  "refreshToken": "…",
  "accessToken": "…",
  "accessExpiresAt": "2026-04-16T12:15:00.000Z"
}
```

**Fields:**

- `refreshToken` — required for refresh-grant login.
- `accessToken` + `accessExpiresAt` (ISO 8601) — optional cache to avoid refresh on every process start; can be omitted and refreshed on first 401 if the CLI prefers minimal disk exposure for access tokens.

**Security note:** Storing `accessToken` on disk reduces how often it appears in memory-only paths but reintroduces a second bearer in the file. A reasonable compromise is: **store refresh only** + always refresh on startup if access not in memory; or **store both** for fewer refresh calls and better offline-ish behavior until expiry. Pick one policy and document it.

## Refresh orchestration (CLI runtime)

Centralize in one small module (e.g. `getValidAccessToken()` used by `resolveConfig` or a thin async wrapper):

1. If `SALAI_API_KEY` / `--api-key` is set → use it as today (no refresh).
2. Else read `credentials.json`:
  - If `version === 1` (only `apiKey`) → treat as legacy long-lived token until user re-logins or server forces obsolescence.
  - If `version >= 2`:
    - If cached `accessToken` exists and `accessExpiresAt` is **in the future** beyond a skew margin (e.g. 60s) → return `accessToken`.
    - Else call refresh grant with `refreshToken`; on success persist new tokens (and new refresh if rotated); return new `accessToken`.
3. On any **401** from REST/MCP when using a v2 access token: **once** per command, try refresh + retry the original request (avoid infinite loops).

**Concurrency:** Multiple parallel CLI processes might refresh simultaneously. Acceptable if the server supports refresh rotation with a grace period; otherwise use a simple file lock (`fs.open` with `wx` lockfile) or “best effort last write wins” and tolerate one `invalid_grant` → user re-login.

With **non-rotating** refresh tokens, concurrency is simpler: multiple processes can refresh without invalidating each other’s refresh credentials (subject to rate limits).

## `salai login`

Unchanged UX. On successful device poll:

- Persist v2 credentials with `refreshToken`, `accessToken`, `accessExpiresAt`, and existing metadata.

## `salai logout` / `--revoke`

- **Without `--revoke`:** delete local file (unchanged).
- **With `--revoke`:** If access is missing/expired, send `refresh_token` in body per § A5; else bearer access. Then delete local file.

## `salai whoami` and other commands

All code paths that need an API key should obtain a **valid access token** via the orchestration layer (async), not read `apiKey` from disk directly — except for env override and v1 legacy file.

## Migration and backward compatibility

This project **must keep backward compatibility** for existing users and automations.

1. **Credential file v1 support:** CLI must continue to read and use `credentials.json` v1 (`apiKey`) as a long-lived bearer token, with no refresh behavior required. Treat it as “legacy long-lived key” until the user explicitly runs `salai login` again (or server-side revocation causes 401).
2. **Long-lived API keys via env/flag:** CLI must continue to accept `SALAI_API_KEY` / `--api-key` long-lived keys exactly as today. This is the supported path for CI/scripts and must not be migrated to refresh.
3. **Server compatibility:** server must continue accepting long-lived bearer keys issued previously (including the v1 stored `apiKey` values and `SALAI_API_KEY` values). Adding refresh must be additive; do not require refresh for legacy keys.
4. **Opt-in upgrade:** next `salai login` overwrites the local file with v2 refresh-based credentials. If the server cannot issue refresh tokens yet, `salai login` should continue issuing a long-lived key (status quo) rather than failing.

## Testing checklist (for implementation)

- Login writes v2; subsequent command uses access without extra network if not expired.
- Force expiry (short TTL in dev): next command refreshes transparently.
- Revoked refresh: refresh returns `invalid_grant`; CLI clears file and prints “Run `salai login`”.
- `logout --revoke` with expired access still revokes via refresh body (if implemented).
- `SALAI_API_KEY` bypasses refresh entirely.
- Parallel two-process refresh with rotation policy (if strict rotation).

## Full implementation plan (SalAi backend + salai-cli)

This section turns the assumptions above into an actionable, cross-repo checklist. Repo roots: `**SalAi`** (monorepo) and `**salai-cli**`.

### Design choice: access token shape and middleware routing

Today `verifyToken` tries Firebase, then validates the bearer as an **API key hash** in `mcp_api_keys`. Short-lived access tokens **must not** go through the API-key path by accident (401 loops, wrong semantics).

**Recommendation:**

- **Access token:** signed JWT (or similar) with a **distinct prefix**, e.g. `sat_<jwt>`, so middleware can branch before API-key hashing.
- **Refresh token:** high-entropy opaque string with prefix, e.g. `srt_<secret>`; store **only a hash** server-side (same pattern as API keys: salt/pepper + SHA-256).

The CLI continues to treat `access_token` as an opaque bearer string (JWT bytes after prefix, or whole string—pick one convention and document it in code comments).

### Backend (`SalAi/packages/backend`)

#### 1. Persistence: refresh sessions

Add a table, e.g. `cli_refresh_sessions`, minimally:


| Column                     | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `id`                       | UUID primary key                                                                  |
| `user_id`                  | Firebase UID                                                                      |
| `api_key_id`               | FK-style reference to `mcp_api_keys.id` (CLI key row created at device authorize) |
| `refresh_token_hash`       | Hash of refresh secret (never store plaintext)                                    |
| `created_at`, `expires_at` | Refresh lifetime                                                                  |
| `revoked_at`               | Nullable; set on revoke                                                           |


Index `refresh_token_hash` for refresh grant lookup. Optional: `last_used_at` for audit and rate limiting.

#### 2. Device completion → issue refresh + short access

Today `authorizeDeviceWithUserCode` creates a CLI row in `mcp_api_keys` and escrows the **long-lived** key plaintext for one-time retrieval; `pollDeviceToken` returns that as `access_token`.

**Change:**

- Still create the `mcp_api_keys` row (identity, `whoami`, rate limits, revoke-by-key-id).
- On successful poll, **mint** a short-lived **access** token bound to that key/session, create a **refresh session** row, return JSON per § A2 (`refresh_token`, `expires_in`, etc.). The long-lived secret can remain server-side only (not returned to CLI) once refresh is live—or keep returning it temporarily behind a feature flag during migration (prefer not; dual secrets complicate the model).

**Primary files:** `src/services/cliDeviceAuthService.ts`, `src/controllers/cliAuthController.ts`.

#### 3. `POST /api/cli/token`: refresh grant

Extend `CliAuthController.postToken` to accept `grant_type=refresh_token` and `refresh_token`, validate hash, check `revoked_at` / `expires_at`, mint new access token + `expires_in`, return same shape as device success (§ A3).

**Primary file:** `src/controllers/cliAuthController.ts` (delegate to a small service module if the controller grows).

#### 4. `authMiddleware.verifyToken`: accept access tokens

After Firebase verification fails, **before** `validateApiKey`:

- If bearer has the access-token prefix (e.g. `sat_`), verify JWT (signature, `exp`, issuer/audience claims), load session/key metadata, attach `req.user`, `req.authType`, `req.apiKeyAuth` consistently with API-key auth so existing routes (`/api/cli/me`, MCP) behave the same.

Consider a short TTL cache (similar to API key cache) to avoid DB hits on every request, with revocation clearing cache entries.

**Primary file:** `src/middleware/authMiddleware.ts`.

#### 5. `POST /api/cli/revoke`: session + optional body refresh

Implement § A5: invalidate the **refresh session** (and treat derived access as dead), and deactivate the linked `mcp_api_keys` row if that matches product intent. Accept:

- `Authorization: Bearer <access_token>` or long-lived API key, **or**
- JSON body `{ "refresh_token": "…" }` when access is expired (unauthenticated route variant or dedicated branch inside controller).

**Primary files:** `src/controllers/cliAuthController.ts`, `src/routes/cliAuthRoutes.ts` (may need to relax `requireAuth` for refresh-body-only revoke—design carefully to avoid open relay).

#### 6. Rate limits and abuse

Implement limits on refresh grant (per § Open questions): per refresh token, per user, per IP, minimum interval between successful refreshes.

#### 7. Optional feature flag

`CLI_REFRESH_ENABLED` (or similar): when off, device poll keeps returning today’s long-lived `access_token` only; CLI keeps writing v1 credentials (§ Migration point 4). When on, return refresh + short access. Allows backend deploy before CLI ships.

---

### CLI (`salai-cli`)

#### 1. Credential file v2

- Bump `CREDENTIALS_VERSION` to `2` in `src/credentials.ts`.
- `readStoredCredentials` / write paths: support v1 (`apiKey`) and v2 (`refreshToken`, optional `accessToken` / `accessExpiresAt`).
- Document on disk whether you **store access on disk** or **refresh only** (§ Credential file schema — pick one policy).

#### 2. Central async auth: `getValidAccessToken()`

New module (e.g. `src/authTokens.ts` or next to `credentials.ts`):

1. Env / flag override → return as today (no refresh).
2. v1 file → return `apiKey`.
3. v2 file → return cached access if not near expiry; else `POST /api/cli/token` refresh grant; persist; on `invalid_grant` delete file and throw a clear “run `salai login`” error.

#### 3. Wire into MCP + REST

`resolveConfig` in `src/mcpClient.ts` is **synchronous** today. Every caller that builds MCP or REST requests needs a **valid bearer** after refresh—introduce e.g. `resolveAuthAsync(overrides)` returning `{ apiBaseUrl, mcpUrl, bearerToken }` or keep `apiKey` name as “effective bearer for this process.”

**Touch points:** `src/salai.ts`, `src/banner.ts`, `src/commands/auth.ts`, any command that calls `createClient` / `fetch` with `resolveConfig`.

#### 4. `401` once + retry

For REST and MCP transports using v2 access: on `401`, call refresh once and retry the same operation; guard against infinite loops.

#### 5. Commands

- `**login`:** On device success, if response includes `refresh_token` and `expires_in`, write v2; else write v1 (long-lived `access_token` → `apiKey`) per § Migration.
- `**logout --revoke`:** Prefer refresh body when access missing/expired (§ `salai logout`).
- `**whoami`:** Use orchestration layer so expired access triggers refresh before calling `/api/cli/me`.

---

### Rollout order (single CLI release is enough)

You do **not** need two CLI releases for the core behavior.


| Step | What ships                                        | Notes                                                                                           |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0    | Contract + optional backend feature flag          | Align JSON field names and error codes with § A2–A3.                                            |
| 1    | **Backend** deployed first                        | Old CLI keeps working: still receives long-lived token until flag/on behavior changes.          |
| 2    | **One CLI** release                               | Handles **both** server shapes: v2 file when refresh present; v1 file when not.                 |
| 3    | (Optional) Telemetry / tighter TTLs / UX warnings | May warrant **later** CLI or server tweaks; not a second *required* release for refresh itself. |


---

### Implementation hotspots (avoid regressions)

1. **Middleware order:** Access-token branch must run **before** API-key validation so `sat_…` is never hashed as an API key.
2. **MCP long-lived connections:** Ensure the transport gets headers from the **async** auth path so the bearer is fresh after refresh (or reconnect after refresh if the SDK caches headers).
3. **Revoke route security:** Refresh-token-in-body must be rate-limited and validated like a secret; document CSRF considerations if the route is ever browser-callable (CLI-only POST is lower risk).
4. **Concurrency:** Prefer **non-rotating** refresh initially (§ Refresh orchestration); if rotating, add grace period or CLI lockfile.

---

### Extended testing matrix (both repos)


| Area    | Test                                                                                         |
| ------- | -------------------------------------------------------------------------------------------- |
| Backend | Device grant returns `refresh_token`, `expires_in`, `access_token`; `api_key_id` preserved.  |
| Backend | Refresh grant returns new access; `invalid_grant` when revoked/expired/unknown.              |
| Backend | `sat_` bearer passes `verifyToken` and `/api/cli/me`; revoked session → 401.                 |
| Backend | Long-lived `sac_` / `sap_` / legacy keys still authenticate.                                 |
| Backend | `POST /api/cli/revoke` deactivates session + key; works with bearer or `refresh_token` body. |
| CLI     | v1 credentials unchanged behavior until re-login.                                            |
| CLI     | v2 login; next command uses cache without refresh when not expired.                          |
| CLI     | Short TTL in dev: transparent refresh.                                                       |
| CLI     | `invalid_grant` clears file + user message.                                                  |
| CLI     | `SALAI_API_KEY` / `--api-key` never triggers refresh.                                        |
| CLI     | `logout --revoke` with expired access still revokes via body.                                |
| E2E     | Two parallel CLI processes + non-rotating refresh (no spurious `invalid_grant`).             |


## Open questions for backend/product

- Exact TTLs for access and refresh (proposed defaults: **30 minutes** access, **180 days** refresh; optional idle timeout for refresh).
- Whether to issue **separate** MCP vs API tokens (this design assumes **single access token** works for both; keep legacy long-lived keys working for both for backward compatibility).
- Rate limits on refresh endpoint to prevent abuse if refresh token leaks (proposed: per refresh token **120/min**, per user/key **600/min**, per IP **3000/min**, plus a small minimum refresh interval like **1s**).

---

*Document version: 2 — adds full implementation plan for `SalAi/packages/backend` and `salai-cli`; design assumptions unchanged. Aligns with routes `/api/cli/device`, `/api/cli/token`, `/api/cli/me`, `/api/cli/revoke`.*