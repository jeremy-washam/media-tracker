# Chat subscription access and provider portability

- Status: Subscription, no-paid-funding check, key authentication and initial text call verified; full release checks in progress
- Updated: 2026-10-30
- Evidence: [verification and agent triage](research/chat-access-verification-2026-10-29.md)

## Verified setup on October 30

The owner created the restricted project key. Authentication and one bounded text
request passed. The key is stored in ignored mode-0600 local configuration and an
encrypted Worker Secret; it is absent from Git and browser assets. The receiving
organization showed $43 included API credit expiring November 12, with no paid
API billing plan or payment method. The owner authorized up to $13 of included
credits for live testing. The application has a separate conservative $13 period
allowance, pre-submission reservations, an expiry gate and no automatic retries,
recharge or provider/funding fallback. Direct probe usage and application usage
are accounted for separately during release testing.

## Recommended access route

Use the owner's ChatGPT Pro **included API credits** to fund ordinary OpenAI
Responses requests from the private Cloudflare application. Use an owned SQLite Durable Object
for execution/stream persistence, with an owned provider adapter and bounded
Library/web tool loop. Keep React/Vite, Hono, D1 and R2. A local companion and
Codex App Server are unnecessary for this route.

This is subscription-funded API access, not shared ChatGPT/Codex quota. The
owner required personal-subscription funding without separate API costs; the
earlier recommendation incorrectly treated this as excluding included API
credits. A server-side API key is authentication, not proof of extra payment.
No additional API spending or automatic paid fallback is authorized.

The owner confirmed Pro. Read-only browser inspection showed Pro 100 and a paid
subscription older than seven days, matching the published plan/age conditions.
On October 30 the owner linked the subscription. Their billing screenshot
confirms the subscription benefit is linked and $43.00 of API credit is available.
The screen shows the Free trial state and says no payment method is required.
Exact credit expiry, Auto Recharge/purchased-credit settings and model/tool access
still need verification before live use. The owner performed activation; this
agent generated no key, changed no billing settings and performed no inference.

## Two different subscription routes

| Route                    | Funding                                                                                            | Deployment                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Pro included API credits | Finite monthly API dollar allowance; ordinary API organization/project/key.                        | Preferred hosted route. Normal API capabilities, subject to model/account access. No SIWC private-hosted approval prerequisite.            |
| SIWC plan usage          | OAuth permission to use ChatGPT allowance, with its own limits and narrower request/tool contract. | Local personal projects documented; private hosted clients require selection/approval. OSS self-hosted VMs are a specific documented case. |

