import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i < 0 ? fallback : args[i + 1]
}
const out = resolve(option("--out", ".artifacts/release-media"))
const pid = Number(option("--pid"))
const port = Number(option("--port", "9237"))
const expectedSpace = resolve(option("--space", out + "/Release Demo"))
if (
  process.platform !== "darwin" ||
  !Number.isInteger(pid) ||
  pid < 1 ||
  !Number.isInteger(port)
)
  throw new Error("macOS and --pid are required")
await mkdir(out, { recursive: true })
const run = (file, argv) =>
  execFileSync(file, argv.map(String), {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, EIDOS_MEDIA_TARGET_PID: String(pid) },
  }).trim()
const executable = run("ps", ["-p", pid, "-o", "command="])
if (
  !executable.startsWith(root + "/node_modules/") ||
  !executable.includes("/Electron.app/Contents/MacOS/Electron ")
)
  throw new Error("PID does not belong to this checkout's Electron")
const listener = run("lsof", ["-nP", "-t", "-iTCP:5179", "-sTCP:LISTEN"]).split(
  "\n"
)[0]
if (
  !run("lsof", ["-a", "-p", listener, "-d", "cwd", "-Fn"]).includes(
    "n" + root + "/apps/eidos-lite-desktop"
  )
)
  throw new Error("5179 is owned by another checkout")
