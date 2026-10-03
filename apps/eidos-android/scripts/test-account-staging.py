"""Opt-in native login smoke test against staging, using an existing private fixture."""

import argparse
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--account-repo", type=Path, required=True)
parser.add_argument("--clone-cloud", action="store_true", help="Publish and clone a new small fixture Space in the staging test account")
parser.add_argument("--publish-cloud", action="store_true", help="Publish, update and unpublish synthetic Markdown and Eidos fixtures on staging")
parser.add_argument("--skip-native-build", action="store_true", help="Use an explicitly prebuilt JNI library for dependency regression checks")
args = parser.parse_args()
serial = os.environ.get("ANDROID_SERIAL")
if not serial:
    parser.error("Set ANDROID_SERIAL explicitly to a development device")
sdk = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))
adb = sdk / "platform-tools/adb"
android = Path(__file__).resolve().parent.parent


def device(*command, **kwargs):
    return subprocess.run(
        [str(adb), "-s", serial, *command], check=True, capture_output=True, **kwargs
    ).stdout


def instrument(phase):
    output = device(
        "shell", "am", "instrument", "-w", "-r", "-e", "class",
        "space.eidos.android.SyncAccountStagingTest", "-e", "accountPhase", phase,
        "-e", "cloneCloud", str(args.clone_cloud).lower(),
        "-e", "publishCloud", str(args.publish_cloud).lower(),
        "space.eidos.android.dev.test/androidx.test.runner.AndroidJUnitRunner",
    ).decode()
    if "OK (1 test)" not in output:
        raise RuntimeError(f"Native staging {phase} failed:\n{output}")


subprocess.run(
    ["./gradlew", ":app:installDebug", ":app:installDebugAndroidTest"] +
    (["-x", ":app:buildNative"] if args.skip_native_build else []), cwd=android, check=True
)
instrument("prepare")
with tempfile.TemporaryDirectory(prefix="eidos-native-staging-") as directory:
    request = Path(directory) / "request.txt"
    callback = Path(directory) / "callback.txt"
    request.write_bytes(device("exec-out", "run-as", "space.eidos.android.dev", "cat", "cache/staging-account-request.txt"))
    request.chmod(0o600)
    subprocess.run(
        ["node", "scripts/android-oauth-staging.mjs"], cwd=args.account_repo, check=True,
        env=dict(os.environ, EIDOS_ANDROID_REQUEST_FILE=str(request), EIDOS_ANDROID_CALLBACK_FILE=str(callback)),
    )
    device("shell", "run-as", "space.eidos.android.dev", "sh", "-c",
           "'cat > cache/staging-account-callback.txt'", input=callback.read_bytes())
    instrument("finish")
print("PASS: native Android staging PKCE exchange, device registration, account identity, cloud listing and logout")
if args.clone_cloud:
    print("PASS: native Graft HTTPS publish, clone and downloaded Markdown content")
if args.publish_cloud:
    print("PASS: native Publish upload, update and unpublish (Pro-only checks run when the fixture has Pro)")
