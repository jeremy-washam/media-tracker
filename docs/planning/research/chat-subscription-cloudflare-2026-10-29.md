# Subscription-only chat architecture research

Research date: 2026-10-30 UTC. Research only: no credentials inspected, no sign-in, no services created, no repository changes, no inference calls. Used official OpenAI Docs, Cloudflare Agents and Durable Objects skills. Public sources below were fetched. No account eligibility or live transport test has been performed.

## Recommendation

If Jeremy's personal plan qualifies for included API credits, use the existing React/Vite and Hono Worker application with one AIChatAgent Durable Object per conversation, the AI SDK, and an explicitly constructed direct OpenAI provider. Use the subscription's linked API organization with no purchased credits or Auto Recharge, and handle credit exhaustion as a terminal, recoverable UI state. This satisfies "personal subscription, not separate API costs" without requiring SIWC or a local runner. Keep future providers behind an application-owned capability adapter; an adapter is enabled only after verifying an allowed subscription or included-credit route. Never silently route to a paid fallback.

If included credits are unavailable and direct SIWC is eligible, put OAuth and provider execution in a local companion process. It connects outbound to the hosted application for user-authorized jobs and bounded library-tool requests. Cloudflare remains history/tool/coordination infrastructure; no SIWC credentials are stored in managed services. Whether a private client is eligible remains an account/access question, not something this architecture establishes.

## Included-credit route

