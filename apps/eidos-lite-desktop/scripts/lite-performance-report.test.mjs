import test from "node:test"
import assert from "node:assert/strict"
import {
  compareMeasurements,
  extractReport,
  marker,
  readComment,
  releaseDecision,
  renderComment,
  validateMeasurement,
  closePatchException,
  closePatchMeasuredHead,
} from "./lite-performance-report.mjs"

test("the owner-approved close patch exception cannot cover another release or runtime edit", () => {
  const paths = ["apps/eidos-lite-desktop/scripts/lite-performance-report.mjs"]
  assert.equal(
    closePatchException("lite-v0.29.5", { number: 357 }, paths),
    true
  )
  assert.equal(
    closePatchException("lite-v0.29.6", { number: 357 }, paths),
    false
  )
  assert.equal(
    closePatchException("lite-v0.29.5", { number: 358 }, paths),
    false
  )
  assert.equal(
    closePatchException("lite-v0.29.5", { number: 357 }, [
      ...paths,
      "apps/eidos-lite-desktop/src/main/window-controller.ts",
    ]),
    false
  )
  const sha = "d".repeat(40)
  const pr = {
    number: 357,
    merged_at: "2026-10-31",
    merge_commit_sha: sha,
    head: { sha: "e".repeat(40) },
  }
  const data = { headSha: closePatchMeasuredHead, majorRegression: true }
  const result = releaseDecision(sha, pr, data, true)
  assert.equal(result.performance, "owner-approved-exception")
  assert.equal(result.recordedMajorRegression, true)
  assert.throws(() => releaseDecision(sha, pr, data))
  assert.throws(() => releaseDecision(sha, pr, null, true))
  assert.throws(() =>
    releaseDecision(sha, { ...pr, merged_at: null }, data, true)
  )
})

const measurement = (metrics = {}, architecture = "x64") => ({
  schema: 1,
  headSha: "a".repeat(40),
  sourceSha: "b".repeat(40),
  version: "0.26.0",
  platform: "mac",
  architecture,
  runner: architecture === "x64" ? "macos-15-intel" : "macos-15",
  variant: "staging",
  metrics: {
    coldStartMs: 1000,
    utilityOpenP95Ms: 300,
    denseGridFirstFrameMs: 200,
    ...metrics,
  },
})

test("publication requires an exact merged PR and blocks a known major regression", () => {
  const sha = "d".repeat(40)
  const pr = {
    number: 333,
    merged_at: "2026-10-18T11:09:01Z",
    merge_commit_sha: sha,
    head: { sha: "a".repeat(40) },
  }
  assert.equal(releaseDecision(sha, pr, null).performance, "report-unavailable")
  assert.throws(() => releaseDecision(sha, null, null))
  assert.throws(() => releaseDecision("e".repeat(40), pr, null))
  assert.throws(() =>
    releaseDecision(sha, pr, { headSha: "a".repeat(40), majorRegression: true })
  )
  assert.throws(() =>
    releaseDecision(sha, pr, {
      headSha: "b".repeat(40),
      majorRegression: false,
    })
  )
})

test("ordinary noise and an absolute overrun alone do not block", () => {
  const current = measurement({ coldStartMs: 2419 })
  const previous = measurement({ coldStartMs: 1800 })
  assert.equal(compareMeasurements([current], [previous]).major.length, 0)
})

test("both the proportional and absolute increase are necessary", () => {
  const previous = measurement()
  assert.equal(
    compareMeasurements([measurement({ coldStartMs: 1999 })], [previous]).major
      .length,
    0
  )
  assert.equal(
    compareMeasurements([measurement({ coldStartMs: 2000 })], [previous]).major
      .length,
    1
  )
  assert.equal(
    compareMeasurements([measurement({ utilityOpenP95Ms: 600 })], [previous])
      .major.length,
    0
  )
  assert.equal(
    compareMeasurements([measurement({ utilityOpenP95Ms: 800 })], [previous])
      .major.length,
    1
  )
  assert.equal(
    compareMeasurements(
      [measurement({ denseGridFirstFrameMs: 700 })],
      [previous]
    ).major.length,
    1
  )
})

test("first measurements and different runners establish a new baseline", () => {
  assert.equal(compareMeasurements([measurement()]).major.length, 0)
  const previous = { ...measurement(), runner: "macos-14" }
  const result = compareMeasurements(
    [measurement({ coldStartMs: 5000 })],
    [previous]
  )
  assert.equal(result.major.length, 0)
  assert.equal(result.rows[0].before, null)
  assert.equal(
    compareMeasurements([measurement()], [measurement({}, "arm64")]).rows[0]
      .before,
    null
  )
})

test("unsigned staging and signed production establish separate baselines", () => {
  const current = measurement({ denseGridFirstFrameMs: 1247 })
  const previous = {
    ...measurement({ denseGridFirstFrameMs: 487.8 }),
    variant: "production",
  }
  const result = compareMeasurements([current], [previous])
  assert.equal(result.major.length, 0)
  assert.ok(result.rows.every((row) => row.before === null))
  const sameVariant = compareMeasurements(
    [current],
    [{ ...previous, variant: "staging" }]
  )
  assert.equal(sameVariant.major.length, 1)
  assert.equal(sameVariant.major[0].metric, "denseGridFirstFrameMs")
})

test("untrusted artifacts cannot inject fields or non-finite measurements", () => {
  assert.throws(() => validateMeasurement(measurement({ coldStartMs: -1 })))
  assert.throws(() =>
    validateMeasurement(measurement({ coldStartMs: Infinity }))
  )
  assert.throws(() =>
    validateMeasurement({ ...measurement(), headSha: "other" })
  )
  assert.throws(() => compareMeasurements([measurement(), measurement()]))
  assert.equal(
    validateMeasurement({ ...measurement(), command: "do not execute" })
      .command,
    undefined
  )
})

test("the successful report is extracted without executing log contents", () => {
  const report = {
    ok: true,
    graft: { version: "0.3.32" },
    performance: { coldStartMs: 1200 },
  }
  const log =
    "diagnostic\n" + JSON.stringify(report, null, 2) + "\ncommand completed\n"
  assert.deepEqual(extractReport(log), report)
  assert.throws(() => extractReport('{"ok":false}'))
})

test("comments round-trip structured metrics and reject stale or malformed data", () => {
  const data = {
    schema: 1,
    headSha: "a".repeat(40),
    measurements: [measurement()],
    majorRegression: false,
    runUrl: "https://github.com/mayneyao/eidos/actions/runs/123",
  }
  const body = renderComment(data, compareMeasurements(data.measurements))
  assert.deepEqual(readComment(body).measurements, data.measurements)
  assert.equal(readComment("untrusted prefix\n" + body), null)
  assert.equal(
    readComment(marker + "\n<!-- eidos-lite-performance-data\n{}\n-->"),
    null
  )
  assert.equal(
    readComment(
      body.replace(
        '"headSha":"' + "a".repeat(40),
        '"headSha":"' + "c".repeat(40)
      )
    ),
    null
  )
})
