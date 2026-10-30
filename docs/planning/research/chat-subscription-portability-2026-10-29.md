# Independent architecture and subscription portability audit

Research date: 2026-10-29. Documentation-only. No credentials inspected, no sign-in, model calls, provisioning, or repository edits. Official OpenAI docs and Cloudflare Agents SDK skills used. Repository product context, architecture, standards, vision, planning and ADR index consulted. Recommendations below are engineering judgments, not claims of tested account entitlement.

## Decision

Prefer a **hosted AIChatAgent shell with an application-owned bounded retrieval/tool loop**, funded solely by API credits already included with an eligible personal ChatGPT Pro subscription, if the owner accepts that funding interpretation. Keep React/Vite, Hono, D1 and R2. Add one Durable Object per conversation for execution and stream recovery. Use ordinary OpenAI Responses through an explicit provider adapter. Do not add Think, an autonomous memory agent, a vector service, or a general model-executed SQL console for the first version.

If the owner specifically requires shared signed-in ChatGPT allowance rather than included API credits, choose a **local SIWC companion with its own narrow Responses loop**. Do not run the local-only authorization route inside the hosted Worker and call it local. A private hosted SIWC integration needs confirmed eligibility/approval. Both options can share chat contracts, evidence tools, repositories and context planning; their credentials, execution ownership and request dialect differ.

## Funding: what is verified

[API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) documents Pro $100/$200/$500 tiers receiving matching monthly credits, subscription at least seven days old, same-email ownership and linking to an API organization. Credits expire at the billing cycle. No API payment method is required. Responses and built-in tools are covered; Codex API-key usage is excluded. If purchased credits remain, usage continues into them; otherwise exhausted balance returns 429 `credit_balance_exhausted`.

Therefore a dedicated linked organization with no purchased credits, payment method or recharge is the strongest practical hosted setup for “personal subscription, no separate API costs.” Nothing here proves the owner's tier or eligibility. Do not activate the benefit during research.

