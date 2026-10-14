# Native iOS app plan and development workflow

- Date: 2026-10-13
- Status: step 1 complete; simulator and physical-phone workflow verified
- Implementation: fixture-based SwiftUI project builds, runs, and passes native
  tests on the simulator and owner's phone; native design and authentication remain pending

## Owner direction and scope

The owner wants a separate mobile experience, designed independently of the
desktop React/Vite client. Do not treat a narrower desktop layout as the mobile
product. The discussion moved from mobile-web exploration to a native iOS plan
because genuine Apple Liquid Glass and native interactions matter to the owner.
The researched recommendation is a SwiftUI iPhone client using the existing REST
backend. Library is the priority, with Books as the first complete vertical slice.

The previous mobile design studies are disposable and do not establish an
approved design. The owner first authorized capturing this discussion, then
requested step 1. The native setup scaffold now exists under `apps/ios`. This work
does not enroll a paid Apple account, change authentication, or publish an iOS app.

Lists, Explorations, and Feed should inform how the mobile experience will scale.
A four-destination native tab bar containing Library / Lists / Explorations / Feed
is a prototype proposal, not a final navigation decision. Chat and Recaps placement
remains open. Media families and their source-specific sections belong inside
Library; Connections and Settings can be secondary destinations. Representative
future screens use explicitly illustrative data until their services exist.

Keep the private, personal, single-user boundary. No public registration, team
model, or multi-tenant architecture is required. See the [product context](../product/context.md),
[long-term vision](../product/long-term-vision.md), and [desktop UI foundation](../design/ui-foundation.md).
The latter owns desktop behavior; native presentation may be redesigned while
preserving the source-specific data semantics.

## Proposed implementation

Add an ordinary SwiftUI project under `apps/ios`, alongside the existing clients.
Track its `.xcodeproj`, shared scheme, source, and assets. Begin with one app
target, a unit-test target, and a UI-test target. Project generators such as Tuist
or XcodeGen are optional later; they are not prerequisites for this small app.

Use SwiftUI and Foundation first, including `URLSession` with async/await and
Swift `Codable` response models. Separate views from a protocol-backed Library
repository so fixtures, previews, automated tests, and HTTP use the same screen
code. Keep UI state on the main actor and support request cancellation. Avoid
adding a state framework or networking dependency before a concrete need appears.

The existing Hono API, D1/R2 ledger, connectors, provider credentials, cron, and
queue work remain on the backend. The phone consumes HTTP contracts; it does not
import the TypeScript domain package, access D1 directly, or synchronize upstream
accounts independently. [ADR 0002](../decisions/0002-react-vite-hono.md) already
provides this API-first boundary. Record consequential native choices in an ADR
when adopted; do not rewrite existing accepted decisions.

