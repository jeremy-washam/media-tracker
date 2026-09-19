# How AI queries the media ledger

- Status: Proposed implementation design; no runtime changes
- Updated: 2026-09-19
- Parent: [AI Chat proposal](ai-chat-plan.md)

## Recommendation

Build a shared media query service with authenticated HTTP endpoints for the UI
and typed tool adapters for models. Search is a necessary capability, but search
alone cannot answer exact analytics, retrieve complete item details, or support
quotations. Keep those operations distinct.

The model does not connect to D1. It requests an operation by emitting a tool
name and structured arguments. Our application validates and executes that
operation, then sends a bounded result back to the model. The model can request
more evidence or produce its answer. OpenAI and Anthropic document this same
application-executed tool pattern with different message formats.
[OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[Anthropic tool execution](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works).

## One turn, end to end

Example question: “Which books did I finish in 2025, and how many were there?”

1. React submits the question and selected model to the authenticated chat route.
2. The conversation service loads bounded conversation context and supplies the
   model with current date/timezone, query semantics, and tool schemas. It does
   not send the entire Library or database schema.
3. The model requests `search_media` with a book filter and the 2025 consumption
   interval. It also requests `aggregate_history` with the same filter and an
   explicit distinct-item count. Independent calls can run together.
4. The tool dispatcher validates both requests, checks scope and limits, and
   calls the media query service. That service invokes repository queries.
5. D1 returns matching rows and the exact count over all qualifying rows. Both
   use the same filter compiler; totals do not count just the returned page.
6. Tool results contain item IDs, matching consumption evidence, count semantics,
   pagination, and coverage limitations. They are recorded against the chat run
   and returned to the model using the provider's expected tool-result format.
7. The model writes an answer and references returned evidence IDs. The app
   validates references and renders linked media cards. Additional result pages
   can appear in a paginated UI without loading every item into model context.

Illustrative tool request; names and fields are proposed contracts:

```json
{
  "tool": "search_media",
  "arguments": {
    "scope": "archive",
    "filters": {
      "types": ["book"],
      "consumed": {
        "from": "2025-01-01",
        "toExclusive": "2026-01-01",
        "timezone": "America/Los_Angeles"
      }
    },
    "sort": "consumed_desc",
    "limit": 20
  }
}
```

The server resolves “last year” using current date and owner timezone when
needed; the example uses an explicit year. Dates are consumption dates, not
publication or import dates. Filter semantics distinguish fully contained dates,
uncertain overlapping precision, inferred dates, and unknown dates. Return
uncertain/undated coverage separately instead of assigning arbitrary dates.

Synthetic result sketch; example identifiers and counts are not real records:

```json
{
  "queryRef": "example-query-1",
  "items": [
    {
      "mediaId": "example-book-1",
      "title": "Example Book",
      "creator": null,
      "matchingOccurrences": [
        {
          "occurrenceId": "example-read-1",
          "consumedAt": {
            "value": "2025-06-12",
            "precision": "day",
            "basis": "source_asserted"
          },
          "evidenceRef": "example-evidence-1"
        }
      ],
      "availableContent": ["metadata"]
    }
  ],
  "nextCursor": null,
  "coverage": {
    "scope": "imported_archive",
    "undatedItemsInScope": 2,
    "limitations": ["Undated reads cannot be assigned to 2025."]
  }
}
```

Real responses should cap matching occurrences per item and expose continuation
for large histories. A no-result response means no matches in the searched,
available corpus; it does not prove that the owner never consumed such material.
Relative-date interpretation and inferred consumption dates should be visible
when they materially affect an answer.

## HTTP endpoints versus model tools

The two are adapters onto the same behavior. When orchestration runs in the
Worker, a tool calls a TypeScript service function directly. It need not make an
HTTP request back into its own Worker, and the model provider does not need
network access to the private API. The browser uses the HTTP version. A remote
companion can use an authenticated transport or a later MCP adapter.

| Behavior                             | Model tool          | Proposed authenticated HTTP surface                               |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------- |
| Filter and rank Library items        | `search_media`      | `POST /api/media/search`                                          |
| Read an item's supported details     | `get_media_details` | Extend existing `GET /api/media/{id}`; tool may batch bounded IDs |
| Compute counts or grouped statistics | `aggregate_history` | `POST /api/history/aggregate`                                     |
| Read selected supporting text/facts  | `get_evidence`      | Add `GET /api/evidence/{id}` when evidence disclosure needs it    |

Keep `GET /api/media` for straightforward paginated browsing. It can accept
simple URL-friendly filters and invoke the same query service. Use a POST search
body for composable filters, multiple text clauses, and later retrieval options;
it remains a read-only operation. The exact URL is less important than one
implementation of membership, date, identity, and pagination semantics.

Avoid a separate “AI search database” containing different interpretations of
history. There is also no need to expose one generic endpoint that lets callers
name arbitrary tables, joins, or SQL expressions.

## Three kinds of querying

### Structured history queries

Examples: books consumed in a year, movies rated at least four stars, films
watched more than once, and monthly counts by media type.

Use relational queries over `media_items`, active `archive_entries`, external
identities, and evidence links. Support a finite query vocabulary: filters,
grouping, measures, sort, and pagination. Compile it into parameterized SQL with
allowlisted column and operator choices. Validate rating scales and define which
occurrences a rating/date combination must match.

For “films watched more than once,” aggregation can group by media ID, count
supported occurrences, and require a count of at least two. This is composition
of a small number of operations, not a separate custom tool for each sentence.
Unsupported measures should return a useful capability error, not a plausible
estimate. Source gaps and Spotify's episode-versus-playback distinction remain
part of the tool's documented semantics.

Use `EXISTS` or a distinct matching-item relation for item filtering to avoid
duplicate cards from joins. Compute counts from the same relation before page
limits. Evidence joins must not multiply the occurrence count. For instant
dates, translate calendar boundaries using the owner timezone; preserve
source-asserted date-only values as calendar dates.

Exact aggregation means exact over the stated database scope, not proof of
complete upstream history. To keep multi-call answers consistent during sync,
tag query results with a data revision and detect changed revisions. A later
snapshot mechanism can provide stronger consistency. An `asOf` timestamp alone
does not freeze the database.

### Lexical search

Examples: a title fragment, a creator name, a phrase from a review, or a saved
article mentioning a term.

Add a rebuildable FTS5 search projection in D1. Cloudflare explicitly documents
FTS5 support, so a separate search service is not required for this first version.
Validate migrations, ranking, and update behavior against the project's D1
runtime before shipping.
[Cloudflare SQL support](https://developers.cloudflare.com/d1/sql-api/sql-statements/).

Initially index available title, creator, description, and reviews with origin
references. Query exact/prefix title and creator matches ahead of broad body
matches; tune ranking with representative examples. Treat the public query as
plain text and compile bounded FTS syntax rather than accepting arbitrary FTS
operators. SQL binding alone does not prevent malformed FTS expressions.

Missing acquisition remains missing data: Hardcover creator fields, for example,
need connector enrichment before author search works reliably for those books.
The [inspector proposal](media-inspector.md) inventories field availability.
Search results should identify the matched field and provide a short excerpt
where permitted, enabling the model to select useful records before requesting
larger text. Validate all result IDs and membership against authoritative data.

Update small canonical search projections in the same durable database write
when practical. Use a recoverable outbox for larger text processing. Keep source
hashes and index versions so updates, retirements, and rebuilds are deterministic.
Search availability must never be a prerequisite for preserving raw imports.

### Semantic evidence retrieval

Examples: “What have I read about paying attention?” or “Compare the arguments
in those essays,” where relevant passages may use different words.

Add authorized content acquisition, document/chunk records, and embeddings when
these questions become the next delivery goal. The search service then combines
lexical and vector candidates, applies structured scope filters, deduplicates by
item, and fetches the best supporting excerpts. The chat model does not need to
know which vector database or embedding model implements this operation.

Embedding a short description permits retrieval about that description; it does
not supply the article's arguments. A metadata match must not be presented as a
full-text match. Missing or disallowed text remains unavailable. Use the same
embedding version for stored chunks and queries; reindex explicitly on changes.

For “connections in my recent reading,” first retrieve the exact recent items,
then their available evidence, then ask the model to synthesize. Its explanation
should distinguish stored facts, supported interpretations, and general model
knowledge. For exhaustive questions, semantic top-k results are candidate sets,
not proof of complete coverage.

## Service and contract ownership

Add query contracts in `packages/contracts` and repository implementations in
`packages/db`. Keep service composition independent of provider SDKs; Hono
handlers and `packages/ai` tool handlers should call the same functions. If
cross-source composition grows beyond repositories, extract a small application
service module rather than moving it into the pure domain package.

Tool descriptions explain when to use each operation, filter meanings, data
availability, limits, and how to follow pagination. Provider adapters translate
the same logical tools to vendor schemas and preserve call IDs when returning
results. Test schema compatibility with at least two providers. A model that
cannot reliably call these tools should not be offered as a data-query model.

Start with a shared request/result vocabulary covering scope, normalized filters,
result IDs, cursor, evidence references, source coverage, query/data revisions,
and truncation. Search relevance scores belong to retrieval diagnostics, not
numerical confidence that an answer is true. Aggregate results carry units,
measure definitions, and drill-down query references.

Only send fields permitted for the selected model provider and access mode.
Catalog display eligibility does not automatically grant model/embedding use;
the inspector proposal's provider-use review must feed into this filter. Keep
raw exports, credentials, and unrelated source content outside tool results.

## Bounded execution and answer rendering

The conversation service owns the loop: model request, validated tool calls,
bounded execution, recorded results, continuation, and final response. Enforce
tool-call, output-size, elapsed-time, and cost budgets. Invalid calls get typed
errors that permit a bounded correction. Repeated identical queries can reuse a
result within its valid data revision. Cancellation stops further model/tool
work and records the interrupted state.

Store evidence references at execution time. An item card references a media ID;
a factual citation references a source record or a stored aggregate result with
query parameters and supporting data/version information. Neither should be
created by parsing a model-generated title after the answer arrives.

Record source versions and the aggregate/excerpt shown at answer time so future
sync changes do not rewrite the meaning of an old answer. Validate references
against that run's returned evidence. This checks traceability; separate tests
must check whether the cited evidence actually supports the claim.

Start with trusted lists/charts backed by these query results. Clicking a chart
bucket executes its drill-down filter; clicking an item opens the shared
inspector. The model can choose a chart type, but its output must not invent the
plotted totals.

## First implementation slice

1. Define common consumption filters, coverage, count semantics, and evidence
   contracts with synthetic fixtures.
2. Extend media details and add structured search/aggregation repository methods.
   Expose the corresponding authenticated routes and use them in Library.
3. Add the D1 FTS5 projection, backfill/rebuild operation, and change handling.
4. Add four model tool adapters and a bounded conversation loop. Demonstrate the
   same evidence-backed question with two model providers.
5. Evaluate exact counts, repeated consumption, unknown/inferred/partial dates,
   timezone boundaries, pagination, concurrent sync, missing metadata/text,
   invalid tool arguments, and unsupported measures.
6. Add semantic retrieval after corpus acquisition and measured lexical gaps
   justify it. Keep the initial implementation useful without embeddings.

This slice does not require an unrestricted SQL agent, a provider-hosted copy of
the whole Library, or a separate search cluster. If the finite query vocabulary
later blocks useful analytical questions, expand it based on actual examples
before considering a separately sandboxed exploratory query environment.
