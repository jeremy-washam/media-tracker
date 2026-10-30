# Chat backend implementation design

- Status: Implementation complete; release validation in progress
- Updated: 2026-10-30
- Parent: [AI Chat plan](ai-chat-plan.md)
- Query contract: [AI query design](ai-query-design.md)
- Accepted UI behavior: [Chat UI/backend contract](chat-ui-contract.md)

The [subscription/access design](chat-subscription-access.md) records the verified
funding distinction and account checks. OpenAI is first; provider-independent
contracts and no additional API payment remain required. The [options](chat-options.md)
selected AIChatAgent conditionally; the released-package inspection selected the owned Durable Object fallback in [ADR 0023](../decisions/0023-owned-chat-runtime.md).

## Recommendation

Use the existing private Hono/Workers application with one application-owned SQLite Durable
Object per conversation. Call ordinary OpenAI Responses through a direct provider
adapter, funded only by API credits included with the owner's Pro subscription.
The owner linked the benefit on October 30 and supplied a $43.00 available-credit
screenshot. Verify expiry and exclude purchased credits/payment/recharge before live use. This route does not depend on hosted SIWC approval or an always-on Mac.
No other inference funding path or automatic fallback is authorized.

Keep one authoritative conversation store in application-owned tables in the
conversation object's SQLite database. Use no independently writable SDK transcript. Treat D1 as the rebuildable global conversation index plus the unchanged
media ledger, and private R2 as large payload/evidence/export storage. Use owned
repositories and versioned export/restore rather than SDK table dumps as the
portability contract. This revises the earlier D1-authoritative chat proposal;
recorded in ADR 0023, preserving existing ADR history.

Keep provider/tool/context/budget rules in platform-independent modules. Provider
adapters may target HTTP models or official personal runtimes. The owner accepted
New Chat, unlimited separate Favorites/Chats, editable automatic titles and a
Send/Stop composer. The owner selected Familiar; the other two studies remain review artifacts. The
[UI/backend contract](chat-ui-contract.md) owns metadata, pagination, activity and
race semantics; the first assistant is standard chat with Library and web access.
Existing Library/inspector behavior stays intact.

Implementation uses the official OpenAI SDK 7.45.1 and GPT-6.1 Sol. Key authentication
and a bounded live text request passed. The linked organization has $43 included
credit, November 12 expiry and no paid API billing plan/payment method. The key
is in ignored local configuration and an encrypted Worker Secret. End-to-end
release evidence will be recorded after deployment; implementation is not evidence
that production has been upgraded.

## Independent research and triage

Three isolated CLI sessions received the [identical data-only brief](research/chat-research-brief-2026-10-29.md).
They received no existing tool design, project plans, implementation files, or
stack constraints. User configuration, project-instruction loading, and memory
injection were disabled. Each confirmed isolation before research. Earlier
subagent attempts inherited project context and were discarded from this comparison.

| Decision        | Research 1                                  | Research 2                                      | Research 3                     | Synthesis for Imladris                                                                                                                |
| --------------- | ------------------------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Provider        | Anthropic Messages / Sonnet 5.5             | OpenAI Responses / GPT-6.1 Sol                  | OpenAI Responses / GPT-6.1 Sol | OpenAI first for integrated tools and optional provider-job recovery; Anthropic is the evaluation challenger, not presumed inferior.  |
| Hosting/storage | Node API + worker, PostgreSQL, object store | Same; database-backed queue                     | Same; database-backed queue    | Preserve Hono/Workers, D1, and R2. Adapt the durable-worker pattern; no finding establishes a need to migrate the media ledger.       |
| SDK             | Direct provider SDK                         | Direct provider SDK                             | Direct provider SDK            | Direct SDKs behind application adapters first; AI SDK is an optional accelerator.                                                     |
| History         | App-owned tree and run/event log            | Same                                            | Same                           | Adopt immutable branch ancestry, typed message parts, attempts, and replayable events.                                                |
| Web tools       | Isolated research request                   | Native search; stronger isolation when required | Isolated research request      | Native provider tools behind a controlled application capability boundary; ordinary public searches do not require repeated approval. |
| Library tools   | Several explicit operations                 | Several explicit operations                     | Several explicit operations    | Keep `query_media` and `get_media_details`; implement the required operations inside their validated contracts.                       |
| Recovery        | Preserve partials; new attempt after loss   | Foreground default; background for long work    | Same                           | Distinguish reconnect, cancellation, and server interruption; never promise exactly-once external execution.                          |

