#!/usr/bin/env bash
set -euo pipefail
android_root="$(cd "$(dirname "$0")/.." && pwd)"
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME="$sdk_root"
adb_command="$sdk_root/platform-tools/adb"
if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  device_count="$($adb_command devices | awk 'NR>1 && $2 == "device" {count++} END {print count+0}')"
  if [[ "$device_count" != 1 ]]; then
    echo "Start one Android emulator/device, or set ANDROID_SERIAL to the target device." >&2
    exit 1
  fi
fi
cd "$android_root"
./gradlew :app:installDebug
"$adb_command" shell am start -n space.eidos.android.dev/space.eidos.android.MainActivity
