# Chat integration options

- Status: Direct SDK and owned Durable Objects selected after released-package inspection
- Updated: 2026-10-30
- Basis: Three independent data-only reviews plus a repository-specific comparison

These options concern who owns the conversation/run engine. Model choice is a
separate decision. None automatically supplies every tool available in ChatGPT
or Codex; configured tools, execution environments, credentials, and costs still
need to be integrated.

## Options

The [access design](chat-subscription-access.md) now distinguishes included Pro
API credits from SIWC shared plan quota. The owner has Pro. Prefer hosted ordinary
Responses funded only by the included benefit, after no-paid-funding checks. This can meet the no-additional-API-cost requirement without SIWC's private
hosted approval. On October 30 the owner linked the subscription and supplied
a screenshot showing $43.00 available API credit. No agent key creation, billing
change or inference occurred.

| Option                                               | Pros                                                                                                                                                                 | Cons                                                                                                                                                                                                       | Fit for Imladris                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Direct provider SDKs + our backend**            | Full control of history, citations, tool execution, and provider-native events. Fits existing Hono/D1/R2 boundaries. Few framework assumptions.                      | Most lifecycle work: durable acceptance, streaming replay, Stop, crash recovery, branches, compaction, and provider translation.                                                                           | Strong choice when control and portability justify owning more software. This was the common approach in the independent reviews.            |
| **2. AI SDK + our backend**                          | Shared model/tool interfaces, streamed typed parts, and optional React chat hooks. Reduces repeated provider integration work.                                       | Does not supply a durable run service or production persistence by itself. Native provider capabilities still need testing; we still own Stop/recovery/history.                                            | Useful middle ground if its adapters preserve the native features we need. It does not require Next.js or Vercel hosting.                    |
| **3. Cloudflare chat stack (`AIChatAgent` / Think)** | SQLite-backed conversations, buffered stream replay, tool support, and recovery mechanisms already exist on our hosting platform. Think adds a higher-level harness. | Cloudflare-specific runtime/storage. Need to resolve SDK message storage versus our own archive, export/backup, branch behavior, and recovery policy. Some Session APIs are experimental.                  | Strongest shortcut for the existing platform; deserves a proof before building our own lifecycle.                                            |
| **4. OpenAI managed Agents API**                     | OpenAI runs the durable harness, sessions, compaction, and recovery. Supports web tools and custom application functions; a sandbox is optional.                     | Provider-owned session state and stronger OpenAI coupling; separate app archive/export/deletion remains necessary. Current beta/account eligibility, retention, and native capabilities need verification. | Attractive if minimizing orchestration code outweighs provider portability. We can still execute Library functions privately in our backend. |
| **5. Larger framework: LangGraph or Mastra**         | Richer workflows, checkpoints, branching, and tool orchestration; useful for complex investigations and future automation.                                           | More abstractions, configuration, storage adapters, and deployment surface. Persistent checkpoints and execution infrastructure still matter; current Mastra durable-agent API is beta.                    | Worth considering if complex workflows are near-term requirements; likely more machinery than standard chat needs initially.                 |

Documentation supporting the comparison:

- Direct provider integration: [OpenAI SDK](https://developers.openai.com/api/reference/typescript),
  [function execution](https://developers.openai.com/api/docs/guides/function-calling).
- AI SDK: [agent loop](https://ai-sdk.dev/docs/agents/overview),
  [persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence),
  [resume and explicit Stop](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams).
- Cloudflare: [chat persistence, replay, and recovery](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/),
  [Think](https://developers.cloudflare.com/agents/harnesses/think/),
  [Session storage](https://developers.cloudflare.com/agents/runtime/lifecycle/sessions/).
- Managed OpenAI: [overview and retention](https://developers.openai.com/api/docs/guides/agents-api/overview),
  [application-executed functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions).
- Larger frameworks: [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence),
  [Mastra durable agents](https://mastra.ai/docs/harness/durable-agents).

## Recommendation after subscription verification

The conditional recommendation was **3: AIChatAgent**. Inspection of released
`@cloudflare/ai-chat` 0.12.2 found browser-history persistence before the model hook
and a separate history-mutation message path. The implementation therefore takes
**1: direct provider SDKs + our backend**, using existing SQLite Durable Objects,
D1 and R2. [ADR 0023](../decisions/0023-owned-chat-runtime.md) records the finding,
owned history/streaming responsibilities, tested provider boundary, and limits.
This changes the runtime choice, not the included-credit funding route.

Option **1** is the implemented fallback after that inspection. Option **4** can be funded
by included credits but is deferred for stronger provider-owned lifecycle coupling;
subscription funding alone no longer excludes it. Option **5** lacks a concrete
initial workflow benefit.

If included credits cannot be activated, local personal SIWC is a distinct access
choice. Private hosted SIWC needs approval; neither a framework nor a local proxy
automatically changes that eligibility. A companion is not required by the
recommended Pro-credit route.

Three new independent audits converged on this recommendation. They complement
the earlier data-only reports; their [triage and executable offline probe](research/chat-access-verification-2026-10-29.md)
record current findings and remaining account/integration checks. No framework's
end-to-end runtime has been proven in Imladris yet.

## Model/provider options

| Provider           | Advantages to test                                                                                                               | Tradeoffs to test                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| OpenAI Responses   | Integrated function/web tools and optional background retrieval/cancellation in ordinary API mode. OpenAI is selected initially. | Provider-native continuation items and background retention/latency need explicit handling.                             |
| Anthropic Messages | Native citations and separate hosted web search/page/PDF fetch. One independent review preferred it.                             | Different message/tool blocks and partial-stream recovery semantics need a separate adapter.                            |
| Gemini             | Search grounding, URL context, and multimodal capabilities.                                                                      | Grounding presentation, model-specific tool combinations, data treatment, terms, and billing need their own validation. |

Sources: [OpenAI tools](https://developers.openai.com/api/docs/guides/tools),
[background mode](https://developers.openai.com/api/docs/guides/background),
[Claude fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool),
[Claude citations](https://platform.claude.com/docs/en/build-with-claude/citations),
[Gemini grounding](https://ai.google.dev/gemini-api/docs/google-search),
[URL context](https://ai.google.dev/gemini-api/docs/url-context).

OpenAI is selected for the first implementation. The research has not established
a quality winner. Add other providers behind the same contracts; compare representative
questions, evidence support, latency, complete turn cost, and failures on the
same fixtures. New credentials, paid evaluations, or services were not activated.

## Common requirements

Every option needs authenticated application controls, durable cancellation,
disconnect/reconnect semantics, idempotent submissions, bounded retries/allowance and infrastructure usage,
traceable citations, private attachments, export/deletion, and failure tests.
Preserve original chat history separately from context compaction. Do not promise
exactly-once external billing or that closing a stream cancels provider work.

Our two Library tools remain viable across these options. The agents suggested
more names, but their required functions fit `query_media` and optional detail
includes; change that boundary only if tool-use evaluations demonstrate a reason.

Independent evidence: [review 1](research/chat-independent-1-2026-10-29.md),
[review 2](research/chat-independent-2-2026-10-29.md),
[review 3](research/chat-independent-3-2026-10-29.md).
The [backend design](chat-implementation-design.md) records one proposed concrete
implementation for evaluating these tradeoffs, not an approved architecture.
