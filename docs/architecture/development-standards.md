# Development Standards

## Design rules

- Keep `packages/domain` pure TypeScript with no framework or platform imports.
- Validate all external inputs and API outputs with schemas at their boundaries.
- Put source-specific behavior in connectors and persistence behavior in
  repositories; neither belongs in route handlers.
- Keep Cloudflare bindings behind small adapters so local tests use plain fakes.
- Use UTC instants for storage and retain source timezone/precision when known.
- Use ULIDs for internal identifiers and source IDs for idempotency constraints.
- Distinguish `occurred_at`, `recorded_at`, and `ingested_at`.
- Never let generated summaries or inferred metadata overwrite imported facts.

## Web styling

Use installed shadcn/ui Base UI primitives and shared compositions for controls.
Use Tailwind utilities for small arrangements and plain CSS Modules for
substantial custom layouts/content. Keep global CSS limited to shared tokens,
document/accessibility defaults, and custom-property registrations. Shared media
presentation and collection/inspector geometry have shared owners; avoid copying
those contracts into each media feature. Keep class names out of runtime behavior
and browser test identity. Verify computed geometry, keyboard behavior, and
light/dark desktop/narrow appearance when moving cascade boundaries. See
[ADR 0019](../decisions/0019-web-styling-ownership.md).

## Ingestion rules

- Store raw evidence even when validation or parsing fails.
- Normalize idempotently and make replay an ordinary supported operation.
- Advance cursors only after durable writes complete.
- Expect pagination, rate limits, expired tokens, duplicate events, and retries.
- Record parser version, raw-object reference, and source identity on derived data.
- Represent source deletion without silently erasing local historical events.

## Database and migrations

- Application code, not a hosted dashboard, owns schema changes.
- Commit ordered, forward-only SQL migrations; do not edit an applied migration.
- Keep SQLite-compatible SQL portable where reasonable and document exceptions.
- Add uniqueness and foreign-key constraints that enforce idempotency and lineage.
- Test migrations from an empty database and from the previous schema state.

## Security and privacy

- Never commit real payloads, exports, tokens, `.dev.vars`, or production IDs.
- Fixtures must be synthetic or irreversibly sanitized.
- Use structured logs with request and sync-run IDs; redact secrets and content.
- Treat all imported text, markup, filenames, and URLs as untrusted input.
- Add public routes only when a provider flow requires them and document why.

## Quality gates

Before merging a change, run the relevant subset of:

```text
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm test:runtime
pnpm test:acceptance
pnpm test:coverage
```

Unit-test pure normalization and identifier logic. Add fixture-based contract
tests for connectors and integration tests for repository constraints. End-to-end
tests should cover critical user flows rather than reproduce lower-level tests.

Vitest runs at most two workers to bound database-fixture load on shared
development and CI hosts. Keep test assertions and timeouts intact when
diagnosing contention; adjust worker concurrency before weakening a check.

`pnpm check:all` serializes all local gates, including production packaging and
the isolated Worker and browser acceptance suites. Keep mocked browser tests for
UI states and geometry. Use the real-stack suite for browser/API/database
contracts, source membership, imported evidence, and recovery. Runtime fixtures
apply the complete migration chain to disposable local D1/R2/Queues and reject
unrecognized outbound requests. Never use owner data or credentials in tests.

Repository tests share the D1-constrained SQLite adapter for parameter ceilings,
foreign keys, atomic batches, captured queries, and failure injection. Current
repository tests use all migrations; historical-upgrade tests name exact
migration boundaries and seed the source facts affected by the upgrade.

Coverage includes maintained source files even when no test imports them. Keep
the coverage report separate from behavioral acceptance: a percentage does not
replace replay, concurrency, failure-recovery, or provenance assertions.

## Error handling

- Return stable machine-readable API error codes and safe human messages.
- Preserve causes internally without exposing tokens, payloads, or stack traces.
- Mark retries explicitly as retryable or terminal.
- Surface partial sync failures in sync-run state; do not report false success.

## Documentation

Record long-lived choices as ADRs. Update the architecture overview when package
ownership or a trust boundary changes. Connector READMEs must state supported
backfill, reconciliation, deletion, rate-limit, and authentication behavior.
