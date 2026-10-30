# Independent Chat research 1

**Research date: October 29, 2026. Context isolation passed.** I received no application-specific architecture, prior plan, previous conversation, or personal memory outside the brief. I researched public official documentation and opened the supporting pages. I did not inspect local project files, modify files, install anything, access credentials, invoke paid APIs, or provision services.

**Recommendation.** Build an application-owned chat service with durable runs, typed library tools, PostgreSQL retrieval, and a controlled web-research boundary. Start with Anthropic’s Messages API and Claude Sonnet 5.5, retaining a narrow adapter for another provider. Use React and TypeScript for the interface, a Node.js API plus independently running worker, PostgreSQL for authoritative state, and private object storage for attachments.

This is a proposed architecture, not a tested implementation. Provider capabilities below are documented; quality, latency, recovery behavior, and operating cost require validation against the owner’s actual library.

Assumptions: one owner, modest concurrency, online access, and permission to send selected private excerpts to a commercial model API. If “private” means no external processing, the provider recommendation changes substantially.

**Provider and framework choices**

Sonnet 5.5 is my initial cost and latency choice. Anthropic currently documents tool use, image input, streaming, and native citations; its catalog positions Sonnet between its faster inexpensive models and its more expensive reasoning models. This establishes availability, not superiority on this application. Pin the deployed model version where available, record the returned model identity, and require evaluation before upgrades. [Anthropic model catalog](https://platform.claude.com/docs/en/models/overview)

Use the official TypeScript SDK behind an adapter supporting streamed content blocks, tool calls, citations, usage, errors, and cancellation. Preserve provider-specific blocks alongside normalized application records; reducing everything to plain text would lose citation and tool information.

| Alternative          | Why it is credible                                                             | Tradeoff and decision                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI Responses API | Integrated web search and asynchronous background responses with polling.      | Strong alternative if recoverable provider-side jobs dominate. Retention differs by endpoint and storage setting; keep local history authoritative. [Background mode](https://developers.openai.com/api/docs/guides/background), [data controls](https://developers.openai.com/api/docs/guides/your-data)                  |
| Gemini API           | Google Search grounding supplies current information and citation annotations. | Evaluate for search quality and multimodal work. Review paid-service and grounding terms carefully before sending private information. [Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [terms](https://ai.google.dev/gemini-api/terms)                                                            |
| Vercel AI SDK        | Provides chat UI, persistence examples, and resumable streams.                 | Useful accelerator, but application authorization and durable execution remain your responsibility. Adopt only if its message protocol fits the required state model. [Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence), [resumption](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams) |
| Local inference      | Can keep model inputs on owner-controlled infrastructure.                      | Preferred under a strict local-only requirement. Hardware, model quality, tool reliability, and latency need a separate benchmark; no equivalence is assumed here.                                                                                                                                                         |

I would start with direct SDK integration and a small custom event protocol. Avoid a large agent framework or multiple autonomous agents initially: this application needs dependable retrieval and lifecycle control more than elaborate orchestration.

**Deployment and execution architecture**

The browser talks only to the authenticated application API. The API validates commands and commits them to PostgreSQL. A worker claims durable runs, constructs model context, executes allowed tools, and stores results. The browser subscribes to committed run events.

Deploy the API and worker as separate processes on a conventional container host, with managed PostgreSQL and private object storage in a suitable region. This removes generation lifetime from the browser request lifetime. Initially, use PostgreSQL-backed jobs and leases; a separate broker is unnecessary at personal scale.

The worker executes a bounded model/tool loop. Anthropic documents `tool_use` blocks, matching tool-result identifiers, and returning results in subsequent messages. The application must validate arguments and authorize every invocation. [Tool-call lifecycle](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)

Set explicit limits on elapsed time, model calls, tool calls, searches, retrieved bytes, and output tokens. Parallelize independent read operations, with bounded concurrency. Report tool failures as failures rather than inventing successful results.

**Library tools and truthful retrieval**

Expose a compact domain API rather than SQL, shell access, or arbitrary database queries:

| Tool                | Purpose                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `search_library`    | Search titles, creators, media types, ratings, sources, and other metadata; return stable IDs and pagination. |
| `get_items`         | Read canonical records, creator relationships, provenance, and content availability.                          |
| `query_activity`    | Filter consumption occurrences, dates, ratings, reviews, notes, and highlights.                               |
| `aggregate_library` | Compute counts, comparisons, distributions, and timelines through approved server-side queries.               |
| `search_passages`   | Retrieve relevant available text, notes, highlights, or transcripts.                                          |
| `read_passages`     | Expand identified passages with bounded neighboring context.                                                  |
| `get_coverage`      | Explain source coverage, missing dates, searchable content, and synchronization freshness.                    |

Use strict schemas, enums, server-enforced pagination, query timeouts, and result-size limits. Infer the owner from the authenticated session; never accept model-supplied ownership as authority.

Keep distinct identities for works, editions/releases, episodes/tracks, source records, and consumption occurrences. Preserve source-specific ratings and notes rather than silently flattening conflicting records. Store original imported values alongside normalized representations.

Dates need precision and meaning: publication date, consumption date, import date, and source update date are different fields. Represent unknown dates explicitly; retain date-only values and approximate intervals without fabricating timestamps.

Every analytical result should include its definition, filters, denominator, unknown-date count, coverage limitations, and library revision. For example, “12 recorded film viewings in 2025; three additional viewings have unknown dates” is defensible. “You watched exactly 12 films” may not be.

Use SQL for exact filters and arithmetic, PostgreSQL full-text search for lexical retrieval, and optional pgvector search for semantic discovery. PostgreSQL documents indexing, ranking, and highlighting; pgvector supports similarity search but warns that approximate-index filtering can reduce returned matches. Begin with exact vector search for a small corpus and add approximate indexes only after measuring recall and latency. [PostgreSQL text search](https://www.postgresql.org/docs/current/textsearch.html), [pgvector documentation](https://github.com/pgvector/pgvector)

Make lexical retrieval the first release; embeddings are an enhancement, not a dependency. Embed only actual available text. Choose the embedding model after testing vocabulary, languages, privacy requirements, and retrieval quality; record its version and retain rebuildable indexes.

The assistant must distinguish metadata knowledge, owner annotations, available content, and outside knowledge. It cannot summarize an unavailable podcast transcript as if it read one. A failed passage search means “no match in searchable material,” not “this topic never appears in your library.”

**Web access and privacy boundary**

Provide web search and page reading, but isolate network-capable research from private library context.

The main assistant requests public research through a policy-controlled tool. A separate research invocation receives only an approved public query or URL and no private notes, history, or library tools. It returns sources and excerpts for synthesis. Anthropic documents both hosted search and fetching webpages/PDFs, and explicitly warns about exfiltration when fetch operates alongside sensitive data. [Web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [web fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)

Offer “Library only” and “Library + web” modes. Permit external research about selected public titles and creators under a clear standing preference. Ask before transmitting private quotations or note-derived queries. Merely adding another model invocation is insufficient: policy must constrain what can cross the boundary, and ambiguous cases need approval.

Treat webpages, attachments, and imported notes as untrusted content. Instructions embedded in them cannot authorize tools or change access policy. Disable arbitrary outbound requests and remote MCP servers initially. If implementing a custom fetcher later, protect against private-network addresses, redirects, DNS rebinding, oversized responses, and malicious content. Prompt instructions alone do not provide containment. [OWASP prompt-injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

Page access may fail, and fetched material may be incomplete. Preserve that distinction in answers; do not promise universal full-page reading.

**Conversation storage, API, and state**

Use immutable messages arranged as a branchable tree. Editing creates a replacement branch; regeneration creates another assistant attempt under the same user message. Preserve earlier results and identify the selected branch.

A proposed storage model:

| Record          | Essential fields                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Conversation    | Owner, title, selected branch, settings, timestamps, deletion state                                    |
| Message         | Parent, role, ordered typed parts, attachment references, completion status                            |
| Run             | Input message, attempt, model/configuration, context manifest, status, lease, cancellation flag, usage |
| Run event       | Run ID, monotonically increasing sequence, type, payload                                               |
| Tool invocation | Call ID, schema version, validated arguments, status, result reference                                 |
| Evidence        | Source identity/revision, passage or query reference, retrieval time, content hash                     |
| Attachment      | Owner, object key, MIME type, size, hash, extraction status, retention                                 |
| Summary         | Branch checkpoint, source-message range, summary version                                               |

Store both rendered content and the protocol blocks needed for provider replay. Keep large tool payloads and extraction artifacts outside event rows.

Proposed endpoints:

- `POST /conversations`
- `POST /conversations/{id}/messages`, with an idempotency key and expected branch version
- `POST /messages/{id}/regenerations`
- `GET /conversations/{id}`, returning a snapshot and event cursor
- `GET /runs/{id}/events?after={sequence}`
- `POST /runs/{id}/cancel`
- Attachment creation, upload completion, and deletion endpoints

Commit the user message, run, and queued work atomically. Accept only newly submitted user content from the browser; reload trusted history server-side. Allow one active run per branch initially and reject stale concurrent edits clearly.

Use states such as `queued`, `running`, `waiting_for_tool`, `cancel_requested`, `completed`, `cancelled`, `failed`, and `interrupted`. Terminal outcomes and partial messages must remain distinguishable.

**Streaming, cancellation, and failure recovery**

Use server-sent events for text deltas, citation updates, tool status, and terminal state. Persist numbered events before publishing them; batch small deltas briefly to control database writes. SSE provides event IDs and reconnection behavior, but durable replay is an application responsibility. [MDN SSE documentation](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

A browser disconnect leaves the worker running. Reconnection loads a snapshot and replays subsequent events; duplicate events are discarded by sequence. A missed notification cannot lose data because notifications only wake readers.

“Stop” calls the cancellation endpoint. It persists intent, signals the worker, aborts active requests where supported, prevents further tools, and preserves partial output. Do not equate closing a stream with cancelling generation. AI SDK’s current resumable-stream documentation makes this distinction explicitly. Cancellation may not undo provider work already performed or billed. [AI SDK cancellation semantics](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)

Use renewable worker leases and fencing tokens. After a crash, a recovery process detects expired leases. Completed tool results can be reused; in-flight model calls may have an unknown outcome.

Retry transient failures with bounded exponential backoff and jitter, respecting provider guidance. Avoid nested SDK and job retries multiplying attempts. Before visible output, retrying a read-only generation is reasonable. After partial output, retain the interrupted attempt and clearly identify a replacement or continuation.

Do not promise exact continuation. Anthropic documents continuation through a new request and states that partial tool-use and thinking blocks cannot be recovered. Never execute incomplete streamed tool arguments. [Streaming recovery](https://platform.claude.com/docs/en/build-with-claude/streaming)

Exactly-once provider execution is not guaranteed. Local idempotency prevents duplicate application commands; future write tools additionally need durable operation keys and reconciliation.

**Context, citations, attachments, and capabilities**

Build context from instructions, explicit owner preferences, a versioned summary, recent complete turns, and relevant evidence. Reserve output space and budget retrieved text. Preserve complete tool-call/result groups and required provider blocks. Summaries accelerate continuity; authoritative facts remain in original messages and library records.

Cache stable prefixes when reuse justifies it. Anthropic documents five-minute and one-hour caching, with different write and read prices. Caching improves economics but does not replace durable storage or context selection. [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

Return library evidence as native `search_result` blocks where appropriate. Anthropic supports citations to application-provided sources and document passages. Map these to authenticated internal links and immutable evidence revisions. Valid citation pointers do not establish that a claim is logically supported. [Search-result citations](https://platform.claude.com/docs/en/build-with-claude/search-results), [document citations](https://platform.claude.com/docs/en/build-with-claude/citations)

Render citations beside claims, with source title, excerpt, provenance, retrieval time, and coverage notes. Aggregate citations should open the query definition and contributing records. Preserve web citation annotations rather than reconstructing them from generated Markdown.

Initially support text, PDF, and image attachments. Validate signatures and size, quarantine uploads, scan them, and extract content in restricted workers. Show extraction failures and distinguish extracted text from image interpretation. Keep objects private and authorize every read. Add audio/video ingestion only after deciding transcription, storage, and privacy costs. [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

Useful additional capabilities include rediscovering forgotten items, evidence-backed recommendations, comparing creators across media, tracing themes through highlights, consumption timelines, saved reading/listening queues, and exporting cited answers. Later, allow previewed changes to tags, notes, and lists with explicit confirmation and undo. Keep unrestricted code execution and automatic library mutation outside the initial scope.

**Authentication, retention, and costs**

Use a maintained authentication solution with passkeys or OIDC, secure HTTP-only sessions, CSRF protection, and server-side authorization on every resource. Keep provider keys exclusively on the server. Apply owner scoping throughout; PostgreSQL row security can add defense in depth, but table owners typically bypass it, so use a restricted application role. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

Encrypt transport, storage, and backups. Redact content from operational logs. Offer conversation export/deletion and attachment retention controls; document backup expiry and provider-side retention separately.

Anthropic states commercial API inputs and outputs are not used for training by default, while standard API retention is up to 30 days with stated exceptions. This is external processing, not local confidentiality. ZDR requires applicable arrangements and feature eligibility. [Training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), [retention policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)

Current documented Sonnet 5.5 rates are $2/million input tokens and $10/million output tokens. Web search costs $10/1,000 searches; web fetch adds token consumption without a separate fetch fee. [Model pricing](https://platform.claude.com/docs/en/about-claude/pricing), [search pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [fetch pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)

Illustratively, 20,000 total uncached input tokens, 2,000 output tokens, and two searches cost about **$0.08**. At 1,000 such turns, approximately **$80**, excluding hosting, storage, embeddings, retries, and extra research calls. Multi-step turns can substantially exceed this example.

Track actual usage per attempt, cap monthly expenditure, and expose research budgets. Required dependencies are the SDK, schema validation, database access/migrations, authentication, job handling, object storage, and document extraction. Embeddings, Redis, and a dedicated workflow engine are optional.

**Implementation sequence and acceptance criteria**

1. Define identity, date semantics, coverage, provenance, privacy modes, and representative questions.
2. Build authenticated storage, branches, idempotent commands, durable runs, replay, and cancellation using a fake provider.
3. Add the real provider and bounded tool loop.
4. Implement metadata/activity tools and deterministic aggregates.
5. Add passage retrieval and citation rendering.
6. Add isolated web research, then attachments.
7. Validate reliability and privacy; optimize models and retrieval afterward.

Release acceptance should include:

- Duplicate submissions create one command; stale concurrent edits cannot overwrite branches.
- Reloading or disconnecting loses no committed output; reconnection causes no duplicate text.
- Cancellation during generation or tools prevents subsequent work and preserves partial results.
- Worker crashes at each persistence boundary recover without duplicate local effects.
- Rate limits, timeouts, malformed tool inputs, and partial streams terminate predictably.
- Unknown dates, repeated consumption, duplicate editions, conflicting ratings, and missing transcripts yield accurate qualified answers.
- Every citation resolves to the correct evidence revision; sampled claims are actually supported.
- Malicious pages and attachments cannot extract private canaries or access unauthorized tools.
- Authorization covers conversations, events, evidence, downloads, and deletion.
- Retrieval quality, answer quality, latency, and cost meet agreed thresholds on a frozen evaluation set.

No paid evaluations were performed here. Model quality, extraction accuracy, retrieval recall, and end-to-end recovery remain untested.

The remaining decisions are the meaning of “private,” acceptable provider regions and retention, corpus size and languages, expected concurrency and budget, source synchronization guarantees, attachment formats, and whether library writes are desired. Resolve privacy first: it determines whether this hosted-model architecture is appropriate at all.
