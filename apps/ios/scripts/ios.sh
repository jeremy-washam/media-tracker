#!/bin/bash
set -euo pipefail

ios_root="$(cd "$(dirname "$0")/.." && pwd)"
ios_project="$ios_root/Imladris.xcodeproj"
ios_derived="$ios_root/.derived-data"
ios_artifacts="$ios_root/artifacts"
ios_action="${1:-help}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/ios.sh doctor|build|run|test|install-device|test-device

Simulator: defaults to an available iPhone 16 on iOS 26+.
Override with IOS_SIMULATOR_NAME or IOS_SIMULATOR_ID.
Device: set IOS_DEVICE_ID to the paired iPhone identifier from Xcode/devicectl.
Signing: select your Personal Team in Xcode, or use Signing.local.xcconfig.
Set IOS_ALLOW_PROVISIONING_UPDATES=1 to let Xcode obtain/renew device profiles.
Results and screenshots are retained inside ignored artifacts/.
USAGE
}

if [[ "$ios_action" == help || "$ios_action" == --help ]]; then
  usage
  exit 0
fi

# Prefer an explicit selection; otherwise use the conventional full Xcode path.
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
if ! /usr/bin/xcodebuild -version >/dev/null 2>&1; then
  echo 'Full Xcode is unavailable. Finish its installation and first-launch setup.' >&2
  echo 'For another installation path, set DEVELOPER_DIR to Xcode.app/Contents/Developer.' >&2
  exit 1
fi

if [[ "$ios_action" == doctor ]]; then
  /usr/bin/xcodebuild -version
  /usr/bin/xcodebuild -showsdks
  /usr/bin/xcrun simctl list runtimes
  /usr/bin/xcrun devicectl list devices
  exit 0
fi

ios_build=(/usr/bin/xcodebuild -project "$ios_project" -scheme Imladris
  -configuration Debug -derivedDataPath "$ios_derived")

case "$ios_action" in
  build|run|test)
    ios_simulator="${IOS_SIMULATOR_ID:-}"
    if [[ -z "$ios_simulator" ]]; then
      ios_simulator="$(/usr/bin/xcrun simctl list devices available --json |
        python3 -c '
import json, re, sys
name = sys.argv[1]
candidates = []
for runtime, devices in json.load(sys.stdin)["devices"].items():
    match = re.search(r"iOS-(\d+)", runtime)
    if not match or int(match.group(1)) < 26:
        continue
    for device in devices:
        if device["name"] == name and device.get("isAvailable", False):
            candidates.append((device["state"] == "Booted", int(match.group(1)), device["udid"]))
if not candidates:
    print("No available iOS 26+ simulator named " + name + ". Create it in Xcode, or set IOS_SIMULATOR_ID.", file=sys.stderr)
    sys.exit(1)
print(sorted(candidates, reverse=True)[0][2])
' "${IOS_SIMULATOR_NAME:-iPhone 16}")"
    fi
    ios_build+=(-destination "platform=iOS Simulator,id=$ios_simulator" CODE_SIGNING_ALLOWED=NO)
    if [[ "$ios_action" == test ]]; then
      mkdir -p "$ios_artifacts"
      ios_result="$ios_artifacts/simulator-$(date +%Y%m%d-%H%M%S).xcresult"
      "${ios_build[@]}" -parallel-testing-enabled NO -resultBundlePath "$ios_result" test
      echo "Test results: $ios_result"
    else
      "${ios_build[@]}" build
      if [[ "$ios_action" == run ]]; then
        if ! /usr/bin/xcrun simctl list devices booted --json | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
sys.exit(0 if any(d["udid"] == sys.argv[1] for ds in devices.values() for d in ds) else 1)
' "$ios_simulator"; then
          /usr/bin/xcrun simctl boot "$ios_simulator"
        fi
        /usr/bin/xcrun simctl bootstatus "$ios_simulator" -b
        /usr/bin/xcrun simctl install "$ios_simulator" "$ios_derived/Build/Products/Debug-iphonesimulator/Imladris.app"
        /usr/bin/xcrun simctl launch "$ios_simulator" com.jeremywasham.imladris
        mkdir -p "$ios_artifacts"
        /usr/bin/xcrun simctl io "$ios_simulator" screenshot "$ios_artifacts/library.png"
      fi
    fi
    ;;
  install-device|test-device)
    if [[ -z "${IOS_DEVICE_ID:-}" ]]; then
      echo 'Set IOS_DEVICE_ID to your paired iPhone identifier. Run doctor to list devices.' >&2
      exit 1
    fi
    ios_build+=(-destination "platform=iOS,id=$IOS_DEVICE_ID")
    if [[ "${IOS_ALLOW_PROVISIONING_UPDATES:-0}" == 1 ]]; then
      ios_build+=(-allowProvisioningUpdates -allowProvisioningDeviceRegistration)
    fi
    if [[ "$ios_action" == test-device ]]; then
      mkdir -p "$ios_artifacts"
      ios_result="$ios_artifacts/device-$(date +%Y%m%d-%H%M%S).xcresult"
      "${ios_build[@]}" -parallel-testing-enabled NO -resultBundlePath "$ios_result" test
      echo "Test results: $ios_result"
    else
      "${ios_build[@]}" build
      /usr/bin/xcrun devicectl device install app --device "$IOS_DEVICE_ID" "$ios_derived/Build/Products/Debug-iphoneos/Imladris.app"
      /usr/bin/xcrun devicectl device process launch --device "$IOS_DEVICE_ID" com.jeremywasham.imladris
    fi
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
