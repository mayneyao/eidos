#!/usr/bin/env python3
"""Exercise Android JNI -> host CLI -> Android JNI with portable file bytes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

android = Path(__file__).resolve().parents[1]
repo = android.parents[1]
sdk = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))
adb = str(sdk / "platform-tools/adb")
serial = os.environ.get("ANDROID_SERIAL")
if not serial:
    raise SystemExit("Set ANDROID_SERIAL to a development emulator before running this test.")
device = [adb, "-s", serial]
app = "space.eidos.android.dev"
run_id = str(uuid.uuid4())
remote = f"cache/compatibility/{run_id}"


def command(args, **kwargs):
    try:
        return subprocess.run(args, check=True, **kwargs)
    except subprocess.CalledProcessError as error:
        if error.stdout:
            print(error.stdout)
        if error.stderr:
            print(error.stderr)
        raise


def instrument(phase):
    result = command(device + ["shell", "am", "instrument", "-w", "-r", "-e", "class",
        "space.eidos.android.DesktopCompatibilityTest", "-e", "compatRun", run_id,
        "-e", "compatPhase", phase, f"{app}.test/androidx.test.runner.AndroidJUnitRunner"],
        capture_output=True, text=True)
    if "OK (1 test)" not in result.stdout or "FAILURES" in result.stdout:
        raise RuntimeError(result.stdout + result.stderr)


command(["cargo", "build", "--locked", "-p", "eidos"], cwd=repo / "apps/cli")
command([str(android / "gradlew"), "-p", str(android), ":app:assembleDebug", ":app:assembleDebugAndroidTest"])
command(device + ["install", "-r", str(android / "app/build/outputs/apk/debug/app-debug.apk")])
command(device + ["install", "-r", str(android / "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk")])
cli = str(repo / "apps/cli/target/debug/eidos")
with tempfile.TemporaryDirectory(prefix="eidos-android-compatibility-") as temporary:
    local = Path(temporary)
    instrument("prepare")
    command(device + ["shell", "am", "force-stop", app])
    for name in ["records.eidos", "manifest.json", "note.md", "assets/data.bin"]:
        target = local / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as output:
            command(device + ["exec-out", "run-as", app, "cat", f"{remote}/{name}"], stdout=output)
    manifest = json.loads((local / "manifest.json").read_text())
    database = str(local / "records.eidos")
    command([cli, "--json", "file", "validate", database])
    rows = command([cli, "--json", "data", "query", database, manifest["table"]], capture_output=True, text=True).stdout
    assert "Android 离线记录 🌱" in rows, rows
    command([cli, "--json", "data", "mutate", database, "--table", manifest["table"],
        "--insert", json.dumps({manifest["label"]: "Desktop 回写记录"}, ensure_ascii=False)])
    command([cli, "--json", "file", "validate", database])
    assert (local / "note.md").read_bytes() == b"# Android\r\n\r\n[\xe9\x99\x84\xe4\xbb\xb6](assets/data.bin)\r\n"
    assert (local / "assets/data.bin").read_bytes() == bytes(i % 251 for i in range(8192))
    with (local / "records.eidos").open("rb") as source:
        command(device + ["shell", "run-as", app, "sh", "-c", f"'cat > {remote}/records.eidos'"], stdin=source)
    instrument("verify")
    print("PASS: Android file read and mutated by the host CLI, then verified by Android JNI.")
    print("PASS: Markdown recovery draft survived an explicit Android process stop.")
    print("Markdown and attachment bytes preserved; SHA-256:", hashlib.sha256((local / "assets/data.bin").read_bytes()).hexdigest())
