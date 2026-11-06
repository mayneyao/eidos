import { test } from "node:test"
import assert from "node:assert/strict"
import { validateSourceManifest, inspectExistingObject } from "./upload.mjs"

const valid = () => ({
  schemaVersion: 1,
  dataOrigin: "synthetic",
  fixtureUnchanged: true,
  editorialReview: "approved",
  assertions: [{ name: "real result", passed: true }],
  introducedInRelease: "lite-v0.31.0",
  scenarioId: "table-search-escape",
  sourceCommit: "a".repeat(40),
  capturedAppVersion: "0.31.1",
  buildKind: "development",
})
test("publishing rejects real or unreviewed data and failed scenarios", () => {
  for (const change of [
    { dataOrigin: "user" },
    { editorialReview: "pending" },
    { fixtureUnchanged: false },
    { assertions: [] },
    { assertions: [{ passed: false }] },
  ])
    assert.throws(() => validateSourceManifest({ ...valid(), ...change }))
})
test("object path inputs cannot escape their release and scenario namespace", () => {
  for (const change of [
    { scenarioId: "../private" },
    { introducedInRelease: "../../" },
    { sourceCommit: "unknown" },
    { capturedAppVersion: "latest" },
  ])
    assert.throws(() => validateSourceManifest({ ...valid(), ...change }))
})
test("source keeps the capture build distinct from the feature introduction", () => {
  assert.doesNotThrow(() => validateSourceManifest(valid()))
})
test("missing objects are probed privately so a CDN 404 is never cached before upload", async () => {
  let calls = 0
  const found = await inspectExistingObject(
    { accountId: "account", bucket: "eidos-media" },
    { key: "releases/lite/one/demo.mp4", sha256: "unused" },
    "test-token",
    async (url, options) => {
      calls++
      assert.equal(new URL(url).hostname, "api.cloudflare.com")
      assert.ok(url.endsWith("/objects/releases%2Flite%2Fone%2Fdemo.mp4"))
      assert.equal(options.headers.Authorization, "Bearer test-token")
      return new Response("missing", { status: 404 })
    }
  )
  assert.equal(found, false)
  assert.equal(calls, 1)
})