const native = resolve(out, "native-input")
const recorder = resolve(out, "record-desktop")
run("swiftc", [
  root + "/scripts/release-media/native-input.swift",
  "-o",
  native,
])
run("swiftc", [
  "-parse-as-library",
  root + "/scripts/release-media/record-desktop.swift",
  "-o",
  recorder,
])
const info = JSON.parse(run(native, ["info", pid]))
if (!info.screenCapture || !info.accessibility)
  throw new Error("Screen Recording and Accessibility permissions are required")
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find(
  (t) =>
    t.type === "page" &&
    t.url.startsWith("http://localhost:5179/") &&
    t.url.includes("/files/Projects.eidos")
)
if (!target)
  throw new Error(
    "Open synthetic Release Demo/Projects.eidos in this checkout first"
  )
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((done, reject) => {
  ws.addEventListener("open", done, { once: true })
  ws.addEventListener("error", reject, { once: true })
})
let requestId = 0
const pending = new Map()
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data)
  const item = pending.get(message.id)
  if (!item) return
  pending.delete(message.id)
  clearTimeout(item.timer)
  message.error
    ? item.reject(new Error(message.error.message))
    : item.done(message.result)
})
function cdp(method, params = {}) {
  return new Promise((done, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error("CDP timeout: " + method))
    }, 10_000)
    pending.set(id, { done, reject, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(fn, value) {
  const result = await cdp("Runtime.evaluate", {
    expression: `(${fn.toString()})(${JSON.stringify(value) ?? "undefined"})`,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const assertions = []
async function expect(name, fn) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    if (await evaluate(fn)) {
      assertions.push({ name, passed: true, at: Date.now() })
      return
    }
    await sleep(100)
  }
  throw new Error("Assertion failed: " + name)
}
let recording
let recordingDone
try {
  const space = await evaluate(async () => window.eidosLite.getSpace())
  const spacePaths = [
    space?.rootPath,
    space?.path,
    space?.canonical?.displayPath,
    space?.displayPath,
  ].filter(Boolean)
  if (!spacePaths.includes(expectedSpace)) {
    await writeFile(
      out + "/space-preflight.json",
      JSON.stringify(space, null, 2)
    )
    throw new Error(
      "Space identity did not match --space; inspect local space-preflight.json"
    )
  }
  run(native, ["bounds", pid, 350, 130, 1200, 820, "Release Demo — Eidos Lite"])
  const window = JSON.parse(run(native, ["info", pid])).windows.find(
    (w) => w.title === "Release Demo — Eidos Lite"
  )
  if (!window) throw new Error("Demo window unavailable")
  const b = window.bounds
  const rect = {
    x: b.X - 32,
    y: b.Y - 32,
    width: b.Width + 64,
    height: b.Height + 64,
  }
  const viewport = await evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scale: devicePixelRatio,
  }))
  if (
    Math.abs(viewport.width - b.Width) > 1 ||
    Math.abs(viewport.height - b.Height) > 1
  )
    throw new Error("Unexpected native/content coordinate mapping")
  if (await evaluate(() => !!document.querySelector('input[type="search"]')))
    run(native, ["key", 53])
  const beforeFixture = createHash("sha256")
    .update(await readFile(expectedSpace + "/Projects.eidos"))
    .digest("hex")
  await expect(
    "Projects grid ready",
    () =>
      (document
        .querySelector('canvas[data-testid="data-grid-canvas"]')
        ?.getBoundingClientRect().width ?? 0) > 0
  )
  const grid = await evaluate(() => {
    const r = document
      .querySelector('canvas[data-testid="data-grid-canvas"]')
      .getBoundingClientRect()
    return { x: r.x + 140, y: r.y + 54 }
  })
  run(native, ["click", b.X + grid.x, b.Y + grid.y])
  await expect(
    "search initially closed",
    () => !document.querySelector('input[type="search"]')
  )
  const search = await evaluate(() => {
    const r = document
      .querySelector('button[aria-label="Search Eidos File rows"]')
      .getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  run(native, ["move", b.X + 530, b.Y + 300])
  const source = out + "/source-" + Date.now() + ".mp4"
  recording = spawn(
    recorder,
    [
      pid,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      16,
      viewport.scale,
      source,
    ].map(String),
    { stdio: ["ignore", "pipe", "pipe"] }
  )
  let stderr = ""
  recording.stderr.on("data", (data) => {
    stderr += data.toString()
  })
  recordingDone = new Promise((done, reject) => {
    recording.once("error", reject)
    recording.once("exit", (code) =>
      code === 0
        ? done()
        : reject(new Error("Native recording failed: " + stderr))
    )
  })
  await new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Recording did not start")),
      10_000
    )
    recording.stdout.on("data", (data) => {
      if (data.toString().includes("RECORDING_STARTED")) {
        clearTimeout(timer)
        done()
      }
    })
    recording.once("exit", () => {
      clearTimeout(timer)
      reject(new Error(stderr || "Recorder exited before first frame"))
    })
  })
  const startedAt = Date.now()
  run(native, ["activate", pid])
  await sleep(1000)
  run(native, ["click", b.X + search.x, b.Y + search.y])
  await expect("search owns focus", () =>
    document.activeElement?.matches('input[type="search"]')
  )
  run(native, ["key", 0, "command"])
  run(native, ["type", "Project 2048"])
  await expect(
    "Project 2048 query has one real UI match",
    () =>
      document.querySelector('input[type="search"]')?.value ===
        "Project 2048" &&
      document
        .querySelector(".eidos-file-workbar-search")
        ?.textContent.trim() === "1 of 1"
  )
  await sleep(1800)
  const posterSeconds = (Date.now() - startedAt) / 1000 - 0.6
  run(native, ["key", 53])
  await expect(
    "Escape returns focus to grid",
    () =>
      !document.querySelector('input[type="search"]') &&
      document.activeElement?.tagName === "CANVAS"
  )
  run(native, ["key", 125])
  await expect(
    "arrow key keeps grid keyboard focus",
    () => document.activeElement?.tagName === "CANVAS"
  )
  await sleep(1200)
  run(native, ["key", 3, "command"])
  await expect("search reopens from keyboard", () =>
    document.activeElement?.matches('input[type="search"]')
  )
  run(native, ["key", 0, "command"])
  run(native, ["type", "Project 512"])
  await expect(
    "Project 512 query has one real UI match",
    () =>
      document.querySelector('input[type="search"]')?.value === "Project 512" &&
      document
        .querySelector(".eidos-file-workbar-search")
        ?.textContent.trim() === "1 of 1"
  )
  await sleep(1800)
  run(native, ["key", 53])
  await expect(
    "repeated Escape restores grid focus",
    () =>
      !document.querySelector('input[type="search"]') &&
      document.activeElement?.tagName === "CANVAS"
  )
  await recordingDone
  const afterFixture = createHash("sha256")
    .update(await readFile(expectedSpace + "/Projects.eidos"))
    .digest("hex")
  if (beforeFixture !== afterFixture)
    throw new Error("Read-only scenario changed fixture bytes")
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    21,
    "-preset",
    "medium",
    "-pix_fmt",
    "yuv420p",
    "-r",
    30,
    "-movflags",
    "+faststart",
    out + "/demo.mp4",
  ])
  run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    posterSeconds,
    "-i",
    out + "/demo.mp4",
    "-frames:v",
    1,
    "-c:v",
    "libwebp",
    "-quality",
    88,
    out + "/poster.webp",
  ])
  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      out + "/demo.mp4",
    ])
  )
  const stream = probe.streams.find((s) => s.codec_type === "video")
  const manifest = {
    schemaVersion: 1,
    scenarioId: "table-search-escape",
    scenarioRevision: 2,
    dataOrigin: "synthetic",
    introducedInRelease: "lite-v0.31.0",
    capturedAppVersion: "0.31.1",
    buildKind: "development",
    sourceCommit: run("git", ["rev-parse", "HEAD"]),
    toolingChanges: run("git", ["status", "--short"]),
    sharedUiTreeAtIntroducedTag: run("git", [
      "rev-parse",
      "lite-v0.31.0:packages/eidos-file-ui",
    ]),
    sharedUiTreeAtCaptureTag: run("git", [
      "rev-parse",
      "lite-v0.31.1:packages/eidos-file-ui",
    ]),
    fixtureSha256: beforeFixture,
    fixtureUnchanged: true,
    source,
    recordedAt: new Date().toISOString(),
    appPid: pid,
    url: target.url,
    locale: "en",
    theme: "light",
    nativeWindow: b,
    capture: {
      ...rect,
      padding: 32,
      scale: viewport.scale,
      widthPixels: stream.width,
      heightPixels: stream.height,
      fps: 30,
      recorder: "ScreenCaptureKit",
      filter: "SCContentFilter(display:excludingWindows:)",
      cursor: "native CGEvent + showsCursor",
      exclusions:
        "Other applications' on-screen windows present at capture start excluded individually; target application and desktop application windows retained",
      exclusionLimit:
        "Initial window snapshot only; new windows, target-app dialogs and desktop content require full-video privacy review",
      nativeWindowControls: "Real macOS traffic lights; no synthetic overlay",
      speed: 1,
      audio: false,
    },
    duration: Number(probe.format.duration),
    posterSeconds,
    assertions,
    output: {
      width: stream.width,
      height: stream.height,
      duration: Number(probe.format.duration),
    },
    editorialReview: "pending",
  }
  await writeFile(
    out + "/source.manifest.json",
    JSON.stringify(manifest, null, 2) + "\n"
  )
  console.log(
    JSON.stringify(
      {
        video: out + "/demo.mp4",
        poster: out + "/poster.webp",
        assertions: assertions.length,
        duration: manifest.duration,
        output: manifest.output,
      },
      null,
      2
    )
  )
} finally {
  if (recording && recording.exitCode === null) {
    recording.kill("SIGTERM")
    await recordingDone?.catch(() => {})
  }
  ws.close()
}
