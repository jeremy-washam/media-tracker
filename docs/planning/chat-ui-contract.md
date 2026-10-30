# Chat UI and backend contract

- Status: Familiar selected and implemented
- Updated: 2026-10-30
- Parents: [UI foundation](../design/ui-foundation.md), [backend design](chat-implementation-design.md)

This contract implements the owner's preliminary ChatGPT-inspired design inside
Imladris's existing shell. It specifies behavior shared by all three mocks;
spacing, layout and activity presentation remain design-review choices. It does
not introduce production UI or make synthetic mock activity a live capability.

## First release

- Chat navigation sits below Chat/Library/Recaps in the existing sidebar, rather
  than adding another column. Empty-state quote selection and the review catalog
  are local UI assets; they require no model request or backend persistence.
- A **New Chat** action above separately collapsible **Favorites** and **Chats**.
- A favorite appears only in Favorites. Neither section has a product item cap;
  bounded pages and incremental loading make every matching chat accessible.
- Both sections sort by latest conversation activity, newest first, with a stable
  ID tie-breaker. New chats enter on the first accepted message. Rename, favorite,
  unfavorite, opening a chat and title generation do not change activity order.
- A star and more button appear on hover and keyboard focus; touch access remains
  available. The menu contains only Rename, Favorite/Unfavorite and Delete.
- Titles are generated automatically and remain editable. The initial fallback
  uses a bounded first-message excerpt, so naming failure cannot block a chat.
- One classic, expanding text composer. Send becomes Stop during accepted work;
  a pending Stop shows **Stopping** until authoritative acknowledgement. Future
  custom actions may occupy the left side; none are enabled initially.
- User messages, streamed assistant responses, media references/citations and
  expandable response activity. No message copy, branch, regenerate, share or
  feedback actions. No attachment or model-picker controls in this release.

Use the real installed shadcn/Base UI controls in production. Hover-only actions
must also be keyboard accessible; section chevrons expose expanded state. Keep
reduced-motion behavior and avoid announcing every streamed token to assistive
technology. The existing shared media inspector remains the citation target.

Remember section collapse independently in versioned browser-local preferences,
as with existing shell preferences. It survives browser reloads; cross-device
sync is not a requirement and needs no backend preference subsystem. A fresh New
Chat starts an in-memory empty draft, not a stored empty conversation. Switching
away detaches observation without stopping an already accepted run. Drafts are
local UI state and are not sent to the provider before Send.

## Conversation metadata and collection index

Conversation-local SQLite owns title, title origin (`fallback | generated |
manual`), `titleRevision`, `isFavorite`, `metadataRevision`, `activityRevision`,
`lastActivityAt`, active run and deletion state. D1 is the rebuildable cross-chat
index; an idempotent durable outbox publishes metadata changes. Neither store
changes the canonical media/source ledger. Conversation routing derives from an operation UUID digest; run and evidence IDs
are application-owned, not provider session IDs. Store UTC instants, serializing API dates as ISO 8601 UTC strings.

Provisional boundary limits: manual/generated titles are trimmed plain text,
1–200 Unicode code points; new user input is 1–32,000 code points; sidebar page
size defaults to 50 and is clamped to 1–100. These are validation/resource limits,
not a favorite-count limit or a guarantee that a model accepts the full input.
Opaque cursors are versioned, authenticated and bounded to 2 KiB. Tool bodies,
summary parts and event batches have separately configured byte limits; overflow
produces an explicit truncated flag/continuation or a typed limit failure, never
an unbounded socket or database row. Final numerical payload ceilings are pinned
with the storage/provider proof.

`lastActivityAt` advances on durable user-message acceptance and the assistant
run's terminal commit; coalesced token chunks do not reorder the sidebar. Active
run status is separate metadata. Metadata revisions change on rename/favorite
updates; activity revisions change only on the defined conversation activity.
D1 publishes all revisions for one conversation monotonically, rejecting stale
outbox writes. The conversation snapshot is authoritative; the client overlays
acknowledged mutations while the index catches up. Collection responses disclose
their projection revision; they do not promise a cross-store transaction.

List Favorites and Chats with distinct `section=favorites | chats` filters,
where Chats means nonfavorites. Keyset order is `(lastActivityAt DESC, id DESC)`;
a cursor binds section, order and the collection revision. A published membership,
ordering, title or visible-status change invalidates that cursor with
`chat_cursor_stale`. Refresh from page one, deduplicate by ID, preserve a visible
anchor and keep existing rows until the replacement succeeds. This favors a clear
refresh over pretending a moving list is a snapshot. Do not invalidate for every
stream chunk. The client reconciles membership atomically on a favorite toggle
so a row never intentionally appears in both sections. Follow subsequent pages
until exhausted; no hidden newest-N or favorites-only truncation.