The official benefit supports eligible paid Pro subscriptions at least seven days old, same-email ownership of the subscription and receiving API organization, and no API payment method is required. Published monthly grants are $100/$200/$500 for the corresponding Pro tiers. Credits cover normal API Platform usage, including Responses and built-in web-search/tool/storage charges. They expire each subscription billing cycle. Purchased credits are consumed after free credits; with no credits left, requests fail with 429 `credit_balance_exhausted`. Codex use through API keys is specifically excluded. [Official benefit and eligibility](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

Practical implication: a low-friction hosted deployment is possible without extra inference spend, but verify the actual organization's credit grant, purchased balance and billing settings first. An application budget is useful for conserving allowance; it is not a substitute for the provider-level absence of a paid continuation path. Existing Cloudflare infrastructure costs remain separate from inference cost.

## SIWC eligibility and protocol

The quickstart says plan usage is available to all open-source partners and selected private clients; selected commercial partners remain a limited trial. Do not assume this private repository qualifies. [Quickstart](https://developers.openai.com/siwc/quickstart). The OSS/local-app flow dynamically registers a client using its actual app name, persistent host ID, loopback callback, PKCE/state/nonce, and separate user consent for inference. It returns a user/workspace-bound issued client ID, then OAuth tokens; later authentication reuses that registration. [Registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

SIWC uses public `https://api.openai.com/v1/responses`, not `backend-api`. Discover the signed-in account's model catalog. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

SIWC preview requires `store:false`, HTTP `stream:true`, full contextual input, and instructions/developer messages. It rejects normal API fields including output-token caps, metadata, sampling fields, HTTP previous-response IDs and conversation pointers. Function/custom tools need namespaces or `additional_tools`; web search depends on model/account policy. Hosted MCP, file search, tool search and several other hosted tools are unsupported. Therefore do not assume ordinary API compatibility. [Preview contract](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Credential docs require protected local or self-hosted runtime storage and exclude browser storage/logs. Self-hosted VM docs describe OAuth locally then secure credential transfer and VM-owned refresh. They do not establish that managed Workers token persistence is permitted. [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms). Parent agent should reconcile the linked SIWC legal terms with the VM guide before any remote SIWC deployment; this report does not give a legal determination.

## Cloudflare framework choice

AIChatAgent handles SQLite message persistence, buffered WebSocket reconnect, client/server tools, and explicit stop. Pass its abort signal into model and tool calls; otherwise upstream inference can continue. Browser disconnect ordinarily leaves the turn running. Reconnect replays a still-running stream; eviction permanently destroys the upstream connection and triggers durable retry/continuation from stored state, not a magical continuation of the same model stream. Recovery has bounded-work hooks and should treat quota/auth/policy errors as terminal. Cancellation that must survive a restart needs persistent intent. [Chat lifecycle](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/).

Think adds tree sessions, non-destructive branching, context blocks, compaction and session search. It owns the agentic loop and is still experimental. Its overview discusses matched AI SDK v6/react v3 or v7/react v4; however the latest published Think 0.23.0 requires AI SDK v7, as verified below. [Think](https://developers.cloudflare.com/agents/harnesses/think/). Configuration defaults are ten tool rounds, no configured compaction, no overflow policy, and no scheduled tasks. Compaction and overflow retries are opt-in, not proven unavoidable hidden inference. [Configuration](https://developers.cloudflare.com/agents/harnesses/think/configuration/).

Choose AIChatAgent initially because this app needs explicit provider and evidence control more than writable agent memory or subagents. Think is defensible if non-destructive branch/session functionality is an immediate requirement. A plain DO requires rebuilding replay cursors, stream persistence, stop propagation, turn admission, recovery, partial tool repair and durable terminal states. Local execution does not make hosted persistence/coordination unnecessary; it does mean AIChatAgent's model loop should not also run a second independent loop in the companion.

## Actual public source evidence

Fetched/pinned source commits (not installed or tested release claims):

- Cloudflare agents `be1749221ab3efc8be4e976d8e7d8344d1446032`.
- Vercel AI SDK `dfed8e8234b684c3e2a0571ad1a1078c8364b44c`.

AI SDK's request builder defaults conversion to stored-history behavior unless `store:false` is supplied, forwards output caps/sampling/provider metadata when configured, and exposes an injectable fetch. The tool serializer now supports `tool.providerOptions.openai.namespace`; without it, function tools remain top-level. Consequently a carefully configured current SDK adapter can plausibly satisfy SIWC without body rewriting. A custom fetch/LanguageModel adapter can enforce an allow-list and tool packaging, but cannot cure eligibility, billing, credential-policy or unsupported-tool restrictions. [Request builder lines420–444 and590–643](https://github.com/vercel/ai/blob/dfed8e8234b684c3e2a0571ad1a1078c8364b44c/packages/openai/src/responses/openai-responses-language-model.ts#L420), [namespaces lines155–210](https://github.com/vercel/ai/blob/dfed8e8234b684c3e2a0571ad1a1078c8364b44c/packages/openai/src/responses/openai-responses-prepare-tools.ts#L155), [provider configuration](https://ai-sdk.dev/providers/ai-sdk-providers/openai).

Think forwards system/messages/tools/provider options/sampling/output settings to streamText, with synthetic `final_answer` tools on structured turns. Namespace every injected tool for SIWC, not merely app library tools. Bare model strings resolve through Workers AI/AI Gateway; return a direct LanguageModel to avoid accidental gateway billing/routing. Its compaction helper takes an explicit summarization callback. [Think model routing](https://github.com/cloudflare/agents/blob/be1749221ab3efc8be4e976d8e7d8344d1446032/packages/think/src/think.ts#L5164), [streamText configuration](https://github.com/cloudflare/agents/blob/be1749221ab3efc8be4e976d8e7d8344d1446032/packages/think/src/think.ts#L7630), [compaction helper](https://github.com/cloudflare/agents/blob/be1749221ab3efc8be4e976d8e7d8344d1446032/packages/agents/src/sessions/compaction-helpers.ts#L279).

Both chat frameworks use Sessions sanitization, which strips OpenAI `itemId` and `reasoningEncryptedContent`, including call metadata, then removes empty reasoning. This is lossy for an application needing opaque provider replay state. The AIChatAgent custom sanitize hook runs after normalization. Preserve raw provider state separately rather than assuming UI messages retain it. [Exact sanitizer lines49–114](https://github.com/cloudflare/agents/blob/be1749221ab3efc8be4e976d8e7d8344d1446032/packages/agents/src/sessions/sanitize.ts#L49), [AIChatAgent hook](https://github.com/cloudflare/agents/blob/be1749221ab3efc8be4e976d8e7d8344d1446032/packages/ai-chat/src/index.ts#L6370).

## Storage and application boundaries

Prefer one authoritative conversation store: per-conversation DO SQLite behind an application-owned ConversationRepository and versioned export schema. D1 owns a rebuildable cross-conversation index/search projection. R2 holds large original evidence/provider payloads, tool-result originals, exported transcripts and backups. Domain tools continue to call validated parameterized repository queries against D1, with evidence IDs and bounded results; the model receives neither SQL nor storage credentials. Keep `search_media`, `get_media_details`, `aggregate_history`, and `get_evidence` portable; use provider-native web search through adapter capabilities.

Do not call the DO transcript disposable while a turn runs: SDK recovery depends on it. Duplicating authoritative D1 and DO transcripts adds cross-store dual-write recovery. If D1 archival storage is required, emit an idempotent durable outbox from the DO and define acknowledgement/reconciliation explicitly; there is no cross-store atomicity.

Avoid AIChatAgent's destructive regeneration/clear/oldest-message deletion as product semantics. Initially create a fresh attempt/branch while preserving the prior answer, use separate context pruning, and retain raw evidence before any SDK truncation/compaction. If these branch requirements dominate, use Think Sessions behind the same repository/export adapter.

## Minimum remaining verification

1. User-visible, credential-safe account check: actual Pro tier/age, included grant, linked org ownership, no purchased balance or Auto Recharge, selected model and web-search permission. Do not activate a benefit or change billing during research.
2. Expand the successful published-package offline probe below to multi-step namespace round-trip/tool choice and encrypted reasoning preservation. Pin the selected versions before implementation.
3. Authorized live smoke test only after the account route is selected: one minimal text turn, one library-tool continuation, one web search, stop, reconnect, forced process restart, quota exhaustion handling. Verify all calls hit the selected included allowance and never a fallback.
4. Integration tests must cover duplicate submit/tool results, crash between durable tool completion and continuation, archive export/reimport, branch preservation and cancellation after restart. Recovery is allowed to issue a new inference call; it must never repeat unsafe effects.

## Executed published-package offline probe

Scratch installation used public npm registry packages with lifecycle scripts disabled. Exact installed versions: `ai 7.0.157`, `@ai-sdk/openai 4.0.105`, `@ai-sdk/provider 4.0.34`, `zod 4.6.7`; Node `25.6.1`. Lockfile is retained in `sdk-probe/package-lock.json`.

Command: `node /private/tmp/imladris-subscription-verification/sdk-probe/probe.mjs`. Result: PASS, exit 0. All model fetches were replaced with local functions; the only external network was npm package retrieval. Fake key literal only. No OpenAI authentication, models listing, inference or web-search requests occurred.

- Ordinary `streamText` defaults emitted `/v1/responses`, `stream:true`, no explicit `store`, and two top-level function tools.
- Explicit `.responses('gpt-6.1-sol')`, `store:false`, `systemMessageMode:'developer'` and per-tool `providerOptions.openai.namespace` emitted one namespace containing both library tools, developer instructions, streaming and no listed SIWC-banned fields. Namespace support is in the published adapter, not only main source.
- Deliberately setting output-token limit, maximum tool calls, metadata and previous-response ID emitted the prohibited fields. The selected reasoning model's adapter dropped supplied temperature/topP; this does not establish compatibility of sampling settings for other models.
- `generateText` issued a nonstreaming request, so an application-configured summarization callback using it would violate SIWC's HTTP streaming requirement. This is not evidence that Think defaults make such a call.
- A synthetic SSE URL citation produced an AI SDK `source` part with the correct URL/title; text completed successfully. An abort signal reached the fake fetch and emitted an `abort` stream part. This verifies adapter parsing/propagation only, not Cloudflare's complete persistence, reconnect, eviction recovery or real provider cancellation.

Artifacts: [executable probe](chat-sdk-probe-2026-10-29.md#probe-source), [full emitted request bodies and assertions](chat-sdk-probe-2026-10-29.md#recorded-output), [package lock](chat-sdk-probe-2026-10-29.md#package-versions). Every compatibility claim above is bounded to these exact versions and synthetic fixtures; actual SIWC account eligibility and server acceptance remain untested.

## Published Cloudflare peer-dependency check

Read official npm metadata with `npm view <package> version peerDependencies --json`; no Cloudflare packages were installed. Latest metadata at verification:

| Package               | Published version | Relevant peer requirements                                                                                                  |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `agents`              | `0.32.0`          | `ai ^6.0.0                                                                                                                  |     | ^7.0.0`; `@ai-sdk/react ^3.0.0                           |     | ^4.0.0`; `@ai-sdk/provider ^4.0.0`; `zod ^4.0.0`; `react ^19.0.0` |
| `@cloudflare/ai-chat` | `0.12.2`          | `ai ^6.0.0                                                                                                                  |     | ^7.0.0`; `agents >=0.25.0 <1.0.0`; `@ai-sdk/react ^3.0.0 |     | ^4.0.0`; `react ^19.0.0`                                          |
| `@cloudflare/think`   | `0.23.0`          | `ai ^7.0.0`; `agents >=0.28.0 <1.0.0`; `@ai-sdk/react ^4.0.0`; `zod ^4.0.0`; `react ^19.0.0`; `@cloudflare/computer ^0.8.0` |
| `@ai-sdk/react`       | `4.0.161`         | `react ^18                                                                                                                  |     | ~19.0.1                                                  |     | ~19.1.2                                                           |     | ^19.2.1` |

Thus the tested `ai 7.0.157`, OpenAI adapter `4.0.105`, provider `4.0.34`, and Zod `4.6.7` satisfy current `ai-chat 0.12.2` / `agents 0.32.0` peer constraints. Add `@ai-sdk/react 4.0.161` and ensure the app's exact React patch meets the intersection (React 18 is excluded by ai-chat, and React 19.0.0 does not satisfy the React hook's patched ranges). This is dependency metadata compatibility, not a full installed-stack runtime test.

`agents` marks most integration peers optional, including AI SDK, React and provider; its extra listed SDKs are not all mandatory installations. Think marks React, React SDK and Telegram optional, but not `@cloudflare/computer`. Do not pick latest Think with AI SDK v6 based solely on the broader docs claim. Official registry evidence: [agents](https://registry.npmjs.org/agents/latest), [ai-chat](https://registry.npmjs.org/@cloudflare%2fai-chat/latest), [Think](https://registry.npmjs.org/@cloudflare%2fthink/latest), [React hook](https://registry.npmjs.org/@ai-sdk%2freact/latest).

Memory used only for established project portability/evidence expectations and tool names; present provider behavior was verified live from official sources. Memory reference: MEMORY.md lines1166–1177, rollout `01a0bbdb-d56b-78f3-ab28-31fa72c9468a`.