The [credit guide](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
confirms eligible Pro tiers have included API credits. It requires a paid
subscription at least seven days old, matching email and ownership of the
receiving API organization. Claiming links the benefit once; grants renew while
eligible and available. The first grant is prorated; unused credits expire at
subscription-cycle end. Plus is ineligible. Codex through API keys is excluded;
these credits do not increase signed-in ChatGPT/Codex limits.

The allowance covers Responses and OpenAI built-in web search and other
hosted-tool/storage charges. It does not cover Cloudflare, third-party search or
another vendor. It is finite and the benefit's indefinite availability is not
promised. Published grants and detailed eligibility are retained in the research
report rather than copied into application constants.

## No additional API payment

Use an owner-controlled receiving organization funded only by included credits:
no purchased balance, API payment method, other postpaid arrangement or Auto
Recharge. Verify the organization, not merely a dedicated project. Existing
purchased credits would be consumed after free credits. There is no documented
per-request/project selector restricting usage to subscription-included credits.

With no credits left, requests fail with HTTP 429 `credit_balance_exhausted`.
Stop on billing, spend-limit and entitlement errors, preserving partial history.
Never switch keys, vendors, gateway balances or paid routes. Do not buy credits,
upgrade a plan, remove payment methods or move the benefit automatically.

Use organization/project hard limits as secondary controls. Enforcement can lag,
so a payment-enabled organization's configured cap is not a precise financial
boundary. Monthly cap reset and subscription-cycle expiry are different clocks.
Reserve per-run allowance; cap context/output, tool steps, web calls, elapsed time
and concurrency. Account for summaries, title generation and retry calls too.
[Spend controls](https://developers.openai.com/api/docs/guides/spend-limits).

Use a direct OpenAI provider, bypassing Workers AI, AI Gateway unified billing
and separate search subscriptions initially. Cloudflare remains separately
metered: measure DO duration/requests/SQLite, D1 and R2 against existing approved
headroom. The existing $5 plan is not an account-wide zero-overage cap.
[Infrastructure pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Framework decision

Use **an owned SQLite Durable Object plus a bounded tool/context loop**, following
the released-package inspection and fallback decision in [ADR 0023](../decisions/0023-owned-chat-runtime.md). The framework
handles persistence, buffered stream replay and abort/recovery; the application
controls the model call. Construct the direct OpenAI Responses model explicitly.
Keep AI SDK types behind our public contracts and export format. Think adds
experimental turn APIs and a larger memory/session harness; a plain DO would
make us rebuild useful transport/recovery primitives.
[Framework comparison](https://developers.cloudflare.com/agents/harnesses/think/).

Explicitly handle the following defaults:

- Preserve original history and attempts. `maxPersistedMessages` deletes old
  records; default regeneration is destructive. Context selection and retained
  regeneration must have separate application semantics.
- Persist Stop before aborting. Propagate abort through model/tool work; browser
  disconnect is not Stop. Eviction loses the upstream stream and default recovery
  can spend on a new inference. Initially retain partials and mark interrupted;
  require an explicit retry instead of automatic continuation.
- Save original evidence and opaque provider continuation state separately.
  SDK sanitization removes some OpenAI reasoning metadata; UI messages are not a
  complete provider checkpoint.
- Enforce trusted admission/history/tool results server-side. A client-supplied
  message array cannot rewrite history or invent tool outcomes.

[Lifecycle and hooks](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/).
The [backend design](chat-implementation-design.md) defines storage authority and
acceptance checks. This recommendation does not claim our integration is tested.

## Optional SIWC access profile

Use SIWC if shared ChatGPT allowance is specifically desired or included API
credits cannot be activated. It is a separate explicit choice, not fallback.
Local personal projects are documented; private hosted integration needs approval.
The OSS VM guide does not establish eligibility for a private Worker, a private
hosted frontend plus local proxy, or a newly published thin bridge. Do not make
this repository public merely to qualify.
[Local/hosted availability](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt),
[VM case](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).

SIWC requires streamed, unstored requests, explicit contextual input and
namespaced custom/function tools. HTTP previous-response IDs, Conversations and
background mode are unavailable. Web search depends on model/account policy;
hosted MCP, Code Interpreter, image generation and file search are excluded.
These limitations do not apply simply because ordinary API requests use Pro's
included credits.
[Preview contract](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

Use official PKCE/OIDC sign-in, validate the separate plan-use scope, protect
runtime tokens, serialize refresh and discover account models. Login/model
listing alone is not inference proof. Handle limits signaled mid-stream.
SIWC may use allowed credits if enabled in ChatGPT settings, so OAuth alone does
not prove credit spending is disabled.
[Sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[usage/account settings](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions),
[inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

Codex App Server is a rich local-runtime alternative, unnecessary for two
read-only Library tools plus Responses. Legacy App Server auth is not a hosted
workaround. Its SIWC configuration retains eligibility/capability restrictions
and adds process/history/auth translation. Never extract Codex/browser tokens.
[Authentication restrictions](https://learn.chatgpt.com/docs/app-server#auth-endpoints).

## Provider-independent contract

Separate provider, model, access mode and execution location. Adapters cover
connection/auth state, discovery, start/stream/interrupt, tool exchanges,
citations, usage/errors and recovery. Store portable message parts and exact
evidence, with opaque provider state separate. Switching reconstructs visible
context/evidence, not hidden state.

Keep `query_media` and `get_media_details` independent of credentials/SDKs. Test a
fake adapter with substantially different events/capabilities from day one.
Future Claude/Gemini access may use official runtime protocols or verified
included-credit benefits; their consumer plans do not automatically authorize
arbitrary hosted API calls. No future entitlement is promised without its own
verification.

## Release checks

Funding, expiry, no-paid-continuation configuration, restricted-key authentication,
text, automatic-title and native web-search probes passed. Direct probes used an
estimated $0.032955 of the authorized $13 allowance. Ordinary browser/runtime
fixtures use synthetic upstreams and spend no model credits.

Finish the complete checks, exact-revision guarded migration/deployment, then
verify the actual hosted Library tool round trip and cited web answer through the
owner session. Keep the private probe ledger and application reservations in the
combined live-test accounting. Do not deliberately exhaust credits or add billing.
