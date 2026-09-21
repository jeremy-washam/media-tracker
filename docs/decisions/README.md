# Architecture Decision Records

Accepted decisions:

1. [Cloudflare-native platform](./0001-cloudflare-native-platform.md)
2. [React/Vite web client and Hono REST API](./0002-react-vite-hono.md)
3. [Event ledger and raw-source provenance](./0003-event-ledger-and-provenance.md)
   (event model superseded by ADR 0007; provenance rules retained)
4. [D1 and R2 storage boundary](./0004-d1-r2-storage-boundary.md)
5. [Single-user authentication and secret handling](./0005-single-user-security.md)
6. [Portability and migration boundaries](./0006-portability-boundaries.md)
7. [Archive ledger and source-specific evidence](./0007-archive-ledger-and-source-evidence.md)
   (completion-only admission rule superseded by ADR 0008)
8. [Source-specific Archive admission](./0008-source-specific-archive-admission.md)
9. [Canonical ledger identity and evidence model](./0009-canonical-ledger-identity-and-evidence.md)

10. [Snapshot reconciliation and import recovery](./0010-reconciliation-and-recovery.md)
11. [Source-derived Queue relationships](./0011-source-derived-queue.md)
12. [Refreshable provider catalog caches](./0012-refreshable-provider-catalog-cache.md)
13. [TMDB matching for Letterboxd title collisions and series](./0013-tmdb-letterboxd-match-evidence.md)

ADRs are append-only records of consequential technical choices. If a decision
changes, add a new ADR that supersedes the old one rather than rewriting history.
