import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const marker = "<!-- eidos-lite-performance:v1 -->"
export const policy = {
  coldStartMs: { ratio: 2, increaseMs: 1000 },
  utilityOpenP95Ms: { ratio: 2, increaseMs: 500 },
  denseGridFirstFrameMs: { ratio: 2, increaseMs: 500 },
}

export function validateMeasurement(value) {
  assert.equal(value.schema, 1)
  for (const key of ["headSha", "sourceSha"])
    assert.match(value[key], /^[a-f0-9]{40}$/u)
  assert.match(value.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u)
  assert.equal(value.platform, "mac")
  assert.ok(["arm64", "x64"].includes(value.architecture))
  assert.match(value.runner, /^macos-\d+(?:-intel)?$/u)
  assert.ok(["staging", "production"].includes(value.variant))
  const metrics = {}
  for (const key of Object.keys(policy)) {
    const metric = value.metrics[key]
    assert.ok(Number.isFinite(metric) && metric > 0 && metric < 600_000, key)
    metrics[key] = metric
  }
  return {
    schema: 1,
    headSha: value.headSha,
    sourceSha: value.sourceSha,
    version: value.version,
    platform: "mac",
    architecture: value.architecture,
    runner: value.runner,
    variant: value.variant,
    metrics,
  }
}

export function compareMeasurements(current, previous = []) {
  const rows = []
  const major = []
  const seen = new Set()
  for (const raw of current) {
    const item = validateMeasurement(raw)
    assert.ok(!seen.has(item.architecture), "Duplicate architecture")
    seen.add(item.architecture)
    const baseline = previous
      .map(validateMeasurement)
      .find(
        (old) =>
          old.architecture === item.architecture &&
          old.runner === item.runner &&
          old.variant === item.variant
      )
    for (const [metric, limits] of Object.entries(policy)) {
      const value = item.metrics[metric]
      const before = baseline?.metrics[metric]
      const delta = before === undefined ? null : value - before
      const regression =
        before !== undefined &&
        value >= before * limits.ratio &&
        delta >= limits.increaseMs
      const row = {
        architecture: item.architecture,
        metric,
        value,
        before: before ?? null,
        delta,
        regression,
      }
      rows.push(row)
      if (regression) major.push(row)
    }
  }
  return { rows, major }
}

