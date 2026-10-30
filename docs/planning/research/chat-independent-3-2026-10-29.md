# Independent Chat research 3

**Research date: October 29, 2026. Context isolation passed.** I received no application-specific architecture, existing plan, previous conversation, or personal memory outside your brief. I did not inspect the project, modify files, install dependencies, call paid APIs, access credentials, or provision services. Research used opened public official documentation.

**Recommendation:** build an application-owned chat system with a TypeScript backend, PostgreSQL, a durable worker, and OpenAI’s Responses API. Use typed application tools for library investigation and an isolated web-research operation for public information. Keep conversation history, execution state, citations, and recovery logic in your database.

This is an architectural recommendation, not a tested implementation. Provider capabilities below are documented; comparative quality, latency, recovery behavior, and operating costs still require validation.

**Model and provider choice**

Start with `gpt-6.1-sol`, using low reasoning effort for ordinary questions and medium for investigations. Its documentation lists function calling through Responses, text/image input, a 1.05-million-token context window, and standard prices of $2 input/$10 output per million tokens. These capabilities fit the task; the large context window should remain a ceiling rather than a default operating target. [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

Use the official TypeScript SDK directly behind a small provider adapter. Preserve both normalized application events and complete provider output items. Avoid introducing a large agent framework before the application needs its abstractions.

| Alternative                | Credible advantage                                                                                       | Tradeoff and decision                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Sonnet 5.5          | Documented $2/$10 token pricing; native web search and separate URL/PDF fetching                         | Strong alternative for a benchmark comparison. Different tool blocks and continuation semantics need a dedicated adapter. [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool) |
| Gemini 3.8 Flash           | Google Search grounding with citation annotations; Gemini 3 supports combining built-in and custom tools | Worth testing for speed, multimodal work, and search quality. Grounding has separate billing and display requirements. [Grounding documentation](https://ai.google.dev/gemini-api/docs/google-search)                                                                                                                                                                         |
| Local model through Ollama | Local inference can keep library context on the owner’s hardware                                         | Tool calling is supported, but suitable model quality, hardware needs, and latency remain untested. Public web retrieval still needs a separate integration. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)                                                                                                                                         |
| Vercel AI SDK              | Useful chat UI, provider abstractions, and resumable-stream examples                                     | Reasonable optional dependency. It does not replace durable execution or explicit cancellation: its documentation distinguishes disconnecting a resumable stream from cancelling work. [Resume-stream documentation](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)                                                                                                |

Choose OpenAI initially for integrated tool calling and web research, not an asserted quality lead. Run the same application-specific evaluation against Claude before committing long term. Do not silently switch providers during a turn: that changes disclosure, behavior, and cost.

**Application architecture**

Use a React chat interface, a conventional Node.js/TypeScript HTTP service, a separately supervised worker, PostgreSQL, and private object storage for attachments. Deploy the service and worker as long-running containers initially. This avoids making generation lifetime depend on an HTTP request or browser connection.

PostgreSQL should hold both relational library data and durable chat state. Its native full-text search supports relevance-ranked document retrieval; add pgvector only when semantic retrieval demonstrably improves results. Start with exact vector search for a personal collection. Approximate indexes can lose matching results after filtering, a documented behavior requiring deliberate tuning. [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch-intro.html), [pgvector documentation](https://github.com/pgvector/pgvector)

Use a PostgreSQL-backed job queue with leases, heartbeats, and retry scheduling. At personal scale, this avoids Redis or a workflow platform as another required service. Temporal or another durable workflow engine becomes attractive if ingestion, transcription, approvals, and scheduled investigations grow into lengthy workflows.

Keep the media domain independent of chat. The assistant invokes the same authorized query services that other application features use.

**Library tools and evidence**

Expose a small, explicit read-only tool set:

| Tool                                | Responsibility                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `search_library`                    | Search titles, creators, metadata, notes, reviews, and available passages; return field-level match reasons |
| `get_items`                         | Retrieve selected records, relationships, source identities, and content availability                       |
| `query_consumption`                 | Filter consumption occurrences by item, type, date interval, and source                                     |
| `aggregate_library`                 | Compute counts, distributions, ratings, and trends through approved query templates                         |
| `search_passages` / `read_passages` | Retrieve indexed text, then read bounded surrounding context                                                |
| `get_annotations`                   | Retrieve notes, highlights, and reviews with stable identifiers and locations                               |
| `get_coverage`                      | Describe known date, source, import, and text coverage                                                      |

Use strict JSON schemas, bounded results, cursors, query deadlines, and server-side validation. Strict function calling improves argument conformance; it does not authorize a query or establish that its meaning is correct. [Function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling)

Do not expose arbitrary SQL, filesystem access, or shell execution. Implement aggregates in database queries, rather than asking the model to count a retrieved sample.

Separate works from editions/releases, recordings, episodes, and source records. Preserve occurrence identities so imports do not turn one viewing into multiple viewings. Store raw source values alongside normalized values and record reconciliation decisions.

Every tool result should carry:

- Stable evidence identifiers and source provenance.
- Applied filters, result limits, pagination, and truncation status.
- Available versus missing content.
- Date precision, unknown-date counts, and coverage qualifications.
- Library revision or retrieval time.

An unknown consumption date is not the import date. An absent occurrence is not proof that something was never consumed. “Most watched this year” requires an explicit counting definition, timezone, and treatment of undated occurrences.

Use lexical retrieval for names and exact phrases, semantic retrieval for concepts, and structured filters for dates and ratings. Fuse rankings, deduplicate overlapping passages, and fetch surrounding text before quoting. Never describe a film, podcast, or book as having been read merely because metadata exists.

Useful additional capabilities include recommendations grounded in ratings and notes; cross-media theme exploration; rediscovery of forgotten highlights; reading/listening queues; consumption summaries; and identifying conflicting metadata or incomplete imports. Later, support saving lists and notes through separately authorized mutation tools. Present the exact proposed change before confirmation.

**Web research and citations**

Provide an application tool such as `research_web(question, public_item_refs)`. Its implementation makes a separate, bounded model request with native web search, without private library tools or the full chat transcript.

OpenAI documents search, page opening, and finding within pages for reasoning models, plus URL annotations. Its interface requirements call for clearly visible, clickable inline citations. [Web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search)

Construct web requests from the user’s public question and approved public metadata. Do not automatically put private highlights, ratings, source credentials, or consumption history into search queries. Isolation is insufficient if the application forwards sensitive material in the query itself.

For a specifically supplied URL, verify actual retrieval. If native tools cannot read it, report that limitation. Add a controlled fetcher later if necessary, with public-network-only egress, redirect and DNS checks, response-size limits, deadlines, and safe content extraction. Fetching arbitrary URLs creates SSRF exposure. [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

Maintain a citation registry linking assistant spans to library records, passages, annotations, aggregate results, or web sources. Store document revision/hash, locator, retrieval date, and short supporting excerpt where appropriate. Resolve library links through authenticated routes.

Validate that cited identifiers were actually retrieved. Label metadata-based inference, owner-written opinion, and externally sourced claims distinctly. Preserve provider citation annotations through synthesis; do not fabricate citations from plausible URLs. Citation existence can be checked mechanically; whether evidence supports a claim still needs evaluation.

**Proposed persistence, API, and state model**

Store immutable message revisions and branch ancestry. Editing creates a new branch; regeneration creates a sibling assistant attempt. Preserve the original answer and evidence.

| Entity              | Essential fields                                                               |
| ------------------- | ------------------------------------------------------------------------------ |
| Conversation        | Owner, title, active branch, timestamps, retention policy                      |
| Message             | Parent ID, role, content parts, revision, attachment references                |
| Run                 | Input branch/head, status, model/configuration, budgets, cancellation flag     |
| Attempt             | Run, provider request/response IDs, lease generation, checkpoint, error, usage |
| Tool invocation     | Call ID, schema version, arguments, status, result/evidence references         |
| Run event           | Run ID, monotonic sequence, event type, payload, timestamp                     |
| Evidence/attachment | Owner, provenance, revision/hash, locator, processing state                    |
| Context checkpoint  | Summary, covered message IDs, evidence references, prompt version              |

Persist provider output items separately from rendered prose. OpenAI’s stateless conversation guidance requires preserving complete output arrays, including encrypted reasoning items, for replay. Treat these as opaque provider artifacts, not user-visible reasoning. [Conversation-state documentation](https://developers.openai.com/api/docs/guides/conversation-state)

Suggested HTTP surface:

- `POST /conversations`
- `POST /conversations/{id}/runs` with message, parent/head, and idempotency key
- `GET /runs/{id}` for status and materialized output
- `GET /runs/{id}/events?after=sequence` for SSE
- `POST /runs/{id}/cancel`
- Revision/regeneration endpoints creating branches or sibling runs
- Attachment upload/finalization, authenticated evidence retrieval, export, and deletion

Accept a new message, create its run, and enqueue work in one transaction. Enforce one active run per branch initially; use optimistic concurrency to reject stale submissions.

The run state machine should distinguish `queued`, `running`, `cancel_requested`, `completed`, `cancelled`, `failed`, and `interrupted`. Tool progress belongs in durable events. Waiting for clarification or mutation approval should be an explicit persisted state when introduced.

**Streaming, cancellation, and recovery**

Stream provider events into the worker, persist coalesced text chunks and state changes, then publish application SSE events. OpenAI supports HTTP SSE streaming. Browser SSE includes event IDs and reconnect cursors, but the server must implement durable replay. [OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [HTML SSE standard](https://html.spec.whatwg.org/multipage/server-sent-events.html)

Persist before publishing. On reconnect, replay after the last acknowledged sequence, then follow new events without a replay/live gap. Clients deduplicate by sequence. If events have expired, return a complete snapshot and fresh cursor. Use heartbeats and disable proxy buffering.

Closing a tab should not cancel a run. The worker continues within its budget; another session can reconnect.

The Stop button must persist cancellation, signal the worker, abort outbound requests, and prevent additional tool calls. Fence late events using the attempt/lease generation. Retain partial text as cancelled. Define the completion/cancellation race transactionally: a committed completion wins; otherwise cancellation prevents later completion.

After a worker crash, expire its lease and recover from the last durable checkpoint. Reuse saved read-only tool results. A provider stream interrupted before its complete response is saved may be unrecoverable: mark that attempt interrupted and restart from a safe boundary, keeping replacement text separate from partial output.

Therefore, promise durable recovery of committed application state—not exactly-once provider execution or seamless continuation of every lost stream.

Provider background mode is an optional alternative for expensive requests. Current documentation describes asynchronous polling and roughly ten minutes of temporary response storage, including specific ZDR handling; it still does not replace application persistence. [Background-mode documentation](https://developers.openai.com/api/docs/guides/background)

WebSockets may later reduce repeated tool-roundtrip overhead, but introduce another persistent connection to manage. Start with HTTP streaming. [WebSocket documentation](https://developers.openai.com/api/docs/guides/websocket-mode)

**Retries, context, and attachments**

Retry transient connection failures, rate limits, and server errors with bounded exponential backoff, jitter, and deadlines. Do not retry invalid requests or authentication failures. The OpenAI SDK already retries selected errors twice by default; configure one retry owner to prevent multiplicative retries. [Official SDK retry behavior](https://github.com/openai/openai-node#retries)

After partial output, create a new attempt rather than appending a fresh generation. An ambiguous timeout can still incur duplicate provider cost. Future mutation tools need transactional idempotency keys and reconciliation.

Build each prompt from instructions, recent branch history, a versioned summary of older turns, and selected evidence. Retain complete transcripts separately. Summaries should preserve user constraints, unresolved questions, and evidence references without promoting tentative conclusions into facts. Keep tool-call/result pairs intact. Refresh mutable library facts after edits and imports.

Make persistent personal memory opt-in, inspectable, editable, and deletable. User preferences deserve a separate store from conversation summaries.

Support images, PDFs, and plain text first. Validate MIME types, sizes, ownership, and processing limits; quarantine uploads and isolate parsers. Keep originals private and extracted passages versioned. OpenAI supports file inputs, and PDFs can include both extracted text and page images, affecting token consumption. [File-input documentation](https://developers.openai.com/api/docs/guides/file-inputs)

Treat audio transcription and video processing as separate jobs. Show their status and coverage explicitly; uploading media does not guarantee a complete transcript.

**Authentication, privacy, and security**

Use established OIDC authentication with an owner allowlist and secure, HTTP-only same-origin sessions. Validate authorization on every conversation, run, event stream, attachment, and citation request. OIDC defines the authentication protocol; session handling remains an application responsibility. [OIDC specification](https://openid.net/specs/openid-connect-core-1_0.html)

Derive owner scope from the authenticated session, never model arguments. Use PostgreSQL row-level security as defense in depth with a non-owner database role; table owners normally bypass these policies. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

Treat web pages, imported text, and attachments as untrusted evidence. Enforce permissions outside the model, restrict tools, sanitize rendered Markdown, and block automatic remote images that could leak information. Prompt instructions alone are insufficient. [OWASP prompt-injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

Keep keys server-side. Encrypt transport, storage, and backups. Log operational metadata rather than private prompts by default.

Use `store:false` and application-managed history. OpenAI documents no API training by default, default abuse-monitoring retention of up to 30 days, and separate retention rules for responses, files, conversations, and prompt caches. `store:false` does not mean zero retention; ZDR eligibility and exceptions require explicit verification. [Data controls](https://developers.openai.com/api/docs/guides/your-data)

Provide export and deletion covering messages, attachments, embeddings, summaries, evidence caches, and provider files, with a disclosed backup-expiration policy.

**Costs and dependencies**

Using Sol’s standard short-context rates, 20,000 uncached input tokens plus 2,000 output tokens costs approximately **$0.06**. One thousand such turns costs approximately **$60**, before search, additional tool rounds, retries, cache writes, and other billable usage. This is arithmetic, not a measured workload forecast. [Model pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

OpenAI web search currently adds $10 per thousand calls plus search-content tokens. Gemini’s documented Gemini 3+ grounding allowance is 5,000 monthly search requests, then $14 per thousand, with applicable caps. These billing units differ. [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

Apply per-run token, tool-call, elapsed-time, and spending limits, plus monthly limits and an owner-visible usage ledger. Include failed attempts in accounting.

Required dependencies are the application runtime/UI, provider SDK, PostgreSQL, private storage, authentication, backups, and monitoring. pgvector, local embeddings, transcription, and advanced workflow infrastructure are optional. Hosting cost remains unresolved without deployment region, library size, attachment volume, and availability requirements.

**Practical implementation sequence**

1. Define counting semantics, provenance, date uncertainty, privacy boundaries, and a representative evaluation set.
2. Build authorized library query services and evidence links; verify them independently of an LLM.
3. Implement immutable branches, durable runs/events, idempotent submission, cancellation, and reconnect using a fake provider.
4. Add Sol, typed tools, budgets, context assembly, and citation rendering.
5. Add isolated web research and attachments; test disclosure and injection boundaries.
6. Exercise crash recovery, retention, export/deletion, and backup restoration; benchmark Claude and Gemini before expanding capabilities.

**Acceptance tests**

Release should require:

- Correct distinct-work and occurrence counts across duplicate imports, reconsumption, timezones, and unknown dates.
- Honest answers when only metadata or partial text exists.
- Retrieval of known passages and valid, accessible evidence links.
- No cross-owner access through guessed IDs, tools, streams, or attachments.
- No private-note leakage through malicious pages, queries, links, or remote images.
- Refresh, disconnect, duplicate submission, multi-tab, stale-head, and replay-gap tests without duplicate runs or text.
- Cancellation before execution, during generation/tools, and at completion without resurrected work.
- Worker termination at each checkpoint, with bounded recovery and clearly labelled interrupted attempts.
- Controlled retries and spending under rate limits, timeouts, malformed tool calls, and provider outages.
- Correct branch behavior after edits/regeneration, context compaction, and library changes.
- Successful deletion and backup restoration.

Use deterministic database fixtures and fake-provider fault injection for correctness; later run a small paid evaluation for groundedness, citation support, usefulness, latency, and cost. None of those evaluations were performed here.

Remaining decisions are whether cloud processing is acceptable for notes/highlights; expected library and transcript size; deployment region and uptime; monthly budget; supported languages; consumption-counting rules; desired write capabilities; and whether local inference is a requirement. These may change provider or hosting choices, while the application-owned evidence and execution model remains a strong foundation.
