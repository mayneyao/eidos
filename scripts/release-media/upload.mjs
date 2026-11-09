import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
export async function inspectExistingObject(
  config,
  file,
  token,
  fetchImpl = fetch
) {
  // Probe the authenticated object API, never the CDN: a public 404 can be cached
  // before the first upload and hide the newly created video for hours.
  const previous = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucket}/objects/${encodeURIComponent(file.key)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (previous.status === 404) {
    await previous.body?.cancel()
    return false
  }
  if (!previous.ok) {
    await previous.body?.cancel()
    throw new Error(
      `Authenticated object preflight failed (${previous.status}); no upload attempted`
    )
  }
  if (
    Number(previous.headers.get("content-length")) > 50 * 1024 * 1024 ||
    hash(Buffer.from(await previous.arrayBuffer())) !== file.sha256
  )
    throw new Error(
      "Immutable object already contains different content: " + file.key
    )
  return true
}
export function validateSourceManifest(source) {
  if (
    source.schemaVersion !== 1 ||
    source.dataOrigin !== "synthetic" ||
    source.fixtureUnchanged !== true
  )
    throw new Error("Only a verified synthetic-data capture may be published")
  if (source.editorialReview !== "approved")
    throw new Error(
      "Review video and poster, then set editorialReview to approved in the local source manifest"
    )
  if (
    !source.assertions?.length ||
    source.assertions.some((a) => a.passed !== true)
  )
    throw new Error("All scenario assertions must pass")
  if (
    !/^lite-v\d+\.\d+\.\d+$/.test(source.introducedInRelease) ||
    !/^[a-z0-9-]+$/.test(source.scenarioId) ||
    !/^[a-f0-9]{40}$/.test(source.sourceCommit)
  )
    throw new Error("Invalid release/scenario/source identity")
  if (
    !/^\d+\.\d+\.\d+$/.test(source.capturedAppVersion) ||
    !["development", "packaged"].includes(source.buildKind)
  )
    throw new Error("Capture build identity is required")
}
export function resolveMediaCopy(source, copy) {
  if (copy !== undefined) {
    for (const key of [
      "releaseTag",
      "scenarioId",
      "capturedAppVersion",
      "buildKind",
    ]) {
      const expected =
        key === "releaseTag" ? source.introducedInRelease : source[key]
      if (copy?.[key] !== expected)
        throw new Error("Media copy does not match capture " + key)
    }
    const result = {}
    for (const field of ["feature", "alt", "caption"]) {
      result[field] = {}
      for (const locale of ["en", "zh", "ja", "ko"]) {
        const value = copy[field]?.[locale]
        if (typeof value !== "string" || !value.trim())
          throw new Error(`Media copy requires ${field}.${locale}`)
        result[field][locale] = value
      }
    }
    return result
  }
  if (
    source.scenarioId !== "table-search-escape" ||
    source.introducedInRelease !== "lite-v0.31.0"
  )
    throw new Error("Provide --copy-file for this release scenario")
  return {
    feature: {
      en: "Keep working after table search",
      zh: "搜索后继续使用网格",
    },
    alt: {
      en: "Find a project, press Escape to return to the grid, and search again with the keyboard",
      zh: "搜索项目，按 Esc 返回网格，再用键盘再次搜索",
    },
    caption: {
      en: `Recorded in Eidos Lite ${source.capturedAppVersion} on macOS using synthetic data. Demonstrates the search focus improvement introduced in 0.31.0.`,
      zh: `演示录制于 macOS 上的 Eidos Lite ${source.capturedAppVersion}，使用合成数据，展示 0.31.0 引入的搜索焦点改进。`,
    },
  }
}
export async function publish(directory, options = {}) {
  const config = JSON.parse(
    await readFile(root + "/scripts/release-media/config.json", "utf8")
  )
  const source = JSON.parse(
    await readFile(resolve(directory, "source.manifest.json"), "utf8")
  )
  validateSourceManifest(source)
  const copy = resolveMediaCopy(
    source,
    options.copyFile
      ? JSON.parse(await readFile(options.copyFile, "utf8"))
      : undefined
  )
  const video = await readFile(resolve(directory, "demo.mp4"))
  const poster = await readFile(resolve(directory, "poster.webp"))
  if (
    video.length > 50 * 1024 * 1024 ||
    video.length < 1000 ||
    poster.length < 100 ||
    poster.subarray(0, 4).toString() !== "RIFF" ||
    poster.subarray(8, 12).toString() !== "WEBP"
  )
    throw new Error("Invalid or oversized media")
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        resolve(directory, "demo.mp4"),
      ],
      { encoding: "utf8" }
    )
  )
  const stream = probe.streams.find((s) => s.codec_type === "video")
  if (
    !stream ||
    stream.codec_name !== "h264" ||
    probe.streams.some((s) => s.codec_type === "audio") ||
    Number(probe.format.duration) > 60 ||
    stream.width !== source.output.width ||
    stream.height !== source.output.height ||
    Math.abs(Number(probe.format.duration) - source.output.duration) > 0.1
  )
    throw new Error("Video does not match the reviewed source manifest")
  const sha = hash(video)
  const posterSha = hash(poster)
  if (
    source.reviewedFiles?.["demo.mp4"] !== sha ||
    source.reviewedFiles?.["poster.webp"] !== posterSha
  )
    throw new Error(
      "Media changed after review; review the new files before uploading"
    )
  const bundleHash = hash(
    JSON.stringify({
      video: sha,
      poster: posterSha,
      sourceCommit: source.sourceCommit,
      scenarioRevision: source.scenarioRevision,
    })
  )
  const prefix = `releases/lite/${source.introducedInRelease.slice(6)}/${source.scenarioId}/${bundleHash}`
  const files = [
    { file: "demo.mp4", type: "video/mp4", bytes: video, sha256: sha },
    {
      file: "poster.webp",
      type: "image/webp",
      bytes: poster,
      sha256: posterSha,
    },
  ].map((file) => ({
    ...file,
    key: `${prefix}/${file.file}`,
    url: `${config.publicOrigin}/${prefix}/${file.file}`,
  }))
  const media = {
    type: "video",
    src: files[0].url,
    poster: files[1].url,
    width: stream.width,
    height: stream.height,
    duration: Number(probe.format.duration),
    ...copy,
  }
  const result = {
    schemaVersion: 1,
    releaseTag: source.introducedInRelease,
    capturedAppVersion: source.capturedAppVersion,
    sourceCommit: source.sourceCommit,
    scenarioId: source.scenarioId,
    media,
    files: files.map(({ bytes, ...file }) => ({ ...file, size: bytes.length })),
    uploaded: false,
  }
  if (!options.upload) {
    console.log(JSON.stringify({ mode: "dry-run", ...result }, null, 2))
    return result
  }
  let credentials = { ...process.env }
  if (options.credentialsFile)
    credentials = {
      ...parseEnv(await readFile(options.credentialsFile, "utf8")),
      ...credentials,
    }
  const token =
    credentials.CLOUDFLARE_R2_API_TOKEN ?? credentials.CLOUDFLARE_API_TOKEN
  if (!token)
    throw new Error(
      "Provide CLOUDFLARE_R2_API_TOKEN or --credentials-file; credentials are never saved to artifacts"
    )
  if (
    credentials.CLOUDFLARE_ACCOUNT_ID &&
    credentials.CLOUDFLARE_ACCOUNT_ID !== config.accountId
  )
    throw new Error(
      "Credential account does not match the configured media account"
    )
  const wrangler =
    options.wrangler ??
    root + "/apps/download/node_modules/wrangler/bin/wrangler.js"
  await stat(wrangler)
  const wranglerConfig = resolve(directory, "upload.wrangler.json")
  await writeFile(
    wranglerConfig,
    JSON.stringify({
      name: "eidos-release-media-upload",
      account_id: config.accountId,
      compatibility_date: "2026-11-06",
    }) + "\n"
  )
  const checks = []
  for (const file of files) {
    if (!(await inspectExistingObject(config, file, token))) {
      execFileSync(
        process.execPath,
        [
          wrangler,
          "--config",
          wranglerConfig,
          "r2",
          "object",
          "put",
          `${config.bucket}/${file.key}`,
          "--remote",
          "--file",
          resolve(directory, file.file),
          "--content-type",
          file.type,
          "--cache-control",
          config.cacheControl,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: token,
            CLOUDFLARE_ACCOUNT_ID: config.accountId,
            WRANGLER_SEND_METRICS: "false",
          },
          stdio: "inherit",
          timeout: 120_000,
        }
      )
    }
    // Public read-back verifies exact bytes; errors never expose credential values.
    const response = await fetch(file.url, {
      headers: { Origin: "https://staging.eidos.space" },
      signal: AbortSignal.timeout(20_000),
    })
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith(file.type) ||
      hash(Buffer.from(await response.arrayBuffer())) !== file.sha256
    )
      throw new Error("Public media read-back failed: " + file.key)
    if (!response.headers.get("cache-control")?.includes("immutable"))
      throw new Error("Immutable cache header missing")
    checks.push({
      url: file.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
      cors: response.headers.get("access-control-allow-origin"),
      sha256: file.sha256,
    })
  }
  const range = await fetch(files[0].url, {
    headers: { Range: "bytes=0-511" },
    signal: AbortSignal.timeout(15_000),
  })
  if (
    range.status !== 206 ||
    !range.headers.get("content-range")?.startsWith("bytes 0-511/") ||
    Buffer.from(await range.arrayBuffer()).length !== 512
  )
    throw new Error("Video Range playback check failed")
  result.uploaded = true
  result.verifiedAt = new Date().toISOString()
  result.checks = {
    files: checks,
    range: {
      status: range.status,
      contentRange: range.headers.get("content-range"),
    },
  }
  await writeFile(
    resolve(directory, "published-media.json"),
    JSON.stringify(result, null, 2) + "\n"
  )
  console.log(JSON.stringify(result, null, 2))
  return result
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  const value = (name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined
  const directory = value("--dir")
  if (!directory)
    throw new Error(
      "Usage: node scripts/release-media/upload.mjs --dir <reviewed-capture> [--copy-file <localized-copy.json>] [--upload] [--credentials-file <ignored-env-file>]"
    )
  await publish(resolve(directory), {
    upload: args.includes("--upload"),
    credentialsFile: value("--credentials-file"),
    copyFile: value("--copy-file"),
    wrangler: value("--wrangler"),
  })
}
