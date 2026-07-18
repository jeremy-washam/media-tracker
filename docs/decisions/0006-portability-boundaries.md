# ADR 0006: Portability and Migration Boundaries

- Status: Accepted
- Date: 2026-07-18

## Context

Cloudflare is a good initial operational fit, but storage growth or future query
needs may justify Postgres, another object store, or a different runtime. The app
must not need a rewrite to make that move.

## Decision

Keep domain rules and connectors independent of Cloudflare. Access D1 through
owned repositories and migrations, use a storage interface for raw objects, and
expose product behavior through versioned REST contracts. Provide app-level
exports containing canonical records, external identities, events, provenance,
and raw-object manifests.

## Consequences

A migration still requires data transfer, SQL adaptation, and operational work,
but not replacement of normalization logic or clients. Some D1/SQLite features
may be used when valuable; each non-portable dependency must stay localized and
be documented.
