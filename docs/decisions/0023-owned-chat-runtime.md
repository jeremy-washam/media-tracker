# ADR 0023: Application-owned chat runtime and provider adapters

- Status: Accepted
- Date: 2026-10-30
- Related: ADRs 0005, 0006, 0019, 0021; [Chat design](../planning/chat-implementation-design.md)

## Context

The owner approved standard Chat with the Familiar interface, persistent history,
Stop/reconnect, Library reads, public web search, OpenAI first, and provider
portability. Inference must use included Pro API credits without purchased-credit,
recharge, or paid-provider fallback. The owner authorized implementation, tests,
private deployment, and at most $13 of live test usage.

The researched first choice was AIChatAgent, conditional on proving trusted
admission and retained history. Inspection of the released `@cloudflare/ai-chat`
0.12.2 package found that its default message path broadcasts and persists the
client's transformed history with `_deleteStaleRows: true` before
`onChatMessage`; its separate client `messages` event also persists supplied
history. These defaults conflict with immutable server-owned admission. Wrapping
or replacing those paths while maintaining a second SDK history would remove
much of the shortcut. This is a finding about that released integration, not a
claim that Cloudflare Agents cannot support trusted applications.

## Decision

Use the explicitly planned fallback: one plain SQLite Durable Object per
conversation, the official OpenAI SDK 7.45.1, an owned bounded tool loop, and
persisted application SSE events. No SDK message-mutation or WebSocket endpoint
is exposed. Hono validates requests after existing owner Access/MFA. SQLite
repositories own admission, history, metadata revisions, attempts, status and
outbox; D1 owns only the rebuildable collection index, concurrency leases and
credit reservations. Private R2 holds original tool evidence and opaque native
provider checkpoints, separately from public UI parts.

A provider implements neutral message/tool-result/checkpoint inputs, public event
normalization, usage, reservation and charging. OpenAI translation stays in its
adapter. A different synthetic provider with unrelated checkpoint shape and no
summaries verifies this boundary. There is no automatic provider/model fallback.
The first model is GPT-6.1 Sol, standard service tier, `store:false`, with optional
approved reasoning summaries. Hidden reasoning is never rendered.

First Send derives routing from its UUID operation key. Transactional admission
accepts only new text and expected transcript head; duplicates must match their
original payload. One active run per conversation and two provider workloads
across conversations are admitted. Alarms execute accepted work independently
of observers. Stop commits terminal state before aborting transport. Running
work found after a restart becomes interrupted; ambiguous inference is never
resubmitted automatically. Queued, undispatched work is recoverable.

Native public web search runs in an isolated request receiving only its bounded
public query. It does not receive the chat transcript or Library results. Known
private excerpt overlap and obvious secrets/local URLs are blocked. This is a
useful boundary, not a proof that arbitrary model-written queries cannot disclose
private information; extraction rules and prompt-injection defenses retain that
residual risk. No arbitrary server fetch, shell, computer, or connector-write
tool is enabled.

## Consequences and limits

We own and test more lifecycle code. Domain records and repository ports stay
independent of Cloudflare. SSE replay, partial answers, metadata CAS, tombstones,
late callbacks, bounded credit admission and a fresh-SQLite restore are explicit
checks. Export is versioned; recovery is an operator interface, not a new user
import workflow. Chat deletion removes only chat-owned evidence/checkpoints.

Credits expire at the configured period boundary. Each actual provider call,
including title/search requests, reserves allowance before submission. Unknown
costs keep their reservation; automatic inference retries are disabled. The
initial app allowance is $13 and expires conservatively at November 12 00:00 UTC.
This local estimate is not an account balance API or a guaranteed invoice cap.
The verified account has no paid API billing plan/payment method; changing its
funding requires a new review. No funding or recharge is configured by this app.

All original messages remain saved. The active model context uses bounded recent
visible turns; older turns are not automatically summarized by another paid call.
Tool outputs retain exact evidence and disclose bounded context previews.
Album/artist/show/channel catalog enrichment is not yet exposed to models; Spotify
API catalog fields are excluded pending a provider-specific permission decision.
These are disclosed first-release limits, not promises of ChatGPT feature parity.

Sources: [released chat package](https://www.npmjs.com/package/@cloudflare/ai-chat/v/0.12.2),
[SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/),
[OpenAI reasoning summaries](https://developers.openai.com/api/docs/guides/reasoning),
[included API credits](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).
