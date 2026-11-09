import { test } from "node:test"
import assert from "node:assert/strict"
import {
  validateSourceManifest,
  inspectExistingObject,
  resolveMediaCopy,
} from "./upload.mjs"

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
test("new scenes cannot inherit the historical table-search description", () => {
  assert.match(resolveMediaCopy(valid()).caption.en, /0\.31\.1/)
  assert.throws(() =>
    resolveMediaCopy({
      ...valid(),
      introducedInRelease: "lite-v0.33.0",
      scenarioId: "recent-files",
    })
  )
})
test("explicit media copy must match the release, scenario and actual capture", () => {
  const source = {
    ...valid(),
    introducedInRelease: "lite-v0.33.0",
    scenarioId: "recent-files",
    capturedAppVersion: "0.33.0",
  }
  const locales = { en: "Recent", zh: "最近", ja: "最近", ko: "최근" }
  const copy = {
    releaseTag: source.introducedInRelease,
    scenarioId: source.scenarioId,
    capturedAppVersion: source.capturedAppVersion,
    buildKind: source.buildKind,
    feature: locales,
    alt: locales,
    caption: locales,
  }
  assert.deepEqual(resolveMediaCopy(source, copy), {
    feature: locales,
    alt: locales,
    caption: locales,
  })
  for (const change of [
    { releaseTag: "lite-v0.31.0" },
    { scenarioId: "files-and-text-search" },
    { capturedAppVersion: "0.32.0" },
    { buildKind: "packaged" },
    { caption: { ...locales, ja: "" } },
    { alt: { en: "Missing translations" } },
  ])
    assert.throws(() => resolveMediaCopy(source, { ...copy, ...change }))
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