Full independent reports: [1](research/chat-independent-1-2026-10-29.md),
[2](research/chat-independent-2-2026-10-29.md),
[3](research/chat-independent-3-2026-10-29.md).

The PostgreSQL recommendation is a reasonable unconstrained starting point,
not evidence of a deficiency in the current database. Row-level tenant policies
and new authentication systems from the generic reports are unnecessary here:
reuse the existing single-owner Access boundary. Their many suggested tool names
describe capabilities, not a demonstrated need for separate model-facing tools.

The reports under-explored managed agent runtimes. The parent review checked
OpenAI's current managed Agents API and Cloudflare's chat harnesses separately;
those remain real alternatives, evaluated below rather than omitted by consensus.

## Runtime and provider selection

Use **owned SQLite Durable Objects + direct provider SDK adapters**. The released
AIChatAgent 0.12.2 persists client history before its model hook and accepts a
separate history mutation event. Rather than maintain competing transcript
authorities, the implementation takes the planned fallback. See ADR 0023 for the
inspection finding and tradeoff. Hono owns authenticated REST admission/control;
persisted SSE events replay after a monotonic application sequence. Closing a
stream detaches observation, not execution. No WebSocket endpoint is exposed.

Construct the official OpenAI Responses client, with credentials in Worker
secrets and explicit organization/project configuration. Do not pass bare model
strings through Cloudflare model factories or configure gateway billing/fallback.
No Workers AI binding is required for this initial model connection.

| Alternative                           | Decision and reason                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AIChatAgent                           | Not adopted after the released-package trusted-history inspection; see ADR 0023.                                                                |
| Think                                 | Defer: useful tree sessions and compaction, but a larger experimental harness and memory policy for the initial standard chat.                  |
| Plain Agent/DO + direct SDK           | Selected after the released harness failed the trusted-history default check; owned lifecycle and adapter tests cover the added responsibility. |
| Managed OpenAI Agents API             | Defer despite included-credit eligibility: provider-owned session/harness state adds unnecessary coupling for this first version.               |
| PostgreSQL worker / larger frameworks | No demonstrated need to migrate the media ledger or add workflow infrastructure.                                                                |
| Local SIWC / Codex App Server         | Explicit alternative access/runtime modes; not required by the selected Pro-credit route.                                                       |

