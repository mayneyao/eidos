#!/usr/bin/env python3
"""Stop Android during a real Graft HTTP request, then verify recovery and retry."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
import subprocess
import threading
import uuid

android = Path(__file__).resolve().parents[1]
repo = android.parents[1]
sdk = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))
serial = os.environ.get("ANDROID_SERIAL")
if not serial:
    raise SystemExit("Set ANDROID_SERIAL to a development emulator.")
adb = [str(sdk / "platform-tools/adb"), "-s", serial]
app = "space.eidos.android.dev"
run_id = str(uuid.uuid4())
received = threading.Event()
release = threading.Event()


class StalledRequest(BaseHTTPRequestHandler):
    def do_GET(self):
        received.set()
        release.wait(45)
        self.close_connection = True

    do_POST = do_GET
    do_PUT = do_GET
    do_HEAD = do_GET

    def log_message(self, *args):
        pass


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


server = ThreadingHTTPServer(("127.0.0.1", 0), StalledRequest)
server.daemon_threads = True
port = server.server_port
url = f"http://127.0.0.1:{port}/android/{run_id}"
threading.Thread(target=server.serve_forever, daemon=True).start()
worker = None
remote = None


def instrument(phase):
    return adb + ["shell", "am", "instrument", "-w", "-r", "-e", "class",
        "space.eidos.android.DesktopCompatibilityTest", "-e", "compatRun", run_id,
        "-e", "compatPhase", phase, "-e", "graftRemoteUrl", url,
        f"{app}.test/androidx.test.runner.AndroidJUnitRunner"]


try:
    run([str(android / "gradlew"), "-p", str(android), ":app:assembleDebug", ":app:assembleDebugAndroidTest"])
    run(adb + ["install", "-r", str(android / "app/build/outputs/apk/debug/app-debug.apk")])
    run(adb + ["install", "-r", str(android / "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk")])
    run(adb + ["reverse", f"tcp:{port}", f"tcp:{port}"])
    worker = subprocess.Popen(instrument("startSync"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if not received.wait(30):
        raise RuntimeError("The native sync request did not reach the stalled HTTP endpoint")
    if worker.poll() is not None:
        raise RuntimeError("Instrumentation exited before the process could be interrupted")
    run(adb + ["shell", "am", "force-stop", app])
    worker.communicate(timeout=10)
    release.set()
    remote = subprocess.Popen(["node", str(repo / "apps/graft-remote/scripts/android-test-remote.mjs")],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    address = remote.stdout.readline().strip()
    match = re.fullmatch(r"http://127\.0\.0\.1:(\d+)", address)
    if not match:
        raise RuntimeError("Could not start the real Graft fixture: " + address)
    run(adb + ["reverse", f"tcp:{port}", "tcp:" + match.group(1)])
    result = run(instrument("verifySync"), capture_output=True, text=True)
    if "OK (1 test)" not in result.stdout or "FAILURES" in result.stdout:
        raise RuntimeError(result.stdout + result.stderr)
    print("PASS: stopped an in-flight Graft request; local data and interruption status survived.")
    print("PASS: edited after restart, published to a real Graft remote, and cloned all files successfully.")
finally:
    release.set()
    if worker is not None and worker.poll() is None:
        run(adb + ["shell", "am", "force-stop", app])
        worker.communicate(timeout=10)
    subprocess.run(adb + ["reverse", "--remove", f"tcp:{port}"], check=False)
    if remote is not None:
        remote.terminate()
        remote.communicate(timeout=10)
    server.shutdown()
    server.server_close()
