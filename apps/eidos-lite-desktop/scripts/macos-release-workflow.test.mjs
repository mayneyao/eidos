import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { parse } from "yaml"

const workflow = (name) =>
  parse(
    fs.readFileSync(
      new URL(`../../../.github/workflows/${name}`, import.meta.url),
      "utf8"
    )
  )
const release = workflow("build-and-release-eidos-lite.yml")
const mac = workflow("build-lite-macos-x64.yml")

test("publication waits for both the ARM x64 build and Intel acceptance", () => {
  assert.ok(release.jobs.release.needs.includes("build-mac-x64"))
  const caller = release.jobs["build-mac-x64"]
  assert.equal(caller.needs, "verify")
  assert.equal(caller.uses, "./.github/workflows/build-lite-macos-x64.yml")
  assert.equal(mac.jobs["cross-build"]["runs-on"], "macos-15")
  assert.equal(mac.jobs["intel-validation"]["runs-on"], "macos-15-intel")
  assert.equal(mac.jobs["intel-validation"].needs, "cross-build")
  assert.equal(mac.jobs["intel-validation"].if, undefined)
  assert.ok(
    !release.jobs.build.strategy.matrix.include.some(
      (entry) => entry.platform === "mac" && entry.architecture === "x64"
    )
  )
})

test("Intel validates this run's exact artifact and source, never an older build", () => {
  const upload = mac.jobs["cross-build"].steps.find((step) =>
    step.uses?.startsWith("actions/upload-artifact@")
  )
  const download = mac.jobs["intel-validation"].steps.find((step) =>
    step.uses?.startsWith("actions/download-artifact@")
  )
  assert.equal(upload.with.name, "lite-mac-x64")
  assert.equal(download.with.name, upload.with.name)
  assert.equal(download.with["run-id"], undefined)
  assert.match(upload.with.path, /latest-mac\.yml/)
  assert.match(upload.with.path, /blockmap/)
  for (const job of Object.values(mac.jobs)) {
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@")
    )
    assert.equal(checkout.with?.ref, undefined)
    assert.notEqual(job["continue-on-error"], true)
    for (const step of job.steps)
      assert.notEqual(step["continue-on-error"], true)
  }
})

test("manual candidate workflow has no publisher and retains native acceptance", () => {
  assert.ok(Object.hasOwn(mac.on, "workflow_dispatch"))
  assert.equal(mac.permissions.contents, "read")
  assert.deepEqual(Object.keys(mac.jobs).sort(), [
    "cross-build",
    "intel-validation",
  ])
  const commands = mac.jobs["intel-validation"].steps
    .map((step) => step.run ?? "")
    .join("\n")
  for (const expected of [
    "encrypted-graft-host.local.integration.test.ts",
    "packages/plugin-sandbox/tests/smoke.py",
    "packaged-smoke.mjs",
    "installed-upgrade-smoke.mjs",
  ])
    assert.ok(commands.includes(expected), expected)
  assert.match(commands, /GITHUB_REF_NAME#lite-v/)
})