Recommend iOS 26 as the minimum if the owner's phone supports it. Use the latest
stable compatible Xcode, not a beta solely for appearance. On the research date,
Apple listed stable Xcode 27 with a macOS Tahoe 26.6+ requirement. The local Mac
reported macOS 26.6.2. Setup subsequently installed Xcode 27.0 (27A266a) at
`/Applications/Xcode.app`, with the iOS 27.0 SDK and simulator runtime (24A434).
The scripts select that installation using `DEVELOPER_DIR` without changing the
global Command Line Tools selection. The owner confirmed an iPhone 16 on iOS
26.5.2 and a free Apple account. Simulator results on iOS 27 do not establish
compatibility or appearance on the physical iOS 26 phone.
See [Apple's toolchain requirements](https://developer.apple.com/xcode/system-requirements)
when updating the toolchain.

## Native interface and Liquid Glass

Use real system components and let the OS supply their current appearance:

| Need                         | Native implementation to evaluate                              |
| ---------------------------- | -------------------------------------------------------------- |
| Floating tab bar             | `TabView`, with independent navigation state per destination   |
| Navigation and back gestures | `NavigationStack`                                              |
| Expandable bottom sheet      | `.sheet` with medium and large presentation detents            |
| Search                       | `.searchable`, initially scoped to the current Library section |
| Sort and simple selections   | `Menu`, `Picker`, `Toggle`, and context menus                  |
| Larger filters               | Sheet containing native forms and searchable facet selections  |
| Sharing and source links     | `ShareLink` and system URL opening                             |
| Loading and refresh          | `ProgressView`, retry actions, and `.refreshable`              |

On supported systems and SDKs, these components provide genuine native materials,
gestures, and transitions. Partial sheets acquire glass and transition toward an
opaque background at full height. Custom backgrounds can suppress this behavior.
Keep glass chiefly in the control/navigation layer and content readable. Check
Reduce Transparency, increased contrast, Reduce Motion, and system appearance;
glass is not guaranteed to look identical under every preference.

The earlier web capability lab did not provide genuine native Liquid Glass. HTML
controls and CSS blur are not proof of OS-matching native rendering. No reusable
general-purpose browser Liquid Glass material was established by that research.

Prototype sheet inspection alongside a full detail view rather than carrying the
desktop inspector geometry onto the phone. Returning to Library must retain its
query, section, filters, sort, loaded pages, and visible item/offset. Test this
explicitly; native navigation alone is not proof of exact position restoration.

Sources: [Apple's SwiftUI design walkthrough](https://developer.apple.com/videos/play/wwdc2025/323/),
[materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials),
[presentation detents](<https://developer.apple.com/documentation/swiftui/view/presentationdetents(_:)>).

## API integration and data semantics

All six Library families already expose collection, search/filter/sort, counts,
details, and paginated History. The first live client needs these Books routes:

- `GET /api/library/books`
- `GET /api/library/books/{mediaItemId}`
- `GET /api/library/books/{mediaItemId}/history`

The API publishes OpenAPI 3.1 at `/api/openapi.json`. Apple's Swift OpenAPI
Generator supports that format and a URLSession transport. Test generation
against the actual emitted specification before scaling the client. A small
handwritten Books client is sufficient for the first proof. Verify stable
operation names, nullable fields, CSV filter encoding, partial dates, fractional
ratings, structured errors, and authentication/rate-limit responses. A checked-in
sanitized schema snapshot can make builds reproducible without live private login.
Zod refinements still require server validation even if not expressed by OpenAPI.
Preserve compatibility with older installed clients when changing responses.

Use each media family's owning contract rather than a generic cross-media DTO:

- Show each item once and preserve its complete supported History.
- Books collection display/filter/sort uses the latest supported read; older
  reads do not satisfy collection predicates. The current UI foundation
  supersedes broader historical statements about matching any occurrence.
- Preserve unknown dates and year/month/day precision. Never manufacture a UTC
  instant or substitute source-recorded/ingested dates for consumption dates.
- Archive and Queue membership may coexist. Queue remains source-derived and
  read-only; native status/rating/add actions need separate backend ownership work.
- Distinguish personal and community ratings, unique items and occurrences,
  observed listening time and completed listens, source facts and generated data.
- Preserve source links, provenance, freshness, and incomplete coverage.
- Treat cursors as opaque strings. Reset paging on changed queries and discard
  late results from superseded requests. Honor `Retry-After` on rate limits.
- Do not forward app authorization headers to external artwork hosts.

See [Library contracts](library-phase-2-surfaces.md), [Books contracts](../../packages/contracts/src/books.ts),
[API routes](../../apps/api/src/app.ts), and [Apple's generator](https://github.com/apple/swift-openapi-generator).

## Native authentication and hosted availability

[ADR 0005](../decisions/0005-single-user-security.md) explicitly requires a native-
compatible authentication design. Existing Worker checks verify Access JWT
signature, issuer, audience, expiry, identity claims, application-token type, and
the configured owner. Keep that owner boundary and document a new native trust
boundary before implementation changes it.

First investigate Cloudflare Access **Managed OAuth** with Apple's
`ASWebAuthenticationSession`. Cloudflare can accept a user's opaque OAuth token
and forward its signed Access assertion to the origin, potentially preserving
current Worker authorization. Its API schema labeled the feature beta on the
research date. Native clients need authorization code, fresh state, S256 PKCE,
resource handling, secure refresh storage, and serialized refresh attempts.

There is a documentation discrepancy: the main Managed OAuth guide describes
HTTPS redirect allowlists, while the API schema describes exact-match custom
schemes. Verify actual account support and an exact app callback on a physical
phone before adopting the flow. An HTTPS callback requires an associated domain
and publicly reachable association metadata; confirm entitlement/signing support.

Use an isolated owner-only Access deployment with synthetic data for the probe.
Verify code exchange, API access, correct Worker assertions, refresh, expiration,
policy removal, cancelled login, wrong owner/state/verifier/audience, code replay,
and logout. Check desktop login remains usable. Keep tokens and private content
out of evidence logs. Store native credentials in Keychain, and clear private
caches on sign-out. Never embed provider secrets, Cloudflare account API tokens,
or machine service tokens in the app.

If Managed OAuth fails, review HTTPS callbacks before designing a narrow native
session broker. Such a broker would verify the existing owner through Access,
exchange an expiring single-use challenge-bound code, and issue revocable native
sessions. It introduces storage, refresh/replay controls, and narrowly scoped API
policy exceptions. It requires a reviewed ADR and security tests; it is a fallback,
not an adopted design.

The deployment runbook has advanced since the initial research: cloud resources
exist and a paused Worker was published against empty storage. Owner MFA
enrollment/authenticated health verification and private-data transfer remain
pending according to its October 13 record. Re-read the
[deployment runbook](deployment.md#october-13-account-provisioning) before live
integration; this plan is not independent confirmation of current cloud state.

The development bypass in `apps/api/src/access.ts` only accepts explicit loopback
hosts. A phone request to the Mac's LAN IP does not qualify, even if Wrangler
listens on all interfaces. Start with fixtures on both phone and simulator, then
connect the simulator to the local API and the phone to authenticated HTTPS.
A LAN proxy would require explicit temporary device authentication and Debug-only
network configuration, not a broadened production bypass.

Sources: [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/),
[Cloudflare announcement](https://blog.cloudflare.com/managed-oauth-for-access/),
[Access API schema](https://developers.cloudflare.com/api/resources/zero_trust/),
[Apple authentication session](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession),
[native OAuth guidance](https://datatracker.ietf.org/doc/html/rfc8252).

## Cache and offline expectations

Begin with bounded in-memory pages and artwork loading, then add versioned
first-page snapshots after live Books works. The current desktop policy is a
ten-minute freshness baseline with snapshots discarded after 24 hours. Measure
mobile behavior before copying all-section prefetching onto cellular connections.
Fetch the current section first; bound background requests, disk bytes, and images.

Render cached content promptly, retain fetch times, and disclose stale/unavailable
refreshes. Keep preferences separate from private metadata. Use app-container
file protection and deliberate backup/eviction rules; credentials belong in
Keychain. Sign-out clears private caches. Cancel invalidated in-flight reads so
old responses cannot repopulate them. Avoid background five-second status polling.

The initial offline promise is previously cached browsing only. Unvisited details,
History, and searches can require connectivity. No full phone ledger, offline
mutation engine, SwiftData database, or CloudKit synchronization is needed for
the first version. See the [existing cache contract](../../apps/web/README.md#library-loading-and-caching).

## Delivery milestones

| Step                                         | Work                                                                                                 | Reviewable completion                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Setup and device proof                    | Full Xcode, simulator, project/scheme, automatic signing, phone pairing, build/run/test tooling      | A small installed app plus one repeatable simulator and physical-phone test with screenshot/results     |
| 2. Native design prototype                   | Fixture-backed Books Archive/Queue, search, sort, filters, detail/History; illustrative future roots | Real native tabs/sheets on the phone, preserved Library context, and light/dark/accessibility review    |
| 3. Authentication proof                      | Isolated synthetic HTTPS deployment, Managed OAuth probe, native-auth decision                       | Owner-only login, callback, API request, refresh, and denial cases verified on the phone                |
| 4. Live Books                                | Complete existing Books flow after hosting/data gates pass                                           | Real Archive/Queue, filters, paging, details/History, source links, refresh/errors, and return position |
| 5. Daily-use hardening and remaining Library | Cache/network/session handling, device performance, then Movies, Articles, Podcasts, Music, Videos   | All 16 source-specific Library sections with measured and tested behavior                               |
| 6. Future services and distribution          | Separate Lists, Explorations, Feed, Chat, Recaps scope and install/release decisions                 | Only implemented services appear as operational destinations; publishing has its own review             |

The owner requested documentation first, then step 1. Keep its initial UI small:
the immediate goal is proving the development loop, not building every Library
feature during tool setup. Authentication research and a generated-client probe
can follow without blocking fixture-based native review.

Widgets, share extensions, push, Siri/App Intents, background imports, and in-app
media playback are optional future scope. The implemented Reader Articles Feed
is distinct from the future cross-media recommendation Feed. The native client
does not make deferred backend features functional automatically.

## Development and verification workflow

Use this loop for each focused change:

1. Describe the user-visible outcome and relevant acceptance criteria.
2. Edit SwiftUI/model code and run the smallest meaningful build or test.
3. Build/install/launch on the known simulator and exercise the changed flow.
4. Inspect UI state, screenshots, logs, and failures; fix and repeat.
5. Install a verified build on the paired phone, run the relevant device tests,
   and obtain the owner's hands-on feedback when feel or hardware matters.
6. Report build, automated behavior, visual evidence, and unverified device work
   separately. Commit focused changes after required checks.

The agent should own routine builds and test execution once configured. The
owner need not operate Xcode for each change, and local development installs do
not pass through App Store review. Previews speed layout iteration; simulator
automation checks flows; the physical phone validates actual device behavior.

The verified workflow uses full Xcode command-line tools, one simulator, and
repeatable XCTest flows on the simulator and phone. Apple's native MCP bridge is
optional and has not been connected. The owner handles Xcode UI and system
prompts. Keep normal permissions and known project/scheme/destinations.

MobileBuildMCP, formerly XcodeBuildMCP, is an optional build/simulator/device
bridge with CLI and MCP interfaces. Its paired-device tools support builds,
installation, launch, tests, and logs after signing is configured in Xcode.
Wi-Fi pairing can carry over. Add it only where it improves the verified loop;
pin compatible tool versions and do not blindly follow older installation guides.

Physical-phone access has three levels:

| Method              | Capability                                                                                       | Current evidence boundary                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| XCTest UI tests     | Scripted taps, text entry, scrolling, assertions, screenshot attachments                         | Verified on the simulator and owner's iPhone with retained screenshots      |
| Xcode 27 Device Hub | Live screen/control of a paired physical device through a Mac window                             | Apple documents it; agent computer-use compatibility must be proved locally |
| Mobile MCP          | Maintainer advertises real-iPhone screenshots, accessibility inspection, and gestures with Codex | Optional candidate; compatibility/setup must be tested before relying on it |

The first setup proof should change a tiny screen, build it, exercise the simulator,
install it on the phone, and run one phone UI test with a screenshot and result.
Use fixture data so setup does not depend on private hosting or upstream accounts.
Pair/trust prompts, Apple sign-in, Developer Mode, and biometric/login prompts
may require the owner. Keep the phone available and unlocked for device runs;
automated interaction and simultaneous normal phone use can conflict.

For the Books prototype, test search/filter/sort, sheet opening/expansion/dismissal,
History pagination, return to the same collection item/offset, and per-destination
state. Include missing artwork, unknown/partial dates, repeated reads, nullable
ratings, and long titles. Check small-phone/landscape layouts, larger Dynamic Type,
VoiceOver, light/dark appearance, Reduce Motion, and Reduce Transparency. Medium
sheets do not work in compact height; provide a large/full presentation there.

Use Swift Testing for focused model/network/cache tests and XCTest/XCUIAutomation
for user flows. Build and run the native tests in addition to existing root
`pnpm check` and relevant backend checks when code/configuration changes. A green
TypeScript suite does not validate Swift or native UI. Capture screenshots or a
short recording on the actual phone for review of glass and gestures. The owner
provides tactile/haptic and comfort feedback that screenshots cannot establish.

Codex mobile access can let the owner direct the Mac's development session while
the Mac stays awake and connected. It is separate from the device connection
used to test/control the iPhone. Distributed builds via Fastlane/Firebase or a
future TestFlight workflow are optional; they are not required at the desk.

Sources: [Apple external-agent setup](https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode),
[Apple Device Hub](https://developer.apple.com/videos/play/wwdc2026/260/),
[Apple testing](https://developer.apple.com/documentation/xcode/testing),
[MobileBuildMCP](https://github.com/getsentry/MobileBuildMCP),
[device signing prerequisites](https://github.com/getsentry/mobilebuildmcp.com/blob/main/app/docs/_content/device-signing.mdx),
[Mobile MCP](https://github.com/mobile-next/mobile-mcp),
[OpenAI iOS workflow](https://learn.chatgpt.com/use-cases/native-ios-apps),
[remote connections](https://learn.chatgpt.com/docs/remote-connections).

Firsthand developer examples, not a survey of adoption:

- [Karthik Bedre](https://karthikbedre.com/articles/2026/agent-ready-ios-build-loop/)
  describes a known build destination and simulator inspection with runtime evidence.
- [Vedran Burojevic](https://vburojevic.dev/blog/codex-workflow-for-ios/)
  describes small changes, focused checks, and broader validation at integration.
- [Andrey Gordeev](https://andreygordeev.com/2026/07/22/develop-ios-apps-from-iphone-with-codex/)
  directs Codex on a Mac from his phone and installs distributed builds for feedback.

## Signing, installation, and publishing

Start with a free Apple account/Personal Team if the required capabilities permit.
In Xcode, sign in, choose the team, enable automatic signing, pair the phone, enable
Developer Mode, select the device destination, and Run. Once installed, ordinary
use does not need Xcode continuously running, but live data needs a reachable API.

| Route                   | Constraint and recommendation                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free Personal Team      | Profiles expire seven days from issuance; rebuild/reprovision/reinstall. Up to three apps per device, three registered devices, and ten App IDs. Suitable for the first proof.                         |
| Paid development/ad hoc | US$99/year membership at the research date, with regional pricing/tax differences. Private installs on registered devices need no public release, but still require periodic signing renewal.          |
| TestFlight              | Each build expires after 90 days; replacement builds continue testing. Apple's guidelines describe betas intended for public distribution, so do not assume an indefinite personal-app channel.        |
| Unlisted App Store      | Conditional future option requiring normal review and unlisted approval. Anyone with the link can download; owner-only backend authentication protects data. Exactly-one-user acceptance is uncertain. |

Every Xcode Run does not necessarily reset free provisioning: Xcode can reuse a
valid cached profile. Paid profiles also have expiration dates; inspect the actual
issued profile rather than promising permanent installation or an exact renewal
interval. Paid membership can become useful when weekly renewal is inconvenient
or a needed entitlement requires it. The prototype's native UI/networking alone
does not require membership. AltStore/AltServer was discussed as an optional
community refresh approach, not installed or adopted; refresh depends on a
reachable companion computer and is not guaranteed.

Apple explicitly steers apps for small personal audiences toward Xcode/ad hoc.
Investigate unlisted suitability with Apple before relying on approval. Reviewers
need functional review access or a demo mode approved by Apple; use synthetic
data, not the owner's credentials/archive. Custom Apps target organizations through
Business/School Manager rather than a personal Apple-ID download allowlist.
No enrollment, payment, distribution upload, or App Store submission is authorized
merely by this plan.

Sources: [free account limits](https://developer.apple.com/help/account/basics/about-your-developer-account),
[profile regeneration](https://developer.apple.com/help/account/provisioning-profiles/edit-download-or-delete-profiles),
[program enrollment](https://developer.apple.com/help/account/membership/program-enrollment/),
[ad hoc provisioning](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/),
[provisioning internals](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles),
[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
[unlisted distribution](https://developer.apple.com/support/unlisted-app-distribution/),
[review guidelines](https://developer.apple.com/app-store/review/guidelines/),
[AltServer](https://faq.altstore.io/altstore-classic/altserver).

## Next-step checklist

- [x] Confirm phone model/iOS version and Apple membership; confirm iOS 26 minimum.
- [x] Install full Xcode, complete first launch/platform downloads, and select
      its developer tools for command-line runs.
- [x] Create the small project, shared scheme, synthetic fixture path, and tests.
- [x] Verify command-line build and simulator testing. An MCP bridge is optional
      and not connected.
- [x] Owner completes Apple sign-in, automatic signing, pairing/trust, and Developer Mode.
- [x] Prove simulator interaction with retained UI-test screenshots.
- [x] Prove one physical-device UI test with evidence.
- [x] Record exact toolchain/device versions, repeatable commands, and remaining limits.
- Optional, deferred: interactive Device Hub access. The owner requested terminal
  tools rather than computer use; this is not required for the verified workflow.
- [ ] Proceed to the native Books design prototype, then the authentication proof.

Explain Xcode, SwiftUI state, model/network boundaries, signing, and testing as
they become relevant. The owner is new to native development; completing a full
course is not a prerequisite. Apple's [Develop in Swift](https://developer.apple.com/tutorials/develop-in-swift)
tutorials can accompany each milestone.

## October 13 setup progress

The owner confirmed an iPhone 16 running iOS 26.5.2 and a free Apple account.
Xcode 27.0 is installed and first-launch setup is complete; TestFlight is installed
but is not needed for local development. A blank App Store confirmation sheet
interrupted installation. Hiding the floating pet was suggested from matching
community reports; the root cause has not been independently established.

The owner requested that the agent use terminal commands rather than computer
use. The owner handles Xcode UI, Apple sign-in, trust, and permission prompts.
Simulator and device installation/tests use `xcodebuild`, `simctl`, `devicectl`,
and XCTest. Interactive Device Hub access and the Xcode MCP bridge are optional
and have not been configured.

The directly tracked `apps/ios/Imladris.xcodeproj` now contains an app, a Swift
Testing target, an XCTest UI target, and a shared scheme. A bundled fictional
Books fixture exercises Archive/Queue overlap, repeat reads, and unknown/partial
dates. The small UI opens a native medium/large detail sheet and returns to its
list. This is a setup proof, not step 2's complete mobile design.

`apps/ios/scripts/ios.sh` provides doctor/build/run/test and paired-device install/
test commands with ignored build/results directories. The iPhone 16 simulator on
iOS 27.0 passed the SDK build, both Swift Testing tests, and the XCTest book-history
sheet flow. The UI test retains screenshots of the sheet and the returned Library
in `apps/ios/artifacts/simulator-20261013-204022.xcresult`. These local artifacts
are ignored by Git. Project plist, Swift syntax, and shell syntax checks also passed.
The root `pnpm check` passed all 53 test files and 337 tests; an earlier unrelated
reconciliation-test failure did not recur on this full run.

The physical iPhone is paired over USB and reports iOS 26.5.2. Developer Mode is
confirmed enabled. The owner selected the Personal Team, allowed signing, and
trusted the development profile. The app built, installed, and launched on the
phone; the owner confirmed seeing it. Personal signing values live in ignored
`Signing.local.xcconfig` and are inherited by all three targets. The first app
profile was issued October 13 at 8:51 PM PDT and expires October 20 at 8:51 PM PDT,
confirming the seven-day lifetime for this actual install.

Both Swift Testing tests and the XCTest book-history UI flow passed on the phone.
The successful result is retained in `artifacts/device-20261013-210236.xcresult`,
including screenshots of the native sheet and returned Library. The UI flow took
10.175 seconds. The captured native medium sheet and returned Library were also
visually checked in the phone's dark appearance. A post-test foreground launch
was blocked because the phone was locked; the installed app can be opened after
the owner unlocks it. The first device UI test stopped before its assertions with
LocalAuthentication `Authentication canceled`; the owner enabled UI Automation
before the successful retry. Its failed result remains available locally at
`artifacts/device-20261013-205722.xcresult`. Device diagnostic collection on the
failed run also
reported that a nested `xcrun` could not locate `devicectl` while the global
selection remains Command Line Tools; explicit `DEVELOPER_DIR` works for the
project's build/install commands. No global selection change has been made.

The simulator run command passed, installed/launched the app, and saved a diagnostic
`artifacts/library.png`. The root formatter explicitly excludes generated native
build/results directories; the final `pnpm check` passed all 337 tests after that
configuration update. No connected Xcode bridge has been verified. This completes
step 1's fixture-based build/run/test proof. Detailed native design, broader
accessibility/appearance checks, live API authentication, and hosted owner-data
access belong to subsequent milestones.

The owner requested the larger, more detailed J2 logo for the native app icon.
The asset catalog now uses the faithful `imladris-j2.svg` source, rendered into
1024 px light, dark, and grayscale tinted variants. The icon compiles into the
app. The owner approved the preview with a larger footprint and authorized
installation. The renderer now fits the actual artwork to 928 px on its longest
axis, retaining its proportions and a 48 px margin. The updated app built,
installed, and launched successfully on the iPhone on October 13. The native
README records the source and reproducible vector-rendering command.
See the [native README](../../apps/ios/README.md) and
[ADR 0018](../decisions/0018-native-ios-client.md).
