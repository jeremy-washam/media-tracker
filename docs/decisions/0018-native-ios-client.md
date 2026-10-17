# ADR 0018: Separate native iOS client

- Status: Accepted for the development setup and fixture proof
- Date: 2026-10-13

## Context

The owner wants an independent mobile experience and genuine native Apple
materials and interactions, with Library as the priority. The Hono REST boundary
already supports another client under ADR 0002. Browser mockups did not establish
equivalent Liquid Glass rendering and are disposable. The owner authorized
beginning step 1 of the documented native plan after its research review.

## Decision

Create a separate SwiftUI iPhone app in `apps/ios`, starting with an iOS 26 minimum
and a small synthetic Books flow. The owner's initial device runs iOS 26.5.2.
Keep a directly tracked Xcode project, shared scheme, Swift Testing unit target,
and XCTest UI target. Use SwiftUI/Foundation without third-party runtime packages.

Preserve the desktop React/Vite client and backend package boundaries. Subsequent
live integration consumes REST contracts; ingestion and canonical storage remain
backend responsibilities. Native views may differ from desktop presentation but
must preserve source semantics. No phone ledger or offline mutation engine is
introduced by the setup proof.

Use command-line builds, deterministic fixtures, simulator execution, and
physical-device UI tests to establish a repeatable development loop. Keep build
artifacts, personal signing values, and device-specific state out of Git.

## Consequences

Swift code and native UI require their own build/test validation in addition to
the repository's TypeScript checks. A fixture-based app can be exercised before
private hosted authentication and data transfer are complete.

This decision does not select final native navigation, adopt a native auth flow,
change ADR 0005's owner-only boundary, enroll a paid Apple account, or approve App
Store publication. Those remain separate gates in the [iOS plan](../planning/ios-app.md).
It extends the client architecture without superseding ADR 0002's web/API choice.