Rename/favorite mutations contain the last seen metadata revision and return
the authoritative record/revision. Stale writes return `chat_revision_conflict`
with the fresh record rather than overwriting another tab. Auto-title work is
budgeted, optional and bounded to one scheduled job per initial chat; it is not
counted as user response activity or tool usage. It can apply only if its captured
title revision still matches and title origin is not manual. A concurrent rename
wins; deleted chats reject title completion. Title failure preserves the fallback
without retry storms or a paid funding fallback.

## Owned HTTP and observation boundary

Route names are proposals; shared Zod contracts and OpenAPI own the final spelling.
Every route/control/event stream reuses existing single-owner authentication.

| Operation       | Contract                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First Send      | `POST /api/chat/conversations` includes new text and operation key; atomically creates conversation, message, run, initial event and dispatch intent in its conversation object, returning 202 with all IDs. |
| Lists           | `GET /api/chat/conversations?section=favorites&cursor=...&limit=...` (or `section=chats`) returns metadata records, projection revision and next cursor.                                                     |
| Open            | `GET /api/chat/conversations/:id` returns metadata, a bounded message page, active run and replay checkpoint; older messages use a separate keyset cursor.                                                   |
| Metadata        | `PATCH /api/chat/conversations/:id` accepts title and/or favorite plus expected metadata revision; it never mutates messages or run state.                                                                   |
| Later Send      | `POST /api/chat/conversations/:id/runs` accepts only new text, expected transcript head/revision and operation key; returns 202 after durable acceptance.                                                    |
| Observe         | Run snapshot plus persisted SSE events after the last committed app sequence; HTTP snapshot/event endpoints remain available for recovery and export.                                                        |
| Stop            | `POST /api/chat/runs/:id/cancel` durably records intent or returns the already terminal snapshot; repeated calls are idempotent.                                                                             |
| Delete          | `DELETE /api/chat/conversations/:id` commits a tombstone/cancellation and returns 202 with cleanup state; repeated requests are idempotent.                                                                  |
| Evidence/export | Existing proposed evidence and export endpoints expose app-owned retained content only for nondeleted chats.                                                                                                 |

The client creates and retains one operation key per intentional Send, including
first Send. Retries after timeouts reuse it. Derive the first conversation
identity/routing deterministically from an opaque scoped operation key or use an
equivalent durable admission mapping, so retrying creation cannot allocate two
objects or inference runs. Reject payload changes under an existing key. A 202
means durable acceptance, not successful inference. Never accept a client-supplied
history as the authoritative transcript.

One active run per conversation initially. A competing Send returns
`chat_run_active`; a stale transcript head returns `chat_head_conflict`, both with
current safe state. Metadata edits do not cause transcript-head conflicts. Other
chats may run independently under the existing global operating/concurrency and
credit gates. Admission races must reserve those bounds durably. The composer
retains unsent text when admission fails. Disconnected viewers show reconnecting
state without starting replacement inference or treating transport failure as
successful completion. Inline error/recovery affordances are not per-message
action toolbars and must never automatically repeat potentially billed work.

Edit/regenerate/branch/upload routes are future scope. Immutable parent/run/attempt
identities remain useful for audit and interruption recovery; they do not require
exposing those actions in the first UI.

## Response activity and reasoning previews

Public UI parts are explicitly typed: `text`, `reasoning_summary`, `tool_activity`,
`media_reference`, `citation`, and safe `run_status`/error state. Preserve summary
identity/order separately from final answer text. Opaque provider continuation
items remain server-side and never enter the UI reasoning preview. Do not rename
arbitrary provider reasoning text into an approved summary. Capability flags cover
summary availability and streaming, tool lifecycle detail, citations and interrupt
support per provider/model/access mode. A fake adapter with no summaries and sparse
tool events must render correctly.