[Cloudflare comparison](https://developers.cloudflare.com/agents/harnesses/think/),
[chat lifecycle](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/),
[credit coverage](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

Pin actual releases; source inspection of upstream main is not release testing.
Preserve originals before SDK truncation/sanitization and disable destructive
product operations. Capture provider-native continuation data outside UI messages:
the framework strips some OpenAI opaque reasoning metadata. New provider attempts
reconstruct portable visible context, not another provider's hidden state.
Select an actually available account model and evaluate it; do not hard-code a
research report's model default as an entitlement claim.

The SIWC profile remains separate: its HTTP history/background and tool limits
must not be applied to ordinary included-credit API requests. Conversely, switching
an API key to OAuth is not a complete SIWC adapter. See the access document.

## Capabilities and tool boundary

| Capability                         | Initial implementation                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General conversation               | Enabled without requiring a Library query.                                                                                                                                                           |
| Library search and analytics       | `query_media`: items, statistics, or both; structured/lexical filters and coverage.                                                                                                                  |
| Item/content investigation         | `get_media_details`: typed references with optional history, annotations, and relevant passages.                                                                                                     |
| Public web search and page reading | Provider-native tools behind a bounded application research operation, with source annotations and explicit read failures.                                                                           |
| Calculations and charts            | Exact repository measures and bounded deterministic calculations; trusted chart specifications/data.                                                                                                 |
| Text, image, PDF attachments       | Deferred beyond the accepted text-only composer: future private uploads, bounded extraction/model inputs, citation locators, and processing status.                                                  |
| Sandboxed code/file generation     | Capability adapter and artifact contract; enable only with an isolated execution environment, accounted costs, and tested cancellation/cleanup. No access to Worker secrets or the owner filesystem. |
| MCP / additional connected tools   | Extension adapter with scoped credentials and explicit available capabilities; no MCP server is required for internal Library access.                                                                |

Coverage/capability metadata belongs in tool results and initial run context.
Passage search can be requested through `query_media`; reading/expanding those
passages belongs in detail includes. Extend the schema if evaluations demonstrate
a missing operation; tool count alone is not an optimization target.

The user wants broad assistant capabilities. The first release must include web
access, not leave it behind a later catalog-discovery milestone. Arbitrary shell,
computer control, and external writes require their own runtime/integration;
they do not appear automatically when a chat model is connected.

The main run may call a bounded web-research operation that receives public
questions/URLs and permitted public metadata, rather than the private transcript.
Preserve provider URL annotations through synthesis. Search, opening a page, and
successful full-text extraction remain distinct outcomes.
[OpenAI web tools](https://developers.openai.com/api/docs/guides/tools-web-search).

Ordinary Library reads and public web research run without per-call approval.
Define a standing egress policy: private notes/excerpts are excluded from outbound
search queries by default; user-authorized disclosure can be scoped explicitly.
An isolated model call alone cannot guarantee privacy if its input contains
private text. Enforce permitted inputs and egress in code and test canaries.
If free-form query input remains allowed, document the residual risk rather than
claiming prompt rules prevent exfiltration. Never forward connector credentials
or authenticated application cookies to web tools.

Provider-specific field-use restrictions apply before model or embedding calls.
Library display eligibility is not model-use permission. Preserve the existing
canonical ledger, raw evidence, source identity, date precision, and read-only
Library boundary; chat attachments do not create Library membership.

## Persistence and API

Proposed logical records in conversation-local SQLite unless noted. Final names
and migrations follow the released-package proof. These are our schema, not
provider-owned sessions; SDK projections can be reconciled from our records.

| Record                 | Fields/role                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat_conversations`   | Title/origin/title revision, favorite, selected head/transcript revision, metadata/activity revisions, last activity, defaults, deletion/tombstone state. No tenant layer. |
| `chat_messages`        | ID, parent ID, role, typed text/summary/activity/reference parts, originating run, completion status, schema version.                                                      |
| `chat_runs`            | Input head, idempotency key, selected model/access mode, settings, status, cancellation intent, limits, timestamps.                                                        |
| `chat_attempts`        | Run, generation/fencing token, provider IDs, submission state, checkpoint, retry reason, usage and unknown usage.                                                          |
| `chat_events`          | Run and monotonic sequence, typed payload/reference, committed time; coalesced text rather than one row per token.                                                         |
| `chat_tool_calls`      | Stable logical/activity ID, optional group, provider item/call ID, schema version, validated arguments/hash, lifecycle/timing, attempt and result/evidence references.     |
| `chat_evidence`        | Query/record/passage reference, version/hash, locator, exact returned supporting data, coverage and retrieval time.                                                        |
| `chat_attachments`     | Private object key, hash, size/type, extraction state/version, provider-copy IDs, cleanup status.                                                                          |
| `chat_contexts`        | Selected branch range, summary version, included evidence and opaque provider-item references.                                                                             |
| `chat_dispatch_outbox` | Recoverable dispatch intent for a committed run; dispatch survives the committed conversation transaction and process restart.                                             |

Keep large provider responses, tool bodies, extracted text, and files in private
R2 with durable conversation manifests. D1 holds the cross-conversation index,
source ledger and rebuildable search projection; it is not a second transcript
authority. A DO-local durable outbox updates that index idempotently. Separate chat retention/deletion from immutable imported
source evidence. Preserve originals when compacting model context.

The [UI/backend contract](chat-ui-contract.md) specifies unlimited keyset-paged
Favorites versus nonfavorite Chats, activity-only ordering, title-generation
compare-and-set, browser-local collapse state and truthful activity counters.
D1 metadata projection updates require a monotonic outbox revision; no token
chunk, rename or favorite toggle invents conversation activity.

Public first-release contract proposal:

```text
POST   /api/chat/conversations
GET    /api/chat/conversations?section=favorites|chats&cursor=...
GET    /api/chat/conversations/:id
PATCH  /api/chat/conversations/:id
POST   /api/chat/conversations/:id/runs
GET    /api/chat/runs/:id
GET    /api/chat/runs/:id/events?after=...
POST   /api/chat/runs/:id/cancel
GET    /api/chat/evidence/:id
GET    /api/chat/conversations/:id/export
DELETE /api/chat/conversations/:id
```

First Send creates the conversation and its first accepted message/run together;
New Chat alone is a local draft. Route its stable operation key to the same
conversation on creation retries. Later submissions contain only new text,
expected transcript head and operation key. No attachment/model-picker or public
edit/regenerate/branch actions are in the accepted initial UI. Load authoritative
history server-side. Atomically commit the
message/run/initial event/dispatch intent in the conversation object's SQLite;
acknowledge durable acceptance with 202 and IDs. Retrying a key returns its original
run. A recoverable dispatcher retries notification with that same identity. D1
index publication and R2 payload writes are not part of that transaction: use
publication states, durable outbox entries and reconciliation. Keep SDK-state
synchronization recoverable; do not rely on best-effort onFinish mirroring.

Allow one active run per conversation initially. A stale head/conflicting send
returns a typed conflict; never silently merge concurrent turns. Metadata updates
use their own revision and do not conflict with the transcript head. Keep immutable
ancestry/attempt records for future branching, but defer edit/regenerate routes
and UI. UI rendering consumes typed parts and activity events without database or
provider credentials. Provider-native continuation data stays server-side.

Persist distinct reasoning summaries and tool activity rather than parsing final
prose for progress. Summary availability is a provider/model/access capability,
not a guaranteed live transcript. Count executed logical tool identities once,
independent of stream fragments/replay/cached results; store nested wrapper groups
without double counting. Expand safe filters, result coverage, sources, lifecycle
and known timings. No raw hidden reasoning, invented percentages or preview text.
The UI contract documents official OpenAI event mapping and graceful degradation.

## Execution and recovery

```text
queued -> running -> completed
             |-> waiting_for_tool -> running
             |-> retry_wait -> running
             |-> cancel_requested -> cancelled
             |-> failed / interrupted
```

Attempts additionally distinguish prepared submission, known provider response,
and `submission_unknown`. Waiting for user clarification/approved future actions
must be durable when introduced, not an in-memory suspended callback.

1. Authenticate, check scope/budget, and durably accept the run.
2. Coordinator claims an attempt with a generation token and absolute deadline.
3. Save bounded context and provider-call intent before external submission.
4. Save provider IDs when available. Persist coalesced events before publishing.
5. Validate complete tool calls; never execute partial streamed JSON. Save tool
   outcomes/evidence before the next model step.
6. Finish atomically with final message state, event, and usage reconciliation.

| Event                           | Required behavior                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Browser disconnect/route change | Detach viewer; accepted work continues within its limits.                                            |
| Reconnect                       | Snapshot plus replay after sequence, then live events without a gap; client deduplicates.            |
| Explicit Stop                   | Persist cancellation first; abort supported calls, prohibit new steps, retain partial output.        |
| Stop/completion race            | A committed terminal state wins; generation checks prevent late writes reviving cancelled work.      |
| Coordinator eviction/deploy     | Reload durable state; reuse committed tool results; reconcile the external call before replacing it. |
| Lost foreground inference       | Preserve partial attempt and mark interrupted; an intentional retry is separately identified.        |
| Known background response       | Retrieve/resume within provider retention when supported; never assume indefinite availability.      |
| Unknown submission outcome      | Record uncertainty; do not silently resubmit a potentially billed request.                           |
| Exhausted retry/budget          | Retain partials and return a clear terminal reason.                                                  |

Use persisted application SSE events, behind our client
adapter and server authentication. Persist replay blocks and materialized
snapshots; define cursor expiry/reset behavior in our contract. Viewing and
execution lifetimes remain independent. An SSE observation adapter can consume
the same events later without changing run semantics.

Use ordinary foreground Responses streaming initially, funded by included Pro
credits. On eviction, override default framework recovery to retain partial output
and mark interrupted instead of automatically creating another inference attempt.
Explicit retry creates a new retained attempt and checks allowance again. Browser
reconnect only replays the active stream; it does not require a new model call.
Provider background retrieval remains a possible later optimization for this API
mode, distinct from SIWC where it is unsupported.
[Recovery behavior](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/#stream-recovery).

Configure one retry owner per operation. Respect retry delays, limit attempts,
and distinguish rate limits from billing/authentication/configuration failures.
SDK retries and durable recovery must share the same run budget. Application
idempotency does not guarantee exactly-once provider billing; cancellation does
not undo accepted external work.

## Context, security, costs, and operations

Construct model context from versioned instructions, selected-branch recent turns,
derived older-history summaries, relevant evidence, and required tool exchanges.
Keep original messages and source references. Store opaque provider continuation
items separately; do not expose hidden reasoning. Cross-chat memory is an
optional inspectable feature, not automatic fact extraction from every chat.

Reuse Access owner checks for all HTTP/control/event/evidence/upload routes.
Keep coordinator bindings private. Long-lived subscriptions and recovered runs
must recheck operating policy before new billable work. Persist Stop even during
an operating pause; ensure the pause gate does not prevent cancellation. A paused
run must not resume automatically after deployment. Cancellation authorization
must not provide a bypass for new inference.

The existing monitor measures Workers/D1/R2/Queues; add DO compute/SQLite and
model/tool allowance accounting. Reuse the approved infrastructure budget and
measure headroom before live enablement; OpenAI credits do not pay Cloudflare.
Reserve conservative complete-turn allowance, including unknown final usage,
retries, summaries, title generation and web calls. Bound requests rather than
assuming single-user traffic is harmless.

The selected API organization must have only included credits, no purchased
balance/payment/postpaid funding/Auto Recharge. Exhaustion, expiry and reached
hard limits stop new inference. A project key alone does not isolate organization
funding; no documented request flag selects only included credits. Hard project/
organization limits are useful but enforcement can lag. Never buy credits or
switch provider/key/gateway to keep a run alive.
[Credit/funding behavior](https://developers.openai.com/api/docs/guides/chatgpt-api-credits),
[hard limits](https://developers.openai.com/api/docs/guides/spend-limits).

Display the funding mode accurately: subscription-included API credit allowance,
not shared ChatGPT plan quota. The owner confirmed linking and an available grant;
verify expiry and funding settings rather than hard-coding availability or enabling SIWC.

Use provider settings deliberately. `store:false` does not mean zero retention;
files, background requests, and managed sessions have separate rules. Keep keys
server-side, redact prompts/excerpts from routine logs, sanitize rendered content,
and version extraction and tool contracts. Deletion must cover active runs,
attachments, summaries, app evidence, and provider copies actually created;
retry cleanup and disclose backup retention separately. Delete during a run
atomically tombstones the conversation and records cancellation; reject further
reads/replay/mutations, fence late provider/title callbacks and publish a monotonic
D1 tombstone. Remove chat-owned objects only; preserve imported Library/source
evidence. See the UI contract for access-denial and cleanup acceptance.
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Implementation milestones independent of final UI

1. **Account funding and released-package proof.** Review/activate the included
   Pro credit benefit already linked by the owner, verify the receiving organization
   has no paid continuation, and pin the official provider SDK.
   Define portable run/message/tool/citation schemas and a different fake provider.
2. **Storage/lifecycle proof and ADR.** Use isolated synthetic conversation SQLite,
   D1/R2 and the released-harness admission path (the owned DO fallback is selected). Prove idempotent admission, trusted history,
   export/restore, immutable ancestry/attempts, replay, Stop, late completion,
   deploy/eviction and no automatic paid or inference retry. Then record the new
   storage/runtime ADR; do not rewrite accepted D1/R2 media-ledger history.
3. **Backend foundation.** Forward migrations/repositories, authenticated routes,
   atomic first Send/draft behavior, idempotent run/outbox records, unlimited
   paginated Favorites/Chats, revision-safe rename/favorite/auto-title updates,
   bounded context, raw provider checkpoints, summary/tool-activity projection,
   citation/evidence storage, active-chat deletion/export and diagnostics. D1 is
   a projection, not another authoritative transcript.
4. **First capable assistant.** Direct OpenAI Responses funded by included credits,
   `query_media`, `get_media_details`, authorized article text and native web
   search/citations. After funding/key verification, verify credit-funded smoke turns,
   allowed models/tools and measured Cloudflare usage. Use injected limit errors
   rather than draining the allowance.
5. **UI integration and initial release.** After the owner selects one of the
   three mocks, connect it to the accepted UI/backend contract. Verify sidebar
   pagination/membership, title races, Send/Stop, activity replay/counting,
   summary unavailable/partial states, desktop/narrow, light/dark, keyboard and
   inspector/citation behavior. Budget any necessary non-destructive context
   summaries. Future live providers remain optional; fake-provider portability
   is required and does not prove another provider's subscription access.
6. **Later capabilities.** Attachments/extraction, saved artifacts, model-picker
   UI, message actions/branching, sandboxed code and connected tools are separate
   increments. Each requires its own UX, storage/execution and funding acceptance;
   none blocks the accepted text-chat release.

Backend completion covers duplicate submit/tool results; crashes around
acceptance, provider IDs, tool-result persistence and terminal writes; stale
worker generations; Stop in every phase and after restart; replay gaps/duplicates;
operating pause; ancestry/attempt preservation; opaque reasoning/tool state; export/restore;
favorites pagination/membership; stale metadata/index revisions; rename/title races;
reasoning-summary degradation; stable tool counts; deletion/resurrection fencing;
unknown dates/reconsumption; unavailable text; exact count/coverage; malicious
web/attachment input; provider errors and allowance amplification.

Run `pnpm check`, relevant builds, Worker/runtime/browser acceptance and migration
checks for implementation changes. Research-only document checks do not establish
these runtime guarantees. Live smoke tests require an activated, verified funding
route; the initial text/title/web probes are recorded in the access design; production release remains a separately recorded check.

## Implemented bounds and recovery

Shared contracts and repositories own the final wire/storage names. Chat HTTP is
under `/api/chat`; run control/events are nested below their conversation. SSE
reconnect honors the last committed event sequence. Snapshot pages contain 40
messages; lists default to 50 and continue without a favorite-count cap. The
model receives at most 30 recent visible turns under a 100,000-character context
bound; original history is retained. Six model-loop steps, two public-search
requests, 180 seconds per run and coalesced public parts bound execution. Search
source actions remain native provider details, not extra fabricated tool calls.

`query_media` shares one matching population between item pages and exact totals;
its signed cursor binds query and a monotonic Library revision. Trigger increments
avoid archive-wide revision scans. Discovery includes ready, version-matched
article bodies. Video metadata matches respect the read clock and source channel;
the cursor revision also binds the next search-index expiry. Consumption windows use New York calendar
boundaries, retaining unknown/partial dates. Rating thresholds use occurrence
ratings normalized to five; coverage counts describe eligible source records
before the occurrence-rating/minimum-occurrence filters. Instant groups before
2007 remain unknown rather than receiving modern daylight rules.

Details cursors track history/highlights/text exhaustion independently and bind a
source revision. Article passages use the current ready manifest/source version,
byte locators, coverage/extraction versions and distinct source-chunk/returned-byte
hashes. A mismatched complete chunk is unavailable. Spotify API catalog metadata
and aggregate catalog identities are excluded from model input; owner-history
titles, creators and playback evidence remain accessible.

Delete commits a title-scrubbed tombstone before asynchronous chat-owned cleanup.
It does not delete Library facts. Object manifests precede writes; bounded cleanup
retains an unsettled registration for up to ten minutes before retrying deletion.
Late writes check the tombstone, and new queued turns are rearmed after an older
run's optional title completes. NDJSON export preserves original messages and
application run records; opaque provider checkpoints remain private. The portable
SQLite recovery port restores into an empty store, marking in-flight work partial
and interrupted. Recovery of exported evidence requires restoring its private R2
objects and manifest; there is no public import/restore UI.
