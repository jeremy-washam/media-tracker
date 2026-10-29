# ADR 0021: Bounded production operation and emergency pause

- Status: Accepted
- Date: 2026-10-29
- Extends ADR 0005 with a restricted machine identity for release verification.

## Context

The initial hosted activation used expiring grants, one-off catalog job IDs and
lifetime source allocations. Those controls were useful during transfer but
would eventually disable a healthy personal archive. The owner approved normal
operation on the existing $5/month plan, modest overages, a warning near $10 total
and emergency pause near $25 total. The goal is to prevent runaway charges.
New subscriptions and paid services still require explicit approval.

## Decision

Keep source admission/idempotency, a serial queue consumer, finite retries,
provider request/byte/page/deadline limits, a 30-second Worker CPU ceiling and
HTTP rate limits. Replace grant expiry and lifetime source allocation with
normal daily source admission and a rolling 24-hour operational ceiling. Retain
historical admission and measured usage records.

An independently scheduled 10-minute monitor queries native accountwide Workers,
D1, R2 and Queues usage. Estimate the existing subscription plus overages over a
rolling 31-day window to cover mismatched product renewal dates conservatively.
Warn near $10 and persist a sticky emergency pause near $25. Usage analytics are
delayed and storage estimates are conservative; this is not an invoice cap.
Other Cloudflare products and tax are outside this estimate.

Persist the gate in the existing private R2 bucket, not D1. Authenticated API
requests check it before application database access, caching only 30 seconds.
Missing/malformed state or a successful monitor snapshot older than one hour
fails closed. Pause stops scheduling and new imports; queue delivery is paused
through the native API without deleting messages. Already running work stops
at its next bounded delivery/provider checkpoint. Failed queue-control calls
leave the application gate closed and are retried by the monitor. Pauses never
resume automatically after a deployment, lower estimate, or renewal date.
Queue retention continues while paused, so recovery must reconcile expired or
dead-lettered jobs from durable source/catalog/content checkpoints.

The monitor receives an account-scoped token for Analytics Read, D1 Read and
Queues Edit only. It receives no deployment, Access-policy or provider-token
permissions. Release credentials are separate GitHub environment secrets.

A dedicated Cloudflare Access service identity may perform queryless GETs to
health and the six Library summary endpoints only. Verify the Access JWT
signature, issuer, audience, expiry, type and exact service Client ID. The owner
retains normal access; this machine identity cannot browse items, assets,
operations status, or write. CI uses no owner browser cookie.

## Consequences

No monthly grant-renewal task remains. The monitor and controls need a live
failure drill before production activation. Native budget alerts remain useful
independent notifications; their thresholds must be verified in the dashboard.
Monitor warnings are also recorded in structured logs and owner operations
status. A deliberate operator recovery resets the sticky gate and resumes the
native queue only after resolving the cause. Provider-specific catalog refresh,
expiry and source evidence retention remain governed by their existing ADRs.

## References

- [Workers pricing and CPU protection](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing and renewal periods](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Queue pause and retention](https://developers.cloudflare.com/queues/configuration/pause-purge/)
- [Access service-token JWT claims](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