[Spend limits](https://developers.openai.com/api/docs/guides/spend-limits) now documents hard organization/project limits, but enforcement can lag. Do not promise an exact instant or penny cutoff. Independently reserve a conservative per-request cost, limit concurrency, context, output, tool rounds and web calls, stop with a large reserve before grant depletion, and prohibit paid fallback. Application counters need a known billing-cycle/grant baseline and exclusive organization usage; otherwise they are only estimates. The published credits guide does not establish a generally available live credit-balance API.

## Hosted architecture

[Cloudflare's Think comparison](https://developers.cloudflare.com/agents/harnesses/think/) describes AIChatAgent as protocol plumbing with the LLM call owned by the app, whereas Think supplies an opinionated loop, persistent model-writable memory, session trees and compaction. Think's `runTurn` remains experimental. This archive needs precise retrieval and ordinary chat before autonomous long-term memory.

[AIChatAgent](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/) supplies SQLite messages and buffered reconnect streams. Reconnect resumes the same active generation; eviction destroys the upstream connection and recovery may generate a new continuation. Its defaults can delete old messages, compact oversized tool payloads, strip provider metadata, and regenerate destructively. Persist cancellation intent because in-memory AbortSignals do not survive restart. Forward cancellation to model calls. Override and test recovery budgets; retries consume inference allowance.

Recommended division:

- Hono authenticates every HTTP request and WebSocket upgrade using the existing owner boundary. Never expose a raw DO endpoint that bypasses it.
- React uses the chat adapter for streaming, status and reconnect, with application IDs and request idempotency keys. A second device can attach to the same conversation without creating a second turn.
- One conversation DO serializes turns. Its runtime state owns active attempts, cancellation, live sequence numbers and replay buffers. This is execution state, not the canonical media ledger.
- A framework-independent chat service owns context selection, tool allowlists, budget admission, stop conditions and domain event semantics. Provider adapters emit normalized visible events while preserving provider-specific resumable state separately.
- Existing repositories own bounded archive queries and content details. R2 remains private authorized full text and raw evidence storage.

## Storage authority: application-owned archive, not SDK rows

I recommend **application-owned D1 chat history and evidence manifests as the durable product record**, while SDK DO message tables are an operational projection and active stream store. This fits the accepted D1/R2 and portability decisions. Do not make UIMessage JSON or Codex rollout files the only copy of a conversation.

Suggested records: conversations; authored messages; immutable turn attempts and their status; parent/branch relations; tool executions with schema version; evidence citations; model/provider/funding identity; context manifests; usage reservations and actual usage. Store large raw provider output or evidence snapshots by private R2 hash reference. Imported media facts remain in their current canonical tables. Generated conclusions never update them.

Avoid naive best-effort dual writes. Persist a user command in D1 before acknowledging it; deliver its stable ID to the DO. DO writes execution results and an outbox before reporting a terminal turn, then idempotently commits the complete attempt/evidence manifest to D1 and marks the outbox acknowledged. Reconcile unacknowledged results on activation. Product history/export reads D1 plus explicit pending execution status. Final delivery must distinguish generated-but-archival-pending from archived completion. This is extra work but necessary if D1 is declared authoritative; a simple onFinish mirror is not sufficient.

Retain original and failed/interrupted attempts. Retry/regenerate creates a new attempt or branch, never deletes previous answers. Summaries are versioned derived context overlays with source message ranges; trimming the prompt must not delete stored chat history. Do not enable SDK deletion-based retention. Small tool envelopes avoid row-limit truncation; immutable evidence exists outside UI stream rows. An export must include conversations, branches, attempt outcomes, evidence manifests and referenced objects, not only rendered text.

Alternative worth recognizing: app-owned immutable tables in DO SQLite could be authoritative and D1 only a discovery index, avoiding dual writes. That is operationally simpler but introduces a new product storage authority/export path and deserves an ADR. I prefer the explicit D1 archive boundary for this repository, given existing storage ownership and the requirement to retain provider-independent provenance.

## Tools and context

Begin with typed `search_media`, `query_history`/aggregates, `get_media_details`, `get_annotations`, and `get_content_chunks`. Query tools accept constrained filters/groupings, never arbitrary SQL. Distinguish an item from consumption occurrences, personal from community ratings, unknown from missing dates, full text from snippets/transcripts, and coverage from completeness. Return bounded pages, total/count meaning, provenance IDs, content availability and stable references. Answer counts via exact aggregate queries instead of counting search hits.

Content retrieval is opt-in per tool need: first metadata/history search, then selected details, then bounded relevant text. Use current lexical/structured search initially. No paid embeddings or hosted file-search dependency is needed. Cite exact source/version and chunk offsets; answers may combine recorded facts and explicitly labeled inference. Web results carry external URLs and retrieval dates and do not become consumption events.

The context planner selects current branch messages, prior summaries and evidence within a conservative budget. Keep raw provider items separately, including encrypted reasoning state where required. [OpenAI reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning) instructs stateless clients to preserve returned reasoning and tool-call/result items for continuation. A normalized prose transcript alone is insufficient for the same provider's next tool step.

## Local shared-allowance route

[SIWC's official cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) explicitly includes locally running personal projects. A local process handles official OAuth with PKCE, stable installation host ID, saved client registration and protected token storage; the renderer receives no tokens. Identity sign-in and permission to spend the plan are distinct.

[SIWC models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) requires public `/v1/responses` with OAuth bearer auth, `store:false`, `stream:true`, account-specific model discovery and a terminal completed event. A populated model picker does not prove successful inference entitlement.

[Preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) prohibit HTTP `previous_response_id`, persistent Conversations, background requests and numerous ordinary API fields. Supply the needed input history every call. Function/custom tools must be namespaced or supplied as additional tool input. Web search depends on account/model policy. Hosted MCP, file search, tool_search, Code Interpreter and image generation are unsupported. WebSocket continuation is connection-local, not durable history. This requires a distinct adapter, not swapping credentials on the standard API body.

Use a loopback companion serving the local app or a desktop shell. Serving UI and companion together avoids fragile hosted-origin-to-loopback browser policy, mixed-content and cross-origin access. Bind loopback, validate Host/Origin, require pairing/session auth, prevent CSRF/DNS rebinding, and allow only app-specific query tools. A desktop wrapper improves lifecycle/keychain integration but is not required for the first local version. Local chat is unavailable when the computer is asleep or companion stopped; a phone cannot reach that computer's loopback. A securely paired remote relay is another feature and security boundary, not a free consequence of adding chat.

[SIWC overview](https://developers.openai.com/siwc/token-sharing-open-source) directs paid/remotely hosted integrations to an interest/approval path. [Self-hosted VM guidance](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) is specifically for OSS apps on a user VM, not a blanket exemption for every private hosted application.

## Codex App Server alternative

[App Server](https://learn.chatgpt.com/docs/app-server) is a supported rich-client runtime with persisted threads, resume/fork, streamed items, interrupt and tools. Legacy app-server authentication has never been permitted for commercial/hosted services; local and OSS use remains documented. Dynamic tool injection is experimental. This is broader machinery than the narrow read-only archive tool loop.

[SIWC App Server configuration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) sends the user OAuth token to public Responses over HTTP/SSE. The app owns refresh; documentation says restart with the renewed token and resume the saved thread ID. Model/list can be a bundled catalog. App Server is useful if rich Codex runtime behavior is actually wanted; it does not remove SIWC eligibility, request limitations, token lifecycle or application archive requirements. Isolate its filesystem/configuration and deny shell/write tools rather than opening the media repository to a general agent.

## Other providers: portable boundary, unpromised allowance

Claude: [official plan guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), updated October 7, says Agent SDK, `claude -p` and third-party app usage still draw subscription limits. But [Agent SDK quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart) says developers may not offer Claude.ai login/rate limits without approval. [Legal/authentication guidance](https://code.claude.com/docs/en/legal-and-compliance) forbids collecting/intermediating Claude session credentials while expressly permitting an end user signing into an unmodified Claude Code binary. A future personal runtime adapter can use the official unmodified runtime and user-managed sign-in, subject to confirming the current use case terms; do not implement a generic scraped-token Messages client or promise general hosted entitlement. Current Max/Team included API credits provide another future funding avenue but require separate verification.

Gemini: [official CLI authentication](https://geminicli.com/docs/get-started/authentication/) tells AI Pro/Ultra users to sign in with the associated Google account; cached auth can be reused headlessly. [ACP mode](https://geminicli.com/docs/cli/acp-mode/) and [headless mode](https://geminicli.com/docs/cli/headless/) provide programmatic runtime interfaces. These establish CLI integration candidates, not entitlement to call the ordinary Gemini API using consumer OAuth. [Terms](https://geminicli.com/docs/resources/tos-privacy/) distinguish open-source software licensing from service terms. Confirm allowed embedding/use and quota at implementation time.

Provider portability means stable conversations, evidence IDs, tools and visible event contracts. It does not mean shared auth, billing, reasoning state or native thread IDs. Switching provider should create a new attempt/branch from exported visible context and cited evidence, with a disclosed handoff; don't claim lossless hidden-state transfer.

## Modest UI and next gate

Initial product: standard Chat destination, new conversation, history/rename/bookmark, composer, streamed answer, Stop, retry as retained attempt, clear connection/usage/error state and clickable evidence opening the existing compact inspector. Library stays intact; an item can start an explicitly scoped chat. Use existing shadcn/Base UI controls. No permanent Library reference pane, autonomous memory management, new workspace tabs, arbitrary dashboards or artifact builder is required. Named saved outputs can follow; bookmarking a chat is the documented MVP fallback.

Before implementation choose only the funding/runtime branch: eligible included-credit hosted route or local shared-allowance SIWC route. Then write the storage/lifecycle ADR, build synthetic contract/reconnect/cancel/retry/export tests and a small vertical slice. Genuine account access, allowed web-search/model behavior, grant eligibility, quota exhaustion and hosting approval remain unverified until an explicitly authorized later probe. Cloudflare incremental DO/D1/R2 usage also needs measurement against the owner's existing no-additional-charge constraint.
