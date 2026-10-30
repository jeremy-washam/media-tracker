# Chat funding, runtime and provider verification

- Checked: 2026-10-29 America/New_York; some fetches occurred October 30 UTC
- Scope: Public primary-source research, released-package offline probe and
  read-only subscription-page inspection; no live inference or account activation
- Outcome: Prefer hosted AIChatAgent plus owned adapters, funded only by included Pro API credits

## Research questions resolved

| Question                                                     | Evidence and conclusion                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does a personal subscription always require a local runtime? | No. Eligible Pro subscriptions include API credits usable with ordinary hosted API requests. SIWC shared plan allowance is a different route.                                                                                |
| Does a key necessarily mean extra API payment?               | No. Keys authenticate requests billed to an organization; included credits can fund them without an API payment method.                                                                                                      |
| Can the existing subscription fund native web search?        | The included benefit covers OpenAI built-in tool usage, including web search. Actual model/tool access still needs a completed smoke turn.                                                                                   |
| How much is included?                                        | The official guide lists matching $100/$200/$500 monthly credits for corresponding Pro tiers. First grants are prorated; credits expire at subscription-cycle end.                                                           |
| Can use continue into paid credits?                          | Yes, if purchased credits exist. There is no established per-key included-only switch. Select and verify credit-only organization funding, not merely a new project.                                                         |
| How does exhaustion behave?                                  | No balance means 429 credit_balance_exhausted. Organization/project hard limits also stop traffic but enforcement may lag. Exclude payment/purchased/recharge paths; do not rely on alerts or a precise budget cutoff alone. |
| Is private hosted SIWC generally available?                  | No general entitlement established. Official quickstart says selected private clients; local personal projects are documented. Remote VM instructions specifically concern OSS apps.                                         |
| Does a local proxy remove the private hosted gate?           | Documentation does not establish that. Do not design around that inference.                                                                                                                                                  |
| Does Cloudflare's SDK require Workers AI?                    | No. AIChatAgent delegates the model call to our code; direct OpenAI is supported in design. Workers AI/Gateway billing would be different funding.                                                                           |
| Which harness?                                               | All three new audits prefer AIChatAgent plus owned bounded loop. Think remains experimental and larger in scope; plain DO means rebuilding lifecycle primitives.                                                             |
| Does reconnect recover a lost provider call?                 | Browser reconnect replays buffered ongoing work. DO eviction severs the upstream call; framework continuation is another inference attempt and uses allowance.                                                               |
| Does SDK persistence preserve every original?                | No: destructive regeneration/pruning and sanitized opaque provider state require explicit app archival semantics.                                                                                                            |
| Must the Library tool design change?                         | No. Use query_media and get_media_details; two synthetic functions serialize successfully. Query correctness/provenance still need application tests.                                                                        |
| Can all providers share one auth implementation?             | No. Own portable messages/evidence/run events, but permit different auth, funding, HTTP/runtime protocols and native capabilities.                                                                                           |

Primary OpenAI sources opened and fetched:

