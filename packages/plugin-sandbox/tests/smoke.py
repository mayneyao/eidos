"""Behavioral acceptance tests against the actual release binary."""
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest

BINARY = pathlib.Path(sys.argv.pop(1)).resolve()


class WorkerTests(unittest.TestCase):
    def run_js(self, source, input=None, *args):
        with tempfile.TemporaryDirectory(prefix="plugin-sandbox-test-") as directory:
            path = pathlib.Path(directory) / "plugin.mjs"
            path.write_text(source)
            command = [str(BINARY), "run", str(path), *args]
            if input is not None:
                command.append("--listen")
            return subprocess.run(command, input=input, text=True, capture_output=True, timeout=5)

    def test_module_and_top_level_await(self):
        result = self.run_js('export const answer = 42; await new Promise(r => setTimeout(r, 5)); postMessage({answer});')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"answer": 42})

    def test_console_separate_from_protocol(self):
        result = self.run_js('console.log("hello", {a: 1}); postMessage({ok: true});')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"ok": True})
        self.assertIn('[log] hello {"a":1}', result.stderr)

    def test_async_messages(self):
        result = self.run_js('onmessage = async ({data}) => {await new Promise(r => setTimeout(r, 5)); postMessage(data);};', '{"hello":"世界"}\n[1,2]\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([json.loads(line) for line in result.stdout.splitlines()], [{"hello": "世界"}, [1, 2]])

    def test_timer_cancellation(self):
        result = self.run_js('const id = setTimeout(() => postMessage("wrong"), 1); clearInterval(id); setTimeout(() => postMessage("ok"), 5);')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), "ok")

    def test_interval_and_close(self):
        result = self.run_js('let count = 0; setInterval(() => {postMessage(++count); if (count === 3) close();}, 2);')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["1", "2", "3"])

    def test_listener_removal(self):
        result = self.run_js('const fn = () => postMessage("wrong"); addEventListener("message", fn); removeEventListener("message", fn); addEventListener("message", ({data}) => postMessage(data));', '42\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "42")

    def test_no_node_or_browser_ambient_access(self):
        result = self.run_js('postMessage([typeof process, typeof require, typeof std, typeof os, typeof fetch, typeof document]);')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), ["undefined"] * 4 + ["function", "undefined"])

    def test_import_denied(self):
        result = self.run_js('import fs from "node:fs"; postMessage(fs);')
        self.assertNotEqual(result.returncode, 0)

    def test_exception_reports_failure(self):
        result = self.run_js('throw new Error("fixture failure");')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("fixture failure", result.stderr)

    def test_async_rejection_reports_failure(self):
        result = self.run_js('setTimeout(async () => {throw new Error("async failure")}, 1);')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rejection", result.stderr)

    def test_handled_rejection_succeeds(self):
        result = self.run_js('Promise.reject("expected").catch(() => postMessage("handled"));')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), "handled")

    def test_cpu_loop_terminated(self):
        result = self.run_js('while (true) {}', None, '--turn-budget-ms', '20')
        self.assertNotEqual(result.returncode, 0)

    def test_infinite_microtasks_terminated(self):
        result = self.run_js('function spin() {Promise.resolve().then(spin)} spin();')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("budget", result.stderr)

    def test_memory_limit(self):
        result = self.run_js('const list = []; while (true) list.push(new Uint8Array(1024*1024));', None, '--memory-mb', '8', '--turn-budget-ms', '1000')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("memory", result.stderr.lower())

    def test_total_duration_limit(self):
        result = self.run_js('setInterval(() => {}, 10000);', None, '--max-duration-ms', '30')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duration", result.stderr)

    def test_timer_quota(self):
        result = self.run_js('for (let i=0; i<1025; i++) setTimeout(() => {}, 10000);')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Timer limit", result.stderr)

    def test_oversized_output(self):
        result = self.run_js('postMessage("x".repeat(1024*1024+1));')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")

    def test_invalid_input(self):
        result = self.run_js('onmessage = ({data}) => postMessage(data);', 'not-json\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid JSON", result.stderr)

    def test_oversized_input(self):
        result = self.run_js('onmessage = ({data}) => postMessage(data);', '"' + 'x' * (1024 * 1024) + '"\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exceeds", result.stderr)

    def test_unresolved_module_does_not_hang(self):
        result = self.run_js('await new Promise(() => {});')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Top-level await", result.stderr)

    def test_background_survives_idle_and_stops_by_message(self):
        with tempfile.TemporaryDirectory(prefix="plugin-sandbox-test-") as directory:
            path = pathlib.Path(directory) / "plugin.mjs"
            path.write_text('onmessage = ({data}) => { postMessage(data); if (data.stop) close(); };')
            process = subprocess.Popen([str(BINARY), "run", str(path), "--listen", "--max-duration-ms", "0"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                time.sleep(0.15)
                self.assertIsNone(process.poll())
                stdout, stderr = process.communicate('{"stop":true}\n', timeout=3)
                self.assertEqual(process.returncode, 0, stderr)
                self.assertEqual(json.loads(stdout), {"stop": True})
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()


if __name__ == "__main__":
    unittest.main(verbosity=2)
