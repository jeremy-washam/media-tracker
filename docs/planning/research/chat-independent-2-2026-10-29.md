# Independent Chat research 2

**Recommendation:** build an application-owned chat service with a bounded tool loop, PostgreSQL persistence, durable background workers, and a provider adapter. Start with OpenAI’s Responses API and `gpt-6.1-sol`, hosted web search, and narrowly scoped private library tools. Keep conversation history, authorization, citations, and recovery state under the application’s control.

Research date: **2026-10-29**. Context isolation passed: I received no application-specific context outside this brief. I used public official sources, opened documentation pages, and did not inspect project files, modify files, invoke paid APIs, or provision services.

The architecture below is my recommendation. Provider features are documented capabilities; application behavior, budgets, and performance expectations are proposed designs requiring validation.

**Architecture and provider choice.** Assume one owner, browser access across devices, moderate traffic, and permission to send selected private content to a paid model API. Use a React/TypeScript frontend, a Node.js/TypeScript API and worker service, PostgreSQL 18, and private object storage. Deploy the API and worker as ordinary long-running containers; avoid tying generation lifetime to an HTTP request or browser tab. Initially, PostgreSQL can hold the work queue as well as chat state, avoiding a mandatory Redis or workflow-service dependency.

Use the official provider SDK behind a small adapter exposing generation, streaming, tool calls, usage, and cancellation capabilities. Preserve provider-specific response items alongside the application’s normalized records. OpenAI explicitly documents preserving the complete output array—including encrypted reasoning items—for stateless reasoning conversations; a transcript containing only visible text is insufficient. [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

Choose `gpt-6.1-sol` for the initial quality baseline, with low or medium reasoning effort and bounded output. The current catalog documents function calling, web search, image inputs, and a 1.05-million-token context window. Offer Astra as an explicit higher-cost research option; test Terra and Luna for cheaper workloads. These are candidates for evaluation, not a proven quality ranking for this application. [OpenAI model catalog](https://developers.openai.com/api/docs/models)

| Alternative                            | Why it is credible                                                                                                                     | Decision                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Sonnet 5.5 through Messages API | Current models support tools and images; Anthropic supplies cited web search and a separate webpage/PDF fetch tool.                    | Strong challenger in application evals. No documented basis here establishes inferior answer quality. [Models](https://platform.claude.com/docs/en/models/overview), [search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [fetch](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool)                           |
| Gemini through Interactions API        | Google documents general availability, optional server state, background execution, multimodal workflows, and Google Search grounding. | Attractive for media-heavy workflows. Resolve the current developer-service terms’ professional/business-purpose restriction for this personal application before choosing it. [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [grounding](https://ai.google.dev/gemini-api/docs/google-search), [terms](https://ai.google.dev/gemini-api/terms) |
| Local model through Ollama             | Tool calling is documented.                                                                                                            | Best alternative if private content must remain local. Hardware requirements, selected-model reliability, and a separate web-search integration need evaluation. [Ollama tools](https://docs.ollama.com/capabilities/tool-calling)                                                                                                                                            |
| Vercel AI SDK                          | Provides chat UI, persistence patterns, and resumable-stream support.                                                                  | Useful optional UI integration. Its persistence example explicitly excludes authorization and production error handling; retain application-owned state and recovery. [Persistence guide](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)                                                                                                                      |

OpenAI is my initial choice because one integration covers general answers, custom functions, and web research. This is an integration-cost judgment, not a benchmark result. Avoid a large agent framework initially: one assistant, a controlled loop, and roughly eight tools do not require multi-agent orchestration. Add MCP only when another client actually needs access to these tools.

**Library access and truthful answers.** Expose typed domain tools, never unrestricted SQL, filesystem access, shell execution, or arbitrary authenticated HTTP requests:

| Tool                | Intended behavior                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `search_library`    | Search titles, creators, metadata, notes, reviews, and available passages; filter by media type, sources, ratings, and dates. |
| `get_items`         | Return bounded batches of canonical records, relationships, provenance, and content availability.                             |
| `query_consumption` | Filter and aggregate consumption occurrences with explicit date and counting semantics.                                       |
| `search_passages`   | Search only indexed content; return passage IDs, locators, scores, and coverage information.                                  |
| `read_passages`     | Read bounded text and neighboring context from authorized records.                                                            |
| `get_annotations`   | Retrieve notes, reviews, ratings, and highlights without confusing them with source text.                                     |
| `get_coverage`      | Explain source import coverage, missing dates, and availability of text/transcripts.                                          |
| `calculate`         | Perform deterministic arithmetic and produce validated chart/table data.                                                      |

Use strict JSON schemas, server-side argument validation, pagination, query timeouts, and result-size limits. OpenAI strict function calling constrains schema adherence; it does not establish permission, semantic correctness, or safe execution. [Function calling](https://developers.openai.com/api/docs/guides/function-calling)

Maintain separate entities for works, editions/releases/episodes, creators, source records, consumption occurrences, annotations, and content assets. Preserve original source identifiers and field-level provenance. Merge duplicate identities conservatively: two imports may describe the same viewing, while two actual viewings must remain separate.

Represent uncertain dates with precision and, where useful, earliest/latest bounds. Keep publication, consumption, import, and annotation dates distinct. A question such as “What did I watch last year?” should use consumption dates in the owner’s timezone and disclose undated records.

Every tool response should include an evidence envelope: record IDs, query interpretation, source scope, observation time, known completeness limitations, truncation, and pagination. Exact aggregates must come from database queries across the selected scope—not from counting search results. Distinguish works, occurrences, episodes, and repeated consumption explicitly.

The assistant must say “12 recorded viewings with known dates,” rather than imply complete personal history. Similarly, “no matching indexed passage” does not mean “none of your books discusses this.” Metadata supports discovery; a highlight supports that excerpt; neither supports claims about an unavailable full work.

Start retrieval with PostgreSQL full-text search plus title/creator matching. PostgreSQL documents indexing, ranking, and result highlighting. Add embeddings to available passages and annotations when semantic-recall tests justify them, combining lexical and semantic rankings. [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html)

Use pgvector within the same database rather than introducing a dedicated vector service. Exact vector search is a sensible starting point for a personal corpus. Its documentation warns that approximate-index filtering can reduce returned results; benchmark filtered recall before adopting HNSW. [pgvector documentation](https://github.com/pgvector/pgvector)

**Web research and citations.** Begin with Responses `web_search`. Its documented output distinguishes searches and opened pages, and includes citation annotations. Preserve these rather than attempting to reconstruct citations from generated Markdown. OpenAI requires visible, clickable inline citations when displaying web-derived information. [Web search](https://developers.openai.com/api/docs/guides/tools-web-search)

Test direct-URL reading, PDFs, inaccessible pages, redirects, and long documents before promising universal URL support. If hosted search does not satisfy direct reading, add an isolated public-web fetch service with redirect limits, response-size limits, private-address blocking, and DNS-rebinding protection. Do not forward application cookies or source credentials. Treat inability to fetch a page as a visible limitation.

For stronger privacy, run public-web research as a separate bounded task receiving only a deliberately approved public query. Keep private notes and consumption history outside that context. An application-controlled search tool can validate outbound queries more strictly than a hosted search tool inside a private conversation. This added integration is justified if preventing private search-query disclosure is a firm requirement.

Store library citations as structured references to item/version, source record, passage or annotation, locator, and supporting excerpt. Render them as authenticated links that open the relevant evidence. Distinguish “your note” from “the article says.” Store web URL, title, retrieval time, provider annotation, and any permitted supporting excerpt. Check that citation targets exist and support the nearby claim; a valid-looking reference is not proof.

**Conversation storage, API, and state.** Store immutable message nodes in a branchable tree:

| Record              | Essential contents                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Conversation/branch | Owner, title, selected head, revision, preferences                                                      |
| Message             | Parent, role, structured parts, attachment references, completion status                                |
| Run/attempt         | Input head, model/settings, prompt/tool versions, status, lease, cancellation flag, provider IDs, usage |
| Tool invocation     | Call ID, validated arguments, execution status, result/reference, idempotency key                       |
| Run event           | Run ID, monotonic sequence, event type, payload                                                         |
| Evidence/attachment | Ownership, provenance, version/hash, storage location, retention                                        |
| Context checkpoint  | Branch coverage, summary, evidence references, provider continuation items                              |

Keep normalized display content separate from opaque provider continuation data. Do not expose hidden reasoning as a user-facing transcript.

Proposed API:

- `POST /conversations` and authorized history/list/delete endpoints.
- `POST /conversations/{id}/turns`, accepting a client operation ID, parent message, expected revision, text, and attachment IDs; return persisted IDs and `202`.
- `GET /runs/{id}` and `GET /runs/{id}/events?after=sequence`.
- `POST /runs/{id}/cancel`.
- Branch/edit/regenerate endpoints using an explicit parent or selected head.
- Upload, attachment-status, evidence-read, and export endpoints.

The server loads history; it must not trust a browser-supplied transcript, role, owner ID, tool result, or model instruction. Commit the user message and queued run atomically. Deduplicate repeated submissions using the client operation ID. Permit one active run per branch initially, with optimistic concurrency protection.

Use run states `queued → running → completed`, with `cancel_requested`, `cancelled`, `failed`, and `interrupted`. Attempts are distinct from runs so retries remain auditable. Worker leases, heartbeats, and fencing prevent an expired worker from publishing after a replacement takes ownership.

**Streaming, disconnection, and recovery.** Stream application events over authenticated SSE: text deltas, tool status, citation updates, usage, and terminal state. OpenAI documents SSE generation streams; the application still needs its own durable replay protocol. [Streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses)

Persist small batches before publishing them. Reconnection replays events after the last acknowledged sequence, then follows live events; clients deduplicate by sequence. Disable proxy buffering, send heartbeats, and recover with a snapshot if old events have expired. Show tool activity, partial text, failures, and a working Stop control.

Closing a tab disconnects the subscriber; the bounded worker continues. Stop is a separate authenticated operation that persists cancellation, prevents new tools, aborts active local requests, and keeps the partial response marked cancelled. Cancellation cannot retract already transmitted data or guarantee zero additional provider billing. Vercel’s current resumable-stream documentation likewise distinguishes client disconnection from explicit server-side stopping. [Resume streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)

Use foreground provider streaming for ordinary chat, independent of the browser connection. After a worker crash, replay persisted application output and resume from a safe completed tool/model boundary. If a foreground generation was lost mid-response, mark that attempt interrupted and create a new attempt; do not splice a new generation onto an unverifiable partial answer.

For lengthy research, optionally use OpenAI background generation. It documents cancellation and resuming streams through sequence cursors, with higher initial latency and temporary polling retention of roughly ten minutes under relevant settings. Persist the response ID immediately and reconcile promptly after a crash. This improves recovery but is not indefinite storage or an exactly-once guarantee. [Background mode](https://developers.openai.com/api/docs/guides/background)

Retry rate limits and transient failures with bounded exponential backoff, jitter, and provider retry guidance. Do not retry authentication errors, invalid schemas, or deliberate cancellations. Treat timeouts after submission as ambiguous: a provider request may already have incurred cost. Cap attempts and expose uncertainty. Never silently switch providers mid-answer.

Editing creates a branch from the edited user message; regeneration creates another assistant attempt from the same parent. Preserve prior branches and their evidence. Avoid rewriting history underneath an active run.

**Context, attachments, and useful extensions.** Assemble each request from current instructions, selected branch, a versioned summary, recent complete tool exchanges, and retrieved evidence. Reserve output space and enforce a budget substantially below the model maximum. Preserve unresolved questions, user corrections, source IDs, and scope limitations during summarization. Summaries guide retrieval; they are not authoritative evidence. Cross-conversation memory should be optional, inspectable, editable, and deletable.

Support images, text, and PDFs first. Upload to private storage, verify type and size, scan files, extract content in a restricted worker, and track extraction status. Send only selected content to the model. PDFs may include extracted text and page images, increasing cost; current OpenAI limits require each input file under 50 MB and combined request files within 50 MB. Set stricter application limits. [File inputs](https://developers.openai.com/api/docs/guides/file-inputs)

Add audio transcription and OCR as explicit ingestion jobs with provenance and confidence. Do not imply that an attachment’s extraction automatically becomes permanent library content.

Useful next capabilities include evidence-linked recommendations, rediscovering forgotten highlights, comparing the owner’s reviews over time, cross-media thematic collections, consumption timelines, and source-coverage diagnostics. Add saving collections or drafting notes through previewable, confirmed write tools. Defer autonomous purchases, deletion, external messaging, arbitrary code execution, and credential-bearing browsing.

**Authentication and privacy.** Use an established OIDC identity provider or passkey solution, an owner allowlist, secure HttpOnly session cookies, CSRF protection for mutations, and authorization on every conversation, stream, attachment, and evidence endpoint. Keep provider keys exclusively server-side.

Apply ownership filters in tools and storage. PostgreSQL row security adds defense in depth, but table owners commonly bypass policies; use an appropriately restricted application role. [Row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

Treat webpages, stored articles, notes, PDFs, and tool results as untrusted data. Validate every tool call outside the model. Restrict outbound destinations, sanitize rendered Markdown, and disable arbitrary remote images that could leak private text through URLs. OWASP recommends tool-boundary authorization, least privilege, and treating model output as untrusted; prompt instructions alone are insufficient. [OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)

Use `store:false` where supported and maintain local conversation state. OpenAI documents API inputs as unused for training by default, but abuse-monitoring retention generally remains up to 30 days, with feature-specific exceptions. Files, conversations, caches, and background execution have separate retention behavior; `store:false` does not mean no provider retention. [Data controls](https://developers.openai.com/api/docs/guides/your-data)

Provide “library only” and “web allowed” modes, encrypted backups, minimal operational logs, and deletion covering local records, attachments, embeddings, summaries, and provider artifacts. Explain backup expiry and provider retention separately.

**Costs and dependencies.** Current standard pricing lists Sol at $2/million input tokens and $10/million output tokens; web search costs $10/1,000 calls plus search-content tokens. An illustrative turn using 12,000 total input tokens across all model steps, 2,000 billed output tokens, and two searches costs approximately **$0.064**. One thousand such turns would be about **$64**, excluding retries, other processing, and hosting. This assumes all search content is included in the input estimate. [Pricing](https://developers.openai.com/api/docs/pricing)

Measure actual billed usage, including reasoning and repeated context. Set per-run tool, token, elapsed-time, and spend limits; reserve budget before dispatch and reconcile afterward. Start with perhaps eight tool rounds, three searches, and a two-minute ordinary-chat deadline, then tune from evidence.

Core dependencies are the application runtime, official provider SDK, PostgreSQL driver/migrations, authentication, object storage, and file extraction. pgvector, transcription, alternative providers, and durable workflow infrastructure are optional. Hosting cost remains unresolved without region, corpus size, backup requirements, and availability targets.

**Practical sequence and acceptance tests.**

1. Define privacy boundaries, counting/date semantics, provenance, and coverage fixtures.
2. Build authorization, branching storage, durable runs, replay, cancellation, and crash recovery using a simulated provider.
3. Add typed library tools and lexical retrieval; verify exact aggregates independently.
4. Integrate Sol, hosted web research, citation rendering, budgets, and usage accounting.
5. Add attachments, context checkpoints, deletion/export, and optional semantic retrieval.
6. Compare providers on identical application tasks, then launch with bounded usage.

Release gates should include:

- Correct counts with repeats, duplicate imports, ambiguous dates, and missing coverage; no fabricated consumption history or inaccessible quotations.
- Evidence links supporting claims across notes, passages, and web sources.
- Network loss, reload, duplicate POST, two tabs, cancellation races, worker termination, lease expiry, provider errors, and crashes around tool-result commits.
- Reconnect without duplicated or missing persisted output; interrupted generations visibly distinguished from completed answers.
- Branch edits/regenerations isolated from descendants and concurrent runs.
- Rejection of cross-owner IDs, forged tool results, malicious documents, private-network URLs, and Markdown exfiltration attempts.
- Enforced budgets, bounded retries, deletion propagation, backup restore, and measured latency/retrieval recall.

Remaining decisions are whether cloud disclosure is acceptable, whether private information may ever enter web queries, corpus size and languages, deployment region, retention period, desired availability, monthly budget, permitted write actions, and content-ingestion rights. No paid execution was performed: provider quality, real latency, URL-reading coverage, and failure recovery remain untested until these acceptance tests run.