Official OpenAI documentation, rechecked October 30, supports opting in with
`reasoning.summary: "auto"` on compatible models. The documented summary stream
uses `response.reasoning_summary_part.added/done` and
`response.reasoning_summary_text.delta/done`. It does not promise a preview for
every turn, immediate arrival, or a replication of ChatGPT's internal activity UI.
[Reasoning summaries](https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries),
[streaming event reference](https://developers.openai.com/api/reference/resources/responses/streaming-events).

Normalize these events into app-owned part upserts and persisted, coalesced text
updates. Preserve provider summary boundaries and incomplete status. A Thinking
label may accompany an observed reasoning phase; an initial generic Working
state covers the period before a provider exposes a phase. Preview expansion
appears only when actual summary content exists. Missing summaries leave ordinary
status plus tool activity; do not manufacture commentary or run a second model
just to simulate a live thought preview. An elapsed duration measures wall time
between recorded application phase timestamps, not provider reasoning-token time
or a completion percentage. Completion must stop timers and live spinners.

Provider-native web activity documents `response.web_search_call.in_progress`,
`.searching`, and `.completed`, and output items can expose search/open/find
actions, queries and source annotations. Details may arrive only with a completed
item, and queries can be absent. Persist what was provided; say Working with web
results when a more specific phase is unavailable. A completed web tool is not
proof that a page's full text was acquired.
[Web search](https://developers.openai.com/api/docs/guides/tools-web-search),
[streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events).

Library activity comes from our actual tool executor: validated invocation,
start, result/evidence commit, and error/cancellation. Show human labels such as
Searching your library and Reading item details; expanded rows may show the safe
filters/question, returned count/coverage, sources, and succeeded/failed/stopped
state. Do not expose raw credentials, internal object keys or raw tool JSON by
default. Preserve the exact supporting returned evidence separately from the
short display description. Invalid partial streamed arguments never execute.

Each activity has app `activityId`, run/attempt/call IDs, kind/tool, optional
parent group, status, safe display data, evidence references and known start/end
timestamps. Logical tool statuses are `pending | running | succeeded | failed |
cancelled | interrupted | outcome_unknown`; provider mapping may skip phases.
Record failure and unknown outcomes honestly. Persist deduplicated provider item
identities so final items, replay and repeated done events cannot add calls.

**N tool calls** counts distinct executed logical calls: app calls when dispatched,
hosted calls when observed as provider tool items. It does not count streamed
argument fragments, sources, returned items, lifecycle events, tokens or title
jobs. Replaying events or retrying transport adds zero. Retrying the same logical
call adds an attempt to its expanded row; a genuinely new invocation gets its
own identity. Reused cached results are labeled reused, not a new external
execution. For a web-research wrapper, count its visible leaf calls once when
available; represent the wrapper as a group, not a second counted invocation.
If only the wrapper's execution is observable, count that one operation without
inventing unseen subcalls. Expose the counting scope with the activity projection;
UI totals are not provider invoice counters.

All three mocks use explicitly synthetic summaries, timings, counts and sources.
Live acceptance must exercise the selected account/model's summaries, web/tool
items and adapter mapping. Screenshots/offline event fixtures establish layout
and mapping behavior, not live model entitlement.

## Stop, partial output and deletion

Stop persists cancellation intent before aborting supported inference and tool
requests. It blocks new steps, tool dispatch and automatic retry, retains committed
partial answer/summary/evidence, and emits one terminal status. A committed final
completion wins over a later Stop. If cancellation commits first, fencing rejects
late text/results as visible response updates; retain only necessary safe usage/
cleanup diagnostics. Neither disconnect nor tab navigation is Stop. Failed and
interrupted output remains labeled partial after reload, with a safe reason and
no permanent Thinking/Searching indicator. A later user message is a new turn,
not a silent replay of the stopped request.

Deleting an active chat commits a conversation tombstone and cancellation intent
atomically, removes it from both lists, and stops new inference immediately.
The DO-local outbox publishes a monotonic tombstone to D1; stale title/index/run
writers cannot resurrect it. Use local optimistic removal while publication
catches up; the tombstoned object rejects ordinary reads, replay, evidence and
mutation. Keep minimal deletion markers until dispatch/index/cleanup races are
fenced. Cleanup retries idempotently remove conversation content, derived
summaries, chat-owned evidence snapshots and R2 objects, and provider copies
actually created. Deletion does not remove imported Library items or immutable
source evidence. Shared evidence stays source-owned; chat-owned snapshots are
cleaned separately. A backup/provider retention policy and cleanup failures must
be disclosed accurately; accepting Delete is not proof of instantaneous erasure
from backups or a remote service.

## Implementation acceptance

1. Prove first-Send idempotency, one active run, stale-head/metadata conflicts,
   accepted-work recovery and global admission using synthetic repositories.
2. Page more than 100 favorites and chats with timestamp ties, moves between
   sections, stale cursors, out-of-order index publications and reload; preserve
   every reachable item and stable scroll/focus. Metadata changes do not reorder
   activity. Collapse persistence is tested in the browser, not a preference API.
3. Race generated title against manual rename/delete and confirm manual state wins.
   Title failure consumes no unbounded retry loop and never blocks first Send.
4. Replay snapshots/events with duplicates/gaps, summary-only/final-only/sparse
   provider output, interleaved parallel tools, wrapper groups, cached results,
   call retries, failures and unknown outcomes. Counts are stable across reload.
5. Stop before dispatch, during inference/tool execution, between steps and against
   completion; restart/late events cannot revive work. Keep partials and accurate
   terminal reasons. Route changes and observation reconnects never duplicate work.
6. Delete active/inactive chats through provider completion, title callback and D1
   lag. Verify tombstone fencing, object/evidence access denial, cleanup recovery
   and preservation of all canonical Library/source records.
7. Use synthetic UI fixtures for desktop/narrow, light/dark, keyboard, hover/focus,
   expanding menus/activity, long titles and accessible Send/Stop/error states.
   After release-package and funding verification, perform a bounded real-account
   summary + web + Library turn; unsupported summary behavior must degrade cleanly.

No runtime implementation, inference call, account change or source-ledger
migration is performed by this documentation update. Record the proposed new
chat storage/runtime ADR before shipping; accepted ADRs remain unchanged.
