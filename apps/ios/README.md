# Imladris iOS setup proof

This separate SwiftUI iPhone app proves the native build/run/test workflow.
It uses three fictional Books fixtures and makes no network requests. It is not
the mobile design prototype or a live Library client yet.

The shared `Imladris` scheme contains the app, Swift Testing unit tests, and an
XCTest UI flow that opens a book sheet, checks repeat-read history, dismisses it,
and retains screenshots in the test result. Requires full Xcode and iOS 26+.
The owner's first device is an iPhone 16 on iOS 26.5.2 with a free Personal Team.
The October 13 setup proof passed two unit tests and one UI test on that phone
and on an iPhone 16 simulator running iOS 27.0, using Xcode 27.0 (27A266a).

## App icon

The native icon uses the fuller J2 house-and-waterfall vector from
`docs/design/logo-exploration/j2-vector/imladris-j2.svg`, including its fine roof,
rock, waterfall, and pool details. Light, dark, and grayscale tinted variants
are opaque 1024 px assets; iOS applies the final icon mask. The owner approved the
full mark with a larger footprint: its longest axis fills 928 px, with 48 px
margins and preserved proportions.

Regenerate the committed PNGs from the existing vector from this directory:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift \
  -module-cache-path .build/icon-module-cache scripts/render-app-icon.swift
```

## Setup

1. Finish installing full Xcode and complete first-launch setup. Accept Apple's
   license yourself and install an iOS simulator runtime.
2. Open `Imladris.xcodeproj`. Create an iPhone 16 simulator under Xcode's device
   management UI if none is available, using an installed iOS 26+ runtime.
3. Use the commands below from this directory. They use the conventional Xcode
   installation without changing the system-wide developer-directory selection.
   For another installation, set `DEVELOPER_DIR` explicitly.

```sh
./scripts/ios.sh doctor
./scripts/ios.sh build
./scripts/ios.sh run
./scripts/ios.sh test
```

Set `IOS_SIMULATOR_NAME` or `IOS_SIMULATOR_ID` to select another simulator.
Build outputs are in ignored `.derived-data`; results/screenshots are in ignored
`artifacts`. Open `.xcresult` bundles in Xcode to inspect assertions and retained
screenshots. An immediate launch screenshot is diagnostic, not a substitute for
the UI test's settled-state screenshots.

## Install and test on the phone

1. Add your Apple account in Xcode's account settings.
2. In Signing & Capabilities select your Personal Team for the app and both test
   targets, with Automatically manage signing enabled. A unique bundle identifier
   may be needed if the proposed identifier is unavailable to your team.
3. Pair/trust the phone over USB and enable Developer Mode when prompted. Select
   the phone as the Run destination and Run once to establish provisioning.
4. For repeatable CLI runs, put `DEVELOPMENT_TEAM = your-team-id` in ignored
   `Signing.local.xcconfig`, or let the signing settings configured in Xcode apply.
   Keep personal signing values out of commits.
5. Use the device identifier shown by `doctor`:

```sh
IOS_DEVICE_ID='your-paired-device-id' ./scripts/ios.sh install-device
IOS_DEVICE_ID='your-paired-device-id' ./scripts/ios.sh test-device
```

Set `IOS_ALLOW_PROVISIONING_UPDATES=1` for either device command when Xcode needs
to create or renew profiles, including the test targets' first device run. This
lets Xcode contact Apple using the account you added and register the selected
phone if needed. The local team setting can be inherited by all three targets
through `Signing.local.xcconfig` rather than saved in the shared project.

If the first launch is blocked as an untrusted developer, complete the owner
trust prompt under iPhone Settings → General → VPN & Device Management for the
development certificate used to sign this app.

The phone must be reachable and available for test interaction. For device UI
tests, enable Settings → Developer → Enable UI Automation and
complete any owner authentication prompt before the test session. This setting
is separate from Developer Mode and is not needed for ordinary app use.

Free provisioning expires seven days from issuance; an early Run can reuse the existing profile.
TestFlight is not required for these local installs and would require paid
membership for uploading builds.

## Agent tooling

After Xcode first launch, Apple's external-agent bridge can be configured using
`codex mcp add xcode -- xcrun mcpbridge`. Enable the external-agent setting in
Xcode and approve the actual connection. Keep this project open when required by
the installed Xcode version. Server registration is not proof that its tools are
connected to the current chat; verify discovery and an actual build/inspection.

The current workflow uses shell commands and XCTest. The owner handles Xcode UI
and system prompts; the agent does not use computer use. The bridge is optional
and has not been configured. Interactive physical-phone access through Device Hub
would need a separate local proof and owner approval before changing this workflow.

## Validation boundary

Run the repository's `pnpm check` when changing code/configuration. Also run the
native build and tests above: TypeScript checks do not compile Swift or validate
the Xcode project. Record actual simulator/device results in the owning
[iOS plan](../../docs/planning/ios-app.md), including unverified steps.