- [Included API credit benefit, eligibility, expiry, coverage and exhaustion](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).
- [Actual hard limits and enforcement lag](https://developers.openai.com/api/docs/guides/spend-limits).
- [SIWC quickstart and private-client availability](https://developers.openai.com/siwc/quickstart).
- [Local personal versus remote access](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).
- [Specific OSS self-hosted VM route](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).
- [SIWC preview request/tool limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- [SIWC sign-in and separate inference permission](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).
- [SIWC account/refresh/usage settings](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).
- [Terminal stream/model-discovery contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).
- [SIWC errors and no implicit billing fallback](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
- [App Server local/OSS authentication restrictions](https://learn.chatgpt.com/docs/app-server#auth-endpoints).

Cloudflare primary sources:

- [AIChatAgent versus Think](https://developers.cloudflare.com/agents/harnesses/think/).
- [Persistence, pruning, Stop, reconnect and eviction recovery](https://developers.cloudflare.com/agents/agent-class/communication-channels/chat/chat-agents/).
- [Durable Object compute and SQLite costs](https://developers.cloudflare.com/durable-objects/platform/pricing/).

The older categorical API/subscription recommendation and SIWC-only shortlist
were too narrow. Ordinary API capability rules apply to credit-funded requests;
SIWC's exclusions must not be applied to that distinct funding mode.

## Three fresh agent audits and triage

Agents used fresh conversation context and public sources, with no instruction to
endorse a particular prior plan. They received the hard subscription/portability
constraints and data/application requirements. Unlike the earlier data-only
experiments, these audits knew the existing platform because runtime compatibility
was the question. After discovery of included credits, all were asked to assess
that option against the user's exact no-additional-API-cost wording.

| Audit                                                                | Independent recommendation                                                                     | Root triage                                                                                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Access](chat-subscription-access-2026-10-29.md)                     | Pro-included credits, hosted AIChatAgent, explicit budget/Stop policy.                         | Adopt funding distinction and account gates. Do not infer owner activation from research.                                                              |
| [Cloudflare/source](chat-subscription-cloudflare-2026-10-29.md)      | Same; prefer one conversation-local store, D1 index, explicit direct model object.             | Adopt single authority and avoid dual authoritative transcripts. Its old tool names are generic research artifacts, not a change to our two-tool plan. |
| [Portability/lifecycle](chat-subscription-portability-2026-10-29.md) | Same core route; favors D1 archive with explicit DO outbox, acknowledges DO-owned alternative. | Keep DO-local app records authoritative for simpler serialized acceptance and recovery; D1 is a rebuildable index. New ADR before implementation.      |

All agree on retained originals, typed provider-independent contracts, no paid
fallback, explicit interruption, and separate Cloudflare cost checks. Consensus is
not a benchmark. Remaining framework choices are engineering judgments informed
by source inspection, not a deployed integration result.

## Published-package executable probe

A scratch installation outside the repository used only public npm packages.
Every model fetch was replaced with an in-process function and a literal fake
key. No OpenAI HTTP requests, personal data or credentials were involved.

Tested versions:

| Package          | Version |
| ---------------- | ------- |
| ai               | 7.0.157 |
| @ai-sdk/openai   | 4.0.105 |
| @ai-sdk/provider | 4.0.34  |
| zod              | 4.6.7   |

The probe passed and the root reran it with canonical fixture names query_media
and get_media_details. It checked:

1. Ordinary explicit Responses streaming targets /v1/responses and serializes two
   functions. Default store is omitted, leaving the service default; production
   must choose retention explicitly.
2. Explicit SIWC-compatible configuration emits store:false, stream:true,
   developer instructions and a namespace containing both functions; none of the
   documented forbidden fields were present.
3. Deliberately supplied maxOutputTokens, metadata, previousResponseId and
   maxToolCalls are forwarded into fields forbidden by SIWC. An adapter must
   reject/filter those by access mode, not blindly change credentials.
4. generateText emits a non-streaming request, unsuitable for SIWC's stream-only
   route without a different implementation.
5. A synthetic SSE URL annotation becomes a source event, and synthetic text and
   terminal completion parse without errors.
6. Aborting reaches the mocked fetch signal and produces an abort event.

The [probe source, package versions and captured output](chat-sdk-probe-2026-10-29.md)
are preserved with this research. The original scratch installation also remains
at /private/tmp/imladris-subscription-verification/sdk-probe/.
This is serializer/citation/abort proof, not live entitlement, real web search,
Library repository execution, tool-result continuation, encrypted reasoning
replay, or Durable Object recovery proof.

Official npm metadata also shows a compatible candidate set:

- agents 0.32.0; @cloudflare/ai-chat 0.12.2; @ai-sdk/react 4.0.161.
- Their peer ranges permit the tested AI SDK 7 family and the repository's
  React 19.2.7. These Cloudflare packages were not installed or runtime-tested.
- Latest @cloudflare/think 0.23.0 requires AI SDK 7 despite documentation mentioning
  both versions. Check released metadata, not only the general guide.

Public source inspection was pinned to cloudflare/agents
be1749221ab3efc8be4e976d8e7d8344d1446032 and vercel/ai
dfed8e8234b684c3e2a0571ad1a1078c8364b44c. The detailed source audit links the
serializer, sanitizer and harness lines. Upstream main inspection is distinct
from the released OpenAI-package executable probe.

## Account evidence and remaining acceptance

The owner reported ChatGPT Pro. Read-only browser inspection confirmed Pro 100
and paid subscription age satisfying the published seven-day condition. The
ordinary ChatGPT billing screen did not expose an activated API benefit. The
API Platform billing URL required a separate login. No login, new consent,
claim/link, organization/key creation or billing setting change was performed.

Actual benefit availability, linked organization, grant/expiry, purchased balance,
payment/recharge/contract status and model permissions therefore remain account
checks. They cannot be resolved from public sources or the Pro label alone.
After owner-authorized activation, verify bounded text/Library/web turns and
credit usage. Simulate exhaustion; do not drain credits to demonstrate a limit.

Before release, prove the application with fake providers and isolated storage:
trusted idempotent admission, immutable attempts/branches, cancellation intent,
reconnect/replay, eviction/late events, exact evidence retention, export/restore,
no paid fallback, provider-switch context and operating pauses. Measure existing
Cloudflare headroom: the plan fee and OpenAI credits are not a Cloudflare
account-wide spending ceiling. No whole-application tests are claimed by this
research-only verification.

## Owner activation update: October 30

After this research, the owner linked the subscription and supplied an API
Platform billing screenshot. It shows the subscription benefit linked to the
personal account, $43.00 available API credit, Free trial state, and the statement
that no payment method is required. This establishes linking and a usable credit
balance; the earlier login/activation blocker is resolved. Exact grant expiry,
purchased-credit/Auto Recharge settings and live model/tool entitlement were not
shown or tested. No screenshot, credential or API key is committed; this text
records only the evidence needed for the implementation plan.
