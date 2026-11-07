import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const execute = promisify(execFile)
const verifier = fileURLToPath(
  new URL("./verify-electron-output.mjs", import.meta.url)
)

// A clean output contract, including both overlapping automatic-sync names.
const cleanOutput = [
  "contracts.ts",
  "eidos-lite-build-environment.json",
  "graft-sdk-build-policy.json",
  "spark-key-build-policy.json",
  "graft-worker.js",
  "main.js",
  "preload.js",
  "runtime-worker.js",
  "application-Ab-cD_e1.js",
  "automatic-sync-CtpZ3yCv.js",
  "automatic-sync-electron-smoke-DDe-8k5k.js",
  "compiler-d-fxUvkQ.js",
  "dist-DpwEI01X.js",
  "encrypted-staging-smoke-T5mogOX5.js",
  "i18n-C4uJzVls.js",
  "node-sqlite-9uYs6aKA.js",
  "logging-BbWfH-XV.js",
  "package-CLObI5_8.js",
  "packaged-smoke-B5KS3Cg2.js",
  "packaged-startup-smoke-DtIjMns5.js",
  "plugin-file-mutations-rynPN3Tf.js",
  "runtime-pool-CiiJNRl-.js",
  "space-clone-coordinator-Ds_y1Tuc.js",
  "space-paths-BCVqZKzh.js",
  "space-session-rDeCYcDa.js",
  "sync-encryption-RAQwfjNc.js",
  "sync-failure-CAbpkW5V.js",
  "terminal-session-manager-vRR-eJDP.js",
  "text-draft-copy-DQ1WpnrY.js",
  "updater-yGbt3M84.js",
]

async function fixture(t) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-electron-output-")
  )
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await Promise.all(
    cleanOutput.map((name) => fs.writeFile(path.join(root, name), ""))
  )
  return root
}

async function rejectsOutput(root, expected) {
  await assert.rejects(execute(process.execPath, [verifier, root]), (error) => {
    assert.equal(error.code, 1)
    for (const pattern of Array.isArray(expected) ? expected : [expected]) {
      assert.match(error.stderr, pattern)
    }
    return true
  })
}

test("accepts the exact main/worker/preload outputs and the new split chunks", async (t) => {
  const root = await fixture(t)
  const result = await execute(process.execPath, [verifier, root])
  assert.match(
    result.stdout,
    /Verified clean Eidos Lite Electron output \(30 files\)/
  )
})

test("rejects arbitrary JavaScript chunks and standalone smoke fixture entries", async (t) => {
  const root = await fixture(t)
  for (const name of [
    "unknown-ABCDEFGH.js",
    "automatic-sync-electron-main-ABCDEFGH.js",
    "automatic-sync-electron-smoke.js",
  ]) {
    await fs.writeFile(path.join(root, name), "")
  }
  await rejectsOutput(root, [
    /unexpected outputs:.*unknown-ABCDEFGH\.js/,
    /unexpected outputs:.*automatic-sync-electron-main-ABCDEFGH\.js/,
    /unexpected outputs:.*automatic-sync-electron-smoke\.js/,
  ])
})

test("rejects stale duplicates of a known chunk", async (t) => {
  const root = await fixture(t)
  await fs.writeFile(path.join(root, "automatic-sync-ABCDEFGH.js"), "")
  await rejectsOutput(
    root,
    /expected exactly one automatic-sync chunk, found 2/
  )
})

test("requires every known split chunk rather than accepting only its longer smoke prefix", async (t) => {
  const root = await fixture(t)
  await fs.unlink(path.join(root, "automatic-sync-CtpZ3yCv.js"))
  await rejectsOutput(
    root,
    /expected exactly one automatic-sync chunk, found 0/
  )
})

test("rejects a malformed hash instead of accepting a name-prefix wildcard", async (t) => {
  const root = await fixture(t)
  await fs.rename(
    path.join(root, "sync-failure-CAbpkW5V.js"),
    path.join(root, "sync-failure-not-a-build-hash.js")
  )
  await rejectsOutput(root, /expected exactly one sync-failure chunk, found 0/)
})

test("still requires the fixed worker entries and rejects non-file outputs", async (t) => {
  const root = await fixture(t)
  await fs.unlink(path.join(root, "graft-worker.js"))
  await fs.mkdir(path.join(root, "fixtures"))
  await rejectsOutput(root, [
    /unexpected non-file outputs: fixtures/,
    /missing fixed output: graft-worker\.js/,
  ])
})
