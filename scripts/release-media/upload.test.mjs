import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  validateSourceManifest,
  inspectExistingObject,
  resolveMediaCopy,
  publish,
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

test("screenshots use the same hash approval, immutable receipt and release validation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "lite-release-screenshot-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const script = (name) => fileURLToPath(new URL(name, import.meta.url))
  const asset = join(directory, "screenshot.webp")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=2528x1768",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "90",
    asset,
  ])
  const source = {
    ...valid(),
    scenarioId: "screenshot-fixture",
    mediaType: "image",
    editorialReview: "pending",
    output: { width: 2528, height: 1768 },
  }
  const manifest = join(directory, "source.manifest.json")
  await writeFile(manifest, JSON.stringify(source))
  execFileSync(process.execPath, [
    script("review.mjs"),
    "--dir",
    directory,
    "--approve",
  ])
  const locales = { en: "Layout", zh: "布局", ja: "レイアウト", ko: "레이아웃" }
  const copyFile = join(directory, "copy.json")
  await writeFile(
    copyFile,
    JSON.stringify({
      releaseTag: source.introducedInRelease,
      scenarioId: source.scenarioId,
      capturedAppVersion: source.capturedAppVersion,
      buildKind: source.buildKind,
      feature: locales,
      alt: locales,
      caption: locales,
    })
  )
  const receipt = await publish(directory, { copyFile })
  assert.equal(receipt.uploaded, false)
  assert.equal(receipt.media.type, "image")
  assert.match(receipt.media.src, /[a-f0-9]{64}\/screenshot\.webp$/)
  assert.equal(receipt.files.length, 1)
  assert.equal(receipt.media.poster, undefined)
  await appendFile(asset, "changed")
  await assert.rejects(
    publish(directory, { copyFile }),
    /Media changed after review/
  )

  // Exercise the local composer with synthetic successful read-back evidence.
  const file = receipt.files[0]
  const verified = {
    ...receipt,
    uploaded: true,
    verifiedAt: "2026-11-19T00:00:00Z",
    checks: {
      files: [
        {
          url: file.url,
          sha256: file.sha256,
          contentType: file.type,
          status: 200,
          cacheControl: "immutable",
        },
      ],
    },
  }
  const receiptPath = join(directory, "published-media.json")
  const headings = join(directory, "headings.json")
  await writeFile(receiptPath, JSON.stringify(verified))
  await writeFile(headings, JSON.stringify({ [source.scenarioId]: locales }))
  for (const [locale, filename] of [
    ["en", "RELEASE_NOTES.md"],
    ["zh", "RELEASE_NOTES.zh-CN.md"],
  ])
    await writeFile(
      join(directory, filename),
      `## Improvements\n\n### ${locales[locale]}\n\nRelease fixture.\n`
    )
  const out = join(directory, "out")
  const compose = [
    script("lite-release.mjs"),
    "compose",
    "--tag",
    verified.releaseTag,
    "--notes-dir",
    directory,
    "--out-dir",
    out,
    "--sections",
    headings,
  ]
  execFileSync(process.execPath, [...compose, "--demo", receiptPath])
  const notes = await readFile(join(out, "RELEASE_NOTES.md"), "utf8")
  assert.ok(notes.includes(`[![Layout](${file.url})](${file.url})`))
  const tooMany = spawnSync(
    process.execPath,
    [
      ...compose,
      ...Array.from({ length: 5 }, () => ["--demo", receiptPath]).flat(),
    ],
    { encoding: "utf8" }
  )
  assert.notEqual(tooMany.status, 0)
  assert.match(tooMany.stderr, /at most 4 screenshots and videos combined/)
})
