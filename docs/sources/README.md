# Source reconnaissance

These documents are the evidence base for connector and canonical-schema
decisions. Research is deliberately payload-first: learn what each official
source can actually provide, probe the owner's private data safely, and only
then finalize normalization rules.

## Parallel-agent contract

Each source can be researched independently by an agent with exclusive write
ownership of:

- `docs/sources/<source>.md`; and
- optionally `packages/connectors/<source>/README.md`.

The agent must not edit shared documentation indexes, workspace manifests,
lockfiles, canonical domain models, or another connector. The coordinating
agent reconciles shared changes after every track finishes.

Every source report should cover:

1. current feasibility and confidence;
2. official APIs, exports, webhooks, feeds, or portability surfaces;
3. authentication and owner setup;
4. historical backfill coverage;
5. incremental synchronization and deletion behavior;
6. stable identities and the precise meaning of source dates;
7. Archive/completion semantics for this product;
8. pagination, cursors/checkpoints, rate limits, and retries;
9. future Queue read/write support;
10. a representative response-field inventory;
11. a credential-safe private payload probe plan;
12. known gaps and unresolved questions; and
13. the smallest recommended next action.

Use official or primary sources and include a `Last verified` date because API
capabilities and access policies change. Separate documented facts, direct
payload observations, and inferences. Do not call an authenticated API unless
the owner explicitly starts the private probe.

## Safety rules

- Never commit credentials, real account exports, raw personal payloads, signed
  download URLs, or lightly redacted derivatives.
- During reconnaissance, prefer field/type inventories, aggregate counts,
  hashes, and hand-authored synthetic fixtures.
- Keep real probe data in a verified ignored directory or a temporary directory
  outside the repository, and delete it after conclusions are captured.
- Do not print tokens, authorization headers, full document text, reviews, or
  other private content in terminal output.
- Do not scrape a service when its terms or documentation instead provide an
  authorized API, export, webhook, RSS, or portability mechanism.

## Current reports

- [Readwise Reader](readwise.md)
- [Spotify](spotify.md)
- [Hardcover](hardcover.md)
- [Letterboxd](letterboxd.md)
- [YouTube](youtube.md)

All five initial source families now have a report and at least one private
payload observation. Letterboxd, Spotify, and YouTube still require manual
exports for complete history.