export function extractReport(log) {
  for (const match of log.matchAll(/\{\n\s+"ok"/gu)) {
    const rest = log.slice(match.index)
    // The packaged command prints its complete JSON report last.
    try {
      const end = rest.indexOf("\n}")
      if (end < 0) continue
      const value = JSON.parse(rest.slice(0, end + 2))
      if (value.ok === true && value.graft && value.performance) return value
    } catch {
      // Ignore non-report diagnostic JSON; never execute log contents.
    }
  }
  throw new Error("Missing successful packaged measurement")
}

export function readComment(body) {
  if (!body.startsWith(marker) || body.length > 64_000) return null
  const match = /<!-- eidos-lite-performance-data\n([^]*?)\n-->/u.exec(body)
  if (!match) return null
  try {
    const data = JSON.parse(match[1])
    assert.equal(data.schema, 1)
    assert.match(data.headSha, /^[a-f0-9]{40}$/u)
    assert.ok(Array.isArray(data.measurements) && data.measurements.length <= 2)
    data.measurements = data.measurements.map(validateMeasurement)
    assert.ok(data.measurements.every((item) => item.headSha === data.headSha))
    assert.equal(typeof data.majorRegression, "boolean")
    return data
  } catch {
    return null
  }
}

// Release provenance is independent of noisy CI performance observations.
export function releaseDecision(sha, pr) {
  assert.match(sha ?? "", /^[a-f0-9]{40}$/u)
  assert.ok(pr?.merged_at, "Lite releases require a merged PR")
  assert.equal(
    pr.merge_commit_sha,
    sha,
    "Tag must point to the PR merge commit"
  )
  return { pr: pr.number, source: sha, performance: "observation-only" }
}

export function performanceStatus(data) {
  return {
    state: "success",
    context: "Lite performance regression",
    description: "Observation only; CI timings do not inform release decisions",
    target_url: data.runUrl,
  }
}

export function renderComment(data, comparison) {
  const number = (value) => (value === null ? "—" : value.toFixed(0) + " ms")
  const rows = comparison.rows.map(
    (row) =>
      `| ${row.architecture} | ${row.metric} | ${number(row.value)} | ${number(row.before)} | ${number(row.delta)} | ${row.regression ? "较大波动" : row.before === null ? "建立基线" : "记录"} |`
  )
  return [
    marker,
    "### Lite 性能记录",
    "",
    `提交：\`${data.headSha}\` · 基线：${data.baselineTag ?? "无可比的已发布基线"}`,
    "仅供观测：GitHub CI 机器负载波动较大，本报告不阻塞发布，也不提供发布建议。",
    data.measurements.length
      ? "本次测量已记录；缺少兼容基线时仅记录本次数据。"
      : "测量不可用；不据此宣称性能通过。",
    `本次构建类型：${[...new Set(data.measurements.map((item) => item.variant))].join("、") || "不可用"}。`,
    "",
    "| 架构 | 指标 | 本次 | 上次发布 | 增加 | 观测 |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...rows,
    "",
    "每个平台只测一次。只有耗时至少翻倍，且启动增加 ≥1000 ms、文件打开 P95 或首帧增加 ≥500 ms，标记为较大波动，不据此认定产品性能退化。只比较相同构建类型、架构和 runner；production 与 staging 分别留底，缺少兼容基线时仅记录。单次测量不代表性能 SLA。",
    `源码负载观测：${data.sourceLoad ?? "未执行"}。 [CI 与原始测量](${data.runUrl})`,
    "",
    "<details><summary>可供后续观测比较的数据</summary>",
    "",
    "<!-- eidos-lite-performance-data",
    JSON.stringify(data),
    "-->",
    "</details>",
  ].join("\n")
}

function githubClient() {
  const repository = process.env.GITHUB_REPOSITORY
  assert.match(repository ?? "", /^[\w.-]+\/[\w.-]+$/u)
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  assert.ok(token, "Missing GitHub credential")
  const owner = repository.split("/")[0]
  const api = async (route, method = "GET", body) => {
    const response = await fetch(
      "https://api.github.com/repos/" + repository + "/" + route,
      {
        method,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      }
    )
    if (!response.ok)
      throw new Error(`GitHub ${method} ${route}: ${response.status}`)
    return response.json()
  }
  const comments = async (number) => {
    const result = []
    for (let page = 1; page <= 5; page++) {
      const items = await api(
        `issues/${number}/comments?per_page=100&page=${page}`
      )
      result.push(...items)
      if (items.length < 100) break
    }
    return result
  }
  const trusted = (item) =>
    item.user.login === "github-actions[bot]" || item.user.login === owner
  const measurementFor = async (pr) => {
    const items = await comments(pr.number)
    const results = items
      .filter(trusted)
      .map((item) => readComment(item.body))
      .filter((data) => data?.headSha === pr.head.sha)
    return (
      results.filter((data) => data.measurements.length > 0).at(-1) ??
      results.at(-1)
    )
  }
  const associatedPr = async (sha) => {
    assert.match(sha, /^[a-f0-9]{40}$/u)
    const candidates = await api(`commits/${sha}/pulls?per_page=100`)
    const pr = candidates.find(
      (item) => item.merged_at && item.merge_commit_sha === sha
    )
    return pr ? api("pulls/" + pr.number) : null
  }
  return { repository, api, measurementFor, associatedPr }
}

async function main() {
  const mode = process.argv[2]
  if (mode === "extract") {
    const report = extractReport(await fs.readFile(process.argv[3], "utf8"))
    const value = validateMeasurement({
      schema: 1,
      headSha: process.env.PERF_HEAD_SHA,
      sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      version: JSON.parse(
        await fs.readFile("apps/eidos-lite-desktop/package.json", "utf8")
      ).version,
      platform: "mac",
      architecture: process.env.PERF_ARCH,
      runner: process.env.PERF_RUNNER,
      variant: process.env.PERF_VARIANT,
      metrics: {
        coldStartMs: report.performance.coldStartMs,
        utilityOpenP95Ms: report.performance.utilityOpenP95Ms,
        denseGridFirstFrameMs:
          report.performance.denseGrid.renderedFirstFrameMs,
      },
    })
    await fs.writeFile(process.argv[4], JSON.stringify(value, null, 2) + "\n")
    return
  }
  const client = githubClient()
  if (mode === "guard") {
    const sha = process.env.GITHUB_SHA
    const pr = await client.associatedPr(sha)
    console.log(JSON.stringify(releaseDecision(sha, pr)))
    return
  }
  assert.equal(mode, "comment")
  const number = Number(process.env.PERF_PR_NUMBER)
  assert.ok(Number.isSafeInteger(number) && number > 0)
  const head = process.env.PERF_HEAD_SHA
  assert.match(head ?? "", /^[a-f0-9]{40}$/u)
  const pr = await client.api("pulls/" + number)
  assert.equal(
    pr.head.repo.full_name,
    client.repository,
    "Fork reports cannot write privileged results"
  )
  if (pr.head.sha !== head) return console.log("Skip stale PR measurement")
  const folder = process.env.PERF_REPORT_DIR
  const files = await fs.readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })
  const measurements = []
  for (const file of files.filter(
    (file) => file.isFile() && file.name === "result.json"
  )) {
    const filename = path.join(file.parentPath, file.name)
    assert.ok((await fs.stat(filename)).size < 16_000)
    try {
      const value = validateMeasurement(
        JSON.parse(await fs.readFile(filename, "utf8"))
      )
      assert.equal(value.headSha, head)
      assert.equal(value.version, process.env.PERF_VERSION)
      measurements.push(value)
    } catch {
      console.warn(
        "Ignoring invalid or stale measurement; it is not performance evidence"
      )
    }
  }
  assert.ok(measurements.length <= 2)
  const version = process.env.PERF_VERSION
  assert.match(version ?? "", /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u)
  const releases = await client.api("releases?per_page=100")
  const release = releases
    .filter(
      (item) =>
        !item.draft &&
        /^lite-v\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(item.tag_name) &&
        item.tag_name !== "lite-v" + version
    )
    .sort(
      (left, right) =>
        Date.parse(right.published_at) - Date.parse(left.published_at)
    )[0]
  let baseline
  if (release) {
    const ref = await client.api("git/ref/tags/" + release.tag_name)
    const sha =
      ref.object.type === "tag"
        ? (await client.api("git/tags/" + ref.object.sha)).object.sha
        : ref.object.sha
    const previousPr = await client.associatedPr(sha)
    if (previousPr) baseline = await client.measurementFor(previousPr)
  }
  const comparison = compareMeasurements(measurements, baseline?.measurements)
  const existing = measurements.length ? null : await client.measurementFor(pr)
  const data = {
    schema: 1,
    headSha: head,
    version,
    measurements,
    baselineTag: baseline ? release.tag_name : null,
    majorRegression:
      comparison.major.length > 0 || existing?.majorRegression === true,
    sourceLoad: process.env.PERF_SOURCE_LOAD ?? "unavailable",
    runUrl: `https://github.com/${client.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  }
  await client.api(`issues/${number}/comments`, "POST", {
    body: renderComment(data, comparison),
  })
  // Keep the existing context name so old required-status configurations do
  // not wait forever. Its success only means an observation was recorded.
  await client.api(`statuses/${head}`, "POST", performanceStatus(data))
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
