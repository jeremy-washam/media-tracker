# Threat Model

## Scope and assumptions

This is a personal application with one authorized user. Single-user scope
reduces authorization complexity, but the stored reading, listening, and viewing
history is sensitive. Internet-facing routes and third-party credentials still
require production-grade protection.

## Assets

- Consumption history, ratings, highlights, notes, and source-derived Queue state
- Full article text and raw account exports
- OAuth access tokens, refresh tokens, API tokens, and webhook secrets
- The Worker secret used to encrypt rotating credentials
- Sync cursors, audit records, and backups needed for recovery

## Trust boundaries

- Browser to Cloudflare Access to the web/API application
- Public internet to webhook and OAuth callback routes
- Worker to third-party APIs
- API/cron producers to Cloudflare Queues and queue consumers
- Worker/CLI to D1 and private R2 buckets
- Developer workstation to local exports, secrets, and deployment tooling

## Threats and controls

### Unauthorized application access

- Protect UI and ordinary API routes with Cloudflare Access.
- Validate the authenticated Access identity at the Worker, not only at the edge.
- Allow exactly one configured identity; do not implement public registration.
- Return minimal error details and redact structured logs.

### Webhook forgery and replay

- Keep public routes narrow and separate from authenticated application routes.
- Verify provider signatures when supported and compare secrets in constant time.
- Enforce timestamp windows where providers include timestamps.
- Deduplicate deliveries with source event IDs or payload-derived keys.

### OAuth interception and request forgery

- Use PKCE when supported, exact redirect URIs, short-lived signed state, and a
  one-time state store.
- Request only the scopes required by the connector.
- Never send provider tokens to the browser after the callback completes.

### Credential disclosure

- Store static secrets as Worker secrets, never variables committed to Git.
- Encrypt rotating provider tokens before storing them in D1 using AES-GCM and a
  versioned Worker-held encryption key.
- Do not log headers, tokens, authorization codes, webhook secrets, or raw bodies.
- Use synthetic fixtures; real exports and `.dev.vars` remain ignored.

### Raw data exposure

- Keep R2 buckets private and access objects only through authorized server code.
- Use opaque object keys rather than titles or URLs containing personal data.
- Apply retention deliberately; deletion must cover D1 references and R2 objects.

The web client also persists bounded default Library first pages in browser
local storage. Those snapshots contain private metadata, not provider secrets
or full article bodies. The [web cache contract](../../apps/web/README.md#library-loading-and-caching)
documents age, size, schema validation, and invalidation. Cloudflare Access
protects hosted requests; it does not encrypt or erase already-stored browser
snapshots.

### Malicious or malformed source content

- Treat titles, descriptions, HTML, URLs, exports, and API responses as untrusted.
- Validate boundary data, cap payload and decompression sizes, and sanitize HTML.
- Prevent spreadsheet formula injection in generated CSV exports.
- Do not fetch arbitrary source-provided URLs; use connector-specific allowlists
  and block private/network metadata addresses if server-side fetching is added.

### Duplicate, reordered, or partial delivery

- Make normalization and writes idempotent under at-least-once delivery.
- Commit records before cursors and record sync-run failures explicitly.
- Use database uniqueness constraints for external identities and source events.

### Data loss and corruption

- Preserve immutable raw inputs, parser versions, and source identifiers.
- Provide app-level exports and periodically test restoration into an empty DB.
- Prefer tombstones and correction events over destructive updates.
- Verify migrations locally and keep them forward-only.

### Dependency and deployment compromise

- Commit the pnpm lockfile and review dependency changes.
- Pin the deployment runtime compatibility date and update it intentionally.
- Run format, type, lint, test, and migration checks before deployment.
- Keep production deployment credentials out of local configuration files.

## Deferred decisions

Before a native iOS client is built, replace browser-only Access assumptions with
an authentication flow suitable for a public native client. Before LLM search is
enabled, define explicit data egress, prompt-injection, provider retention, and
citation requirements.
