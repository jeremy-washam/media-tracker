# ADR 0022: Durable hosted manual source sync

- Status: Accepted
- Date: 2026-10-30
- Extends ADRs 0001 and 0021; source and admission semantics remain unchanged.

## Context

Hosted manual source work used a blocking HTTP request. During live acceptance,
a validation client's 60-second timeout canceled a Spotify Worker after six raw
responses and 196 source records were durable. No cursor advanced; its unknown
in-flight admission remained conservatively charged. Long syncs must survive a
browser navigating away or losing its connection.

Cloudflare's `waitUntil()` allows only 30 seconds after disconnect, shorter than
the app's bounded source work. The existing Queue consumer already runs scheduled
sources independently of HTTP connections, with a 15-minute wall-clock platform
limit and the app's smaller provider, deadline and CPU limits.

## Decision

For hosted owner requests, enqueue the existing `sync_source` operation and
return HTTP 202 only after the send succeeds. Check source configuration, enabled
state, operating pause and read-only admission eligibility first. Do not reserve
work or call providers in HTTP; the consumer repeats authoritative admission,
lease, budget and cursor checks. Keep local synchronous HTTP 200 responses.

Use a shared queued-response contract. It conveys acceptance, not completion,
a guaranteed future allocation or an exact sync-run ID. Run IDs are created when
processing starts. Connections shows queued activity, polls the existing source
activity, and refreshes Library data after observed terminal transitions. Bound
waiting for a run that may be deferred by a race with scheduled work.

Retain existing idempotent source writes and finite retry/continuation rules.
A message's idempotency key alone does not deduplicate delivery. This decision
adds no request ledger, new provider schedule, data migration or paid resource.

## Consequences

A caller disconnect after confirmed enqueue cannot cancel provider processing.
An enqueue failure is an error, not false queued success. Queued work may still
be deferred by a later pause, lease or admission race; UI copy must not promise
completion. Existing API clients must accept the hosted queued variant and the
local completed variant.

An interrupted attempt never receives a budget refund from partial durable row
counts. Unknown admission usage remains retained. Only a reviewed, guarded orphan
procedure may close an abandoned visible run; it cannot advance a cursor or reset
admission accounting.

## References

- [Cloudflare execution context](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)
- [Cloudflare Queue limits](https://developers.cloudflare.com/queues/platform/limits/)
