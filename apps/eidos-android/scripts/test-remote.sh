#!/usr/bin/env bash
set -euo pipefail
android_root="$(cd "$(dirname "$0")/.." && pwd)"
repo_root="$(cd "$android_root/../.." && pwd)"
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME="$sdk_root"
adb_command="$sdk_root/platform-tools/adb"
if [[ -z "${ANDROID_SERIAL:-}" ]]; then
  devices="$($adb_command devices | awk 'NR>1 && $2 == "device" {print $1}')"
  device_count="$(printf '%s\n' "$devices" | awk 'NF {count++} END {print count+0}')"
  if [[ "$device_count" != 1 ]]; then
    echo "Select one development emulator with ANDROID_SERIAL." >&2
    exit 1
  fi
  export ANDROID_SERIAL="$devices"
fi
if [[ "$($adb_command shell getprop sys.boot_completed | tr -d '\r')" != 1 ]]; then
  echo "Wait for the selected device to finish booting." >&2
  exit 1
fi
fixture_log="$(mktemp -t eidos-android-remote)"
node "$repo_root/apps/graft-remote/scripts/android-test-remote.mjs" > "$fixture_log" 2>&1 &
fixture_pid=$!
mapped=false
cleanup() {
  local result=$?
  if [[ "$mapped" == true ]]; then "$adb_command" reverse --remove "tcp:$port" || true; fi
  kill "$fixture_pid" 2>/dev/null || true
  wait "$fixture_pid" 2>/dev/null || true
  return "$result"
}
trap cleanup EXIT
remote_url=""
for attempt in {1..100}; do
  if [[ -s "$fixture_log" ]]; then read -r remote_url < "$fixture_log"; break; fi
  if ! kill -0 "$fixture_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ ! "$remote_url" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]; then
  cat "$fixture_log" >&2
  echo "Could not start the loopback Graft test fixture." >&2
  exit 1
fi
port="${remote_url##*:}"
export EIDOS_ANDROID_TEST_REMOTE="$remote_url"
cd "$android_root/../cli"
cargo test -p eidos-android-host http_remote_roundtrip --locked -- --ignored
"$adb_command" reverse "tcp:$port" "tcp:$port"
mapped=true
cd "$android_root"
test_args=("-Pandroid.testInstrumentationRunnerArguments.graftRemoteUrl=$remote_url")
if [[ -n "${EIDOS_ANDROID_TEST_CLASS:-}" ]]; then
  test_args+=("-Pandroid.testInstrumentationRunnerArguments.class=$EIDOS_ANDROID_TEST_CLASS")
fi
./gradlew :app:connectedDebugAndroidTest "${test_args[@]}"
