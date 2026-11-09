import { spawn, execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  CAPTURE_PROFILE as profile,
  parseInputTimeline,
  buildShortcutIntervals,
  shortcutVideoFilter,
  validateVideoProfile,
} from "./capture-profile.mjs"
import {
  options,
  readJson,
  hashFile,
  snapshotFiles,
  sameFiles,
  within,
} from "./iteration-utils.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = options(process.argv.slice(2), {
  "--repo": "value",
  "--fixture": "value",
  "--scenario": "value",
  "--scenes": "value",
  "--expected-sha": "value",
  "--pid": "value",
  "--port": "value",
  "--out": "value",
  "--plugin-receipt": "value",
  "--validate-only": "boolean",
  "--help": "boolean",
})
const scenesPath = resolve(args["--scenes"] ?? here + "/iteration-scenes.json")
const allowedOps = new Set([
  "click",
  "key",
  "type",
  "expect",
  "measure",
  "dwell",
  "poster",
])
function validateScene(scene) {
  if (
    !/^[a-z][a-z0-9-]+$/.test(scene.id) ||
    !Array.isArray(scene.steps) ||
    !Number.isInteger(scene.durationSeconds) ||
    scene.durationSeconds < 5 ||
    scene.durationSeconds > 55
  )
    throw Error("Invalid scene identity/duration")
  for (const step of [...(scene.initial ?? []), ...scene.steps]) {
    if (!allowedOps.has(step.op)) throw Error("Unknown operation: " + step.op)
    if (step.op === "expect" && (!step.name || !step.condition))
      throw Error("Expect needs name and condition")
    if (step.target && typeof step.target.selector !== "string")
      throw Error("Target needs selector")
    if (
      step.op === "key" &&
      (!Number.isInteger(step.code) ||
        step.code < 0 ||
        step.code > 127 ||
        (step.modifiers &&
          !["command", "shift", "command+shift"].includes(step.modifiers)))
    )
      throw Error("Invalid native key")
    if (
      step.shortcutLabel !== undefined &&
      (step.op !== "key" ||
        typeof step.shortcutLabel !== "string" ||
        !step.shortcutLabel.trim() ||
        /[\r\n]/.test(step.shortcutLabel))
    )
      throw Error("Shortcut labels must belong to a key and fit one line")
    if (
      step.op === "dwell" &&
      (!Number.isInteger(step.ms) || step.ms < 0 || step.ms > 5000)
    )
      throw Error("Dwell is bounded editorial pacing, not a condition wait")
  }
}
if (args["--help"]) {
  console.log(
    "node capture-iteration.mjs --repo <candidate> --expected-sha <full-sha> --fixture <private-json> --scenario <id> --pid <electron-pid> --out <new-take-directory> [--plugin-receipt <json>]\nUse --validate-only to inspect scene definitions without UI."
  )
} else {
  const catalog = await readJson(scenesPath)
  for (const scene of catalog.scenes) validateScene(scene)
  if (args["--validate-only"]) {
    console.log(
      JSON.stringify({
        valid: true,
        scenes: catalog.scenes.map((s) => ({
          id: s.id,
          steps: s.steps.length,
          durationSeconds: s.durationSeconds,
          shortcutLabels: s.steps.filter((step) => step.shortcutLabel).length,
        })),
        runtimeVerified: false,
      })
    )
  } else {
    await capture(catalog)
  }
}

async function capture(catalog) {
  const root = resolve(args["--repo"] ?? "")
  const expectedSha = args["--expected-sha"]
  const pid = Number(args["--pid"])
  const port = Number(args["--port"] ?? "9237")
  if (
    process.platform !== "darwin" ||
    !args["--repo"] ||
    !args["--fixture"] ||
    !args["--out"] ||
    !/^[a-f0-9]{40}$/.test(expectedSha ?? "") ||
    !Number.isInteger(pid) ||
    pid < 1 ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw Error(
      "macOS, exact candidate SHA, repo, fixture, PID, out and valid explicit port are required"
    )
  if (!within(root, fileURLToPath(import.meta.url)))
    throw Error(
      "Recording is allowed only after these tools are committed inside the handed-off candidate"
    )
  let recordingClock = null
  const run = (file, argv, shortcutLabel) => {
    const env = { ...process.env, EIDOS_MEDIA_TARGET_PID: String(pid) }
    delete env.EIDOS_MEDIA_INPUT_TIMELINE
    delete env.EIDOS_MEDIA_RECORDING_START_NS
    delete env.EIDOS_MEDIA_KEY_LABEL
    if (
      recordingClock &&
      file === native &&
      ["key", "type"].includes(argv[0])
    ) {
      env.EIDOS_MEDIA_INPUT_TIMELINE = rawTimelinePath
      env.EIDOS_MEDIA_RECORDING_START_NS = recordingClock.monotonicNs
      if (argv[0] === "key" && shortcutLabel)
        env.EIDOS_MEDIA_KEY_LABEL = shortcutLabel
    }
    return execFileSync(file, argv.map(String), {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  }
  const git = (...argv) => run("git", argv)
  const checkSource = () => {
    if (
      git("rev-parse", "HEAD") !== expectedSha ||
      git("status", "--porcelain") !== ""
    )
      throw Error(
        "Candidate must match the handoff SHA and have a clean working tree"
      )
  }
  checkSource()
  git(
    "ls-files",
    "--error-unmatch",
    relative(root, fileURLToPath(import.meta.url))
  )
  for (const task of ["task2", "task3"]) {
    const commit = catalog.featureSourceCommits?.[task]
    if (!/^[a-f0-9]{40}$/.test(commit ?? ""))
      throw Error("Final feature source SHA is missing: " + task)
    git("merge-base", "--is-ancestor", commit, expectedSha)
  }
  const scene = catalog.scenes.find((item) => item.id === args["--scenario"])
  if (!scene) throw Error("Unknown scenario")
  const fixturePath = resolve(args["--fixture"])
  const fixture = await readJson(fixturePath)
  if (
    fixture.dataOrigin !== "synthetic" ||
    !fixture.files?.length ||
    !fixture.space ||
    !fixture.profile ||
    !fixture.eidosHome
  )
    throw Error(
      "Expected prepared synthetic fixture with isolated profile and Eidos home"
    )
  const currentLocalDate = new Date()
  if (
    fixture.anchorLocalDate !==
      [
        currentLocalDate.getFullYear(),
        currentLocalDate.getMonth() + 1,
        currentLocalDate.getDate(),
      ].join("-") ||
    fixture.systemTimeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone
  )
    throw Error(
      "Fixture date/timezone changed; prepare a fresh case instead of changing an existing take"
    )
  const before = await snapshotFiles(
    fixture.space,
    fixture.files.map((f) => f.path)
  )
  if (!sameFiles(fixture.files, before))
    throw Error("Fixture bytes or mtimes differ from preparation")
  const plugin = args["--plugin-receipt"]
    ? await readJson(args["--plugin-receipt"])
    : null
  if (scene.requiresPlugin) {
    if (
      !plugin ||
      plugin.plugin?.id !== scene.requiresPlugin ||
      !/^[a-f0-9]{40}$/.test(plugin.packagingHostCommit ?? "") ||
      !plugin.package?.path ||
      (await hashFile(plugin.package.path)) !== plugin.package.sha256
    )
      throw Error(
        "This scene needs a traced plugin package receipt with matching archive hash"
      )
    git("merge-base", "--is-ancestor", plugin.packagingHostCommit, expectedSha)
  }
  const executable = run("ps", ["-p", pid, "-o", "command="])
  if (
    !executable.startsWith(root + "/node_modules/") ||
    !executable.includes("/Electron.app/Contents/MacOS/Electron ")
  )
    throw Error("PID does not belong to the candidate checkout Electron")
  const listeners = [
    ...new Set(
      run("lsof", ["-nP", "-t", "-iTCP:5179", "-sTCP:LISTEN"]).split("\n")
    ),
  ]
  if (
    listeners.length !== 1 ||
    !run("lsof", ["-a", "-p", listeners[0], "-d", "cwd", "-Fn"])
      .split("\n")
      .includes("n" + root + "/apps/eidos-lite-desktop")
  )
    throw Error("5179 does not belong uniquely to the candidate checkout")
  const debugPids = run("lsof", [
    "-nP",
    "-t",
    "-iTCP:" + port,
    "-sTCP:LISTEN",
  ]).split("\n")
  if (!debugPids.includes(String(pid)))
    throw Error("CDP port is not owned by the specified Electron PID")
  const out = resolve(args["--out"])
  await mkdir(out, { recursive: true })
  await writeFile(out + "/capture.lock", new Date().toISOString() + "\n", {
    flag: "wx",
  })
  const nativePath = here + "/native-input.swift"
  const recorderPath = here + "/record-desktop.swift"
  const native = out + "/native-input"
  const recorder = out + "/record-desktop"
  const rawTimelinePath = out + "/key-events.jsonl"
  const timelinePath = out + "/input-timeline.json"
  run("swiftc", [nativePath, "-o", native])
  run("swiftc", ["-parse-as-library", recorderPath, "-o", recorder])
  const info = JSON.parse(run(native, ["info", pid]))
  if (!info.screenCapture || !info.accessibility)
    throw Error("Screen Recording and Accessibility are required")
  const targets = await (
    await fetch("http://127.0.0.1:" + port + "/json/list")
  ).json()
  const pages = targets.filter(
    (t) => t.type === "page" && t.url.startsWith("http://localhost:5179/")
  )
  if (pages.length !== 1)
    throw Error("Expected exactly one localhost:5179 app page")
  const page = pages[0]
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, reject) => {
    ws.addEventListener("open", done, { once: true })
    ws.addEventListener("error", reject, { once: true })
  })
  let serial = 0
  const pending = new Map()
  const contexts = new Map()
  const sessionErrors = []
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      message.error
        ? request.reject(Error(message.error.message))
        : request.done(message.result)
    } else if (message.method === "Runtime.executionContextCreated") {
      const context = message.params.context
      if (context.auxData?.isDefault)
        contexts.set((message.sessionId ?? "") + ":" + context.id, {
          id: context.id,
          sessionId: message.sessionId,
        })
    } else if (message.method === "Runtime.executionContextDestroyed") {
      contexts.delete(
        (message.sessionId ?? "") + ":" + message.params.executionContextId
      )
    } else if (message.method === "Runtime.executionContextsCleared") {
      for (const [key, context] of contexts)
        if (context.sessionId === message.sessionId) contexts.delete(key)
    } else if (message.method === "Target.attachedToTarget") {
      const sessionId = message.params.sessionId
      void cdp("Runtime.enable", {}, sessionId).catch((error) =>
        sessionErrors.push(String(error))
      )
    } else if (message.method === "Target.detachedFromTarget") {
      for (const [key, context] of contexts)
        if (context.sessionId === message.params.sessionId) contexts.delete(key)
    }
  })
  function cdp(method, params = {}, sessionId) {
    // This adapter deliberately has no CDP Input or application-mutation method.
    if (
      !["Runtime.evaluate", "Runtime.enable", "Target.setAutoAttach"].includes(
        method
      )
    )
      throw Error("CDP method is outside the read-only adapter")
    return new Promise((done, reject) => {
      const id = ++serial
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(Error("CDP timeout: " + method))
      }, 5000)
      pending.set(id, { done, reject, timer })
      ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      )
    })
  }
  async function evaluate(fn, value, context) {
    const response = await cdp(
      "Runtime.evaluate",
      {
        expression:
          "(" + fn.toString() + ")(" + JSON.stringify(value ?? null) + ")",
        returnByValue: true,
        awaitPromise: true,
        ...(context ? { contextId: context.id } : {}),
      },
      context?.sessionId
    )
    if (response.exceptionDetails) throw Error(response.exceptionDetails.text)
    return response.result.value
  }
  // All browser-evaluated functions below only read real DOM or read-only host accessors.
  const readNodes = (target) => {
    const nodes = [...document.querySelectorAll(target.selector)]
      .filter((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim()
        return (
          (target.text === undefined || text === target.text) &&
          (target.textIncludes === undefined ||
            text.includes(target.textIncludes))
        )
      })
      .map((node) => {
        const r = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        const visible =
          r.width > 0 &&
          r.height > 0 &&
          r.right > 0 &&
          r.bottom > 0 &&
          r.x < innerWidth &&
          r.y < innerHeight &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !node.closest("[hidden],[aria-hidden=true],[inert]")
        return {
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim(),
          value: "value" in node ? node.value : null,
          attrs: Object.fromEntries(
            [...node.attributes].map((a) => [a.name, a.value])
          ),
          visible,
          focused: document.activeElement === node,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        }
      })
    const highlights = globalThis.CSS?.highlights
      ? [...CSS.highlights].flatMap(([name, ranges]) =>
          [...ranges].map((range) => {
            const r =
              typeof range.getBoundingClientRect === "function"
                ? range.getBoundingClientRect()
                : { width: 0, height: 0, bottom: 0, y: 0 }
            return {
              name,
              text: range.toString(),
              visible:
                r.width > 0 &&
                r.height > 0 &&
                r.bottom > 0 &&
                r.y < innerHeight,
            }
          })
        )
      : []
    return {
      nodes: target.includeHidden ? nodes : nodes.filter((n) => n.visible),
      url: location.href,
      highlights,
      selection: getSelection()?.toString() ?? "",
    }
  }
  async function readTarget(target) {
    if (!target.contextProbe) return evaluate(readNodes, target)
    const matches = []
    for (const context of [...contexts.values()]) {
      try {
        const probe = await evaluate(
          readNodes,
          { selector: target.contextProbe },
          context
        )
        if (probe.nodes.length) matches.push(context)
      } catch {
        /* A disposed iframe context is retried on the next semantic wait. */
      }
    }
    if (matches.length !== 1)
      throw Error("Plugin context is not unique or not ready")
    return evaluate(readNodes, target, matches[0])
  }
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
  const assertions = []
  const measures = {}
  let startedAt
  let posterSeconds
  let recording
  let recordingDone
  let source
  let nativeWindow
  let viewport
  let rect
  let recordingStarted = false
  async function assertStep(step) {
    const end = Date.now() + 6000
    let last
    while (Date.now() < end) {
      try {
        const state = step.target
          ? await readTarget(step.target)
          : { nodes: [], url: await evaluate(() => location.href) }
        const c = step.condition
        const node = state.nodes[0]
        const has = (key) => Object.hasOwn(c, key)
        let pass =
          (!has("present") || state.nodes.length > 0 === c.present) &&
          (!has("count") || state.nodes.length === c.count) &&
          (!has("textIncludes") || !!node?.text.includes(c.textIncludes)) &&
          (!has("textEquals") || node?.text === c.textEquals) &&
          (!has("value") || node?.value === c.value) &&
          (!has("highlightIncludes") ||
            state.highlights?.some(
              (h) => h.visible && h.text.includes(c.highlightIncludes)
            )) &&
          (!has("focused") || node?.focused === c.focused) &&
          (!has("urlIncludes") ||
            decodeURIComponent(state.url).includes(c.urlIncludes)) &&
          (!has("attributes") ||
            (!!node &&
              Object.entries(c.attributes).every(
                ([key, value]) => node.attrs[key] === value
              )))
        if (c.rectEqualTo) {
          const previous = measures[c.rectEqualTo]
          pass &&=
            !!node &&
            !!previous &&
            (c.rectKeys ?? ["height"]).every(
              (key) =>
                Math.abs(node.rect[key] - previous[key]) <= (c.tolerancePx ?? 1)
            )
        }
        last = state
        if (pass) {
          assertions.push({
            name: step.name,
            passed: true,
            at: new Date().toISOString(),
            observed: state,
          })
          return
        }
      } catch (error) {
        last = { error: String(error) }
      }
      await sleep(100)
    }
    throw Error("Assertion failed: " + step.name + "; " + JSON.stringify(last))
  }
  async function action(step) {
    if (
      recordingStarted &&
      Date.now() - startedAt >= (scene.durationSeconds - 1) * 1000
    )
      throw Error("Scene exceeded capture budget; take rejected")
    if (step.op === "expect") return assertStep(step)
    if (step.op === "measure") {
      const state = await readTarget(step.target)
      if (state.nodes.length !== 1)
        throw Error("Measurement target is not unique")
      measures[step.name] = state.nodes[0].rect
    } else if (step.op === "key") {
      run(
        native,
        ["key", step.code, ...(step.modifiers ? [step.modifiers] : [])],
        step.shortcutLabel
      )
    } else if (step.op === "type") {
      if (step.target) {
        await action({ op: "click", target: step.target })
        run(native, ["key", 0, "command"])
      }
      run(native, ["type", step.text])
    } else if (step.op === "click") {
      const state = await readTarget(step.target)
      if (state.nodes.length !== 1)
        throw Error(
          "Click target is not unique: " + JSON.stringify(step.target)
        )
      const r = state.nodes[0].rect
      let x = r.x + r.width / 2
      let y = r.y + r.height / 2
      if (step.target.contextProbe) {
        if (!step.target.frameSelector)
          throw Error("Plugin click needs the visible owning iframe selector")
        const frame = await readTarget({ selector: step.target.frameSelector })
        if (frame.nodes.length !== 1)
          throw Error("Owning plugin iframe is not unique")
        x += frame.nodes[0].rect.x
        y += frame.nodes[0].rect.y
      }
      if (x < 0 || x > viewport.width || y < 0 || y > viewport.height)
        throw Error("Click target outside native content")
      run(native, ["click", nativeWindow.X + x, nativeWindow.Y + y])
    } else if (step.op === "dwell") await sleep(step.ms)
    else if (step.op === "poster")
      posterSeconds = (Date.now() - startedAt) / 1000
  }
  try {
    await cdp("Runtime.enable")
    await cdp("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    })
    const space = await evaluate(async () => window.eidosLite.getSpace())
    const paths = [
      space?.rootPath,
      space?.path,
      space?.canonical?.displayPath,
      space?.displayPath,
    ]
    if (!paths.includes(fixture.space))
      throw Error("The opened Space is not the exact synthetic fixture")
    const title = "Release Demo — Eidos Lite"
    run(native, [
      "bounds",
      pid,
      350,
      130,
      profile.windowWidth,
      profile.windowHeight,
      title,
    ])
    const windows = JSON.parse(run(native, ["info", pid])).windows.filter(
      (w) => w.title === title
    )
    if (windows.length !== 1)
      throw Error("Synthetic native window is not unique")
    nativeWindow = windows[0].bounds
    if (
      nativeWindow.Width !== profile.windowWidth ||
      nativeWindow.Height !== profile.windowHeight
    )
      throw Error("Could not obtain the standard 1200×820-point window")
    viewport = await evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scale: devicePixelRatio,
    }))
    if (
      Math.abs(viewport.width - nativeWindow.Width) > 1 ||
      Math.abs(viewport.height - nativeWindow.Height) > 1
    )
      throw Error("Unexpected native/content coordinate mapping")
    if (viewport.scale !== profile.scale)
      throw Error("Standard release capture requires a 2× display scale")
    rect = {
      x: nativeWindow.X - profile.desktopPadding,
      y: nativeWindow.Y - profile.desktopPadding,
      width: nativeWindow.Width + profile.desktopPadding * 2,
      height: nativeWindow.Height + profile.desktopPadding * 2,
    }
    run(native, ["activate", pid])
    for (const step of scene.initial ?? []) await action(step)
    source = out + "/source-" + Date.now() + ".mp4"
    recording = spawn(
      recorder,
      [
        pid,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        scene.durationSeconds,
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
          : reject(Error("Native recording failed: " + stderr))
      )
    })
    // Keep early recorder failures observed while scene operations are still running.
    void recordingDone.catch(() => {})
    await new Promise((done, reject) => {
      const timer = setTimeout(
        () => reject(Error("Recorder did not start")),
        10000
      )
      let stdout = ""
      recording.stdout.on("data", (data) => {
        stdout += data.toString()
        const lines = stdout.split("\n")
        stdout = lines.pop()
        try {
          for (const line of lines) {
            if (line.startsWith("RECORDING_CLOCK "))
              recordingClock = JSON.parse(line.slice("RECORDING_CLOCK ".length))
            if (line === "RECORDING_STARTED") {
              parseInputTimeline(JSON.stringify(recordingClock))
              writeFileSync(
                rawTimelinePath,
                JSON.stringify(recordingClock) + "\n",
                { flag: "wx" }
              )
              clearTimeout(timer)
              done()
            }
          }
        } catch (error) {
          clearTimeout(timer)
          reject(error)
        }
      })
      recording.once("exit", () => {
        clearTimeout(timer)
        reject(Error("Recorder exited before start: " + stderr))
      })
    })
    startedAt = Date.now()
    recordingStarted = true
    for (const step of scene.steps) await action(step)
    const actionsFinishedSeconds = (Date.now() - startedAt) / 1000
    if (actionsFinishedSeconds >= scene.durationSeconds - 2)
      throw Error("Scene did not finish before the export boundary")
    // ScreenCaptureKit emits variable-rate frames and may omit an idle tail.
    // Park the real native cursor after the final viewing dwell so the source
    // retains a visible frame after every scenario assertion, without adding
    // synthetic video frames or changing the application state.
    await sleep(profile.minimumTipSeconds * 1000 + 200)
    run(native, [
      "move",
      nativeWindow.X + viewport.width - 24,
      nativeWindow.Y + viewport.height - 24,
    ])
    await recordingDone
    if (posterSeconds === undefined) throw Error("No poster marker was reached")
    if (sessionErrors.length)
      throw Error(
        "Iframe observation session failed: " + sessionErrors.join("; ")
      )
    const after = await snapshotFiles(
      fixture.space,
      fixture.files.map((f) => f.path)
    )
    if (!sameFiles(before, after))
      throw Error("Read-only scene changed fixture bytes or mtime")
    checkSource()
    const sourceProbe = JSON.parse(
      run("ffprobe", ["-v", "error", "-show_format", "-of", "json", source])
    )
    const sourceDuration = Number(sourceProbe.format.duration)
    if (
      !Number.isFinite(sourceDuration) ||
      sourceDuration < actionsFinishedSeconds + 0.5
    )
      throw Error("Source recording did not retain the completed scenario")
    const timeline = parseInputTimeline(await readFile(rawTimelinePath, "utf8"))
    const intervals = buildShortcutIntervals(
      timeline,
      Math.floor(Math.min(scene.durationSeconds, sourceDuration) * profile.fps)
    )
    const textFiles = await Promise.all(
      intervals.map(async (interval, index) => {
        const path = out + `/shortcut-${index}.txt`
        await writeFile(path, interval.label, { flag: "wx" })
        return path
      })
    )
    const filterPath = out + "/shortcut-filter.txt"
    await writeFile(
      filterPath,
      [`fps=${profile.fps}`, shortcutVideoFilter(intervals, textFiles)]
        .filter(Boolean)
        .join(","),
      { flag: "wx" }
    )
    await writeFile(
      timelinePath,
      JSON.stringify(
        { ...timeline, intervals, profileId: profile.id },
        null,
        2
      ) + "\n",
      { flag: "wx" }
    )
    run("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      source,
      "-filter_script:v",
      filterPath,
      "-an",
      "-t",
      scene.durationSeconds,
      "-c:v",
      "libx264",
      "-crf",
      profile.crf,
      "-preset",
      profile.preset,
      "-pix_fmt",
      "yuv420p",
      "-r",
      profile.fps,
      "-movflags",
      "+faststart",
      out + "/demo.mp4",
    ])
    run("ffmpeg", [
      "-nostdin",
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
      profile.posterQuality,
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
    const video = probe.streams.find((s) => s.codec_type === "video")
    validateVideoProfile(probe)
    buildShortcutIntervals(timeline, Number(video.nb_frames))
    if (
      !video ||
      video.codec_name !== "h264" ||
      video.r_frame_rate !== "30/1" ||
      video.pix_fmt !== "yuv420p" ||
      probe.streams.length !== 1 ||
      Math.abs(
        Number(probe.format.duration) -
          Math.min(scene.durationSeconds, sourceDuration)
      ) >
        1 / 30 + 0.001
    )
      throw Error("Unexpected media codec, stream, frame rate or duration")
    run("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-xerror",
      "-i",
      out + "/demo.mp4",
      "-f",
      "null",
      "-",
    ])
    const bytes = await readFile(out + "/demo.mp4")
    const boxes = []
    for (let offset = 0; offset + 8 <= bytes.length; ) {
      let size = bytes.readUInt32BE(offset)
      const type = bytes.toString("ascii", offset + 4, offset + 8)
      if (size === 1) size = Number(bytes.readBigUInt64BE(offset + 8))
      if (size === 0) size = bytes.length - offset
      if (size < 8 || offset + size > bytes.length)
        throw Error("Invalid MP4 box")
      boxes.push(type)
      offset += size
    }
    if (
      !boxes.includes("moov") ||
      !boxes.includes("mdat") ||
      boxes.indexOf("moov") > boxes.indexOf("mdat")
    )
      throw Error("MP4 is not faststart")
    const packageJson = await readJson(
      root + "/apps/eidos-lite-desktop/package.json"
    )
    const toolFiles = [
      "capture-iteration.mjs",
      "capture-profile.mjs",
      "iteration-utils.mjs",
      "iteration-scenes.json",
      "iteration-fixture.json",
      "prepare-iteration.mjs",
      "native-input.swift",
      "record-desktop.swift",
      "review.mjs",
    ]
    const toolHashes = Object.fromEntries(
      await Promise.all(
        toolFiles.map(async (name) => [name, await hashFile(here + "/" + name)])
      )
    )
    const manifest = {
      schemaVersion: 1,
      scenarioId: scene.id,
      scenarioRevision: catalog.scenarioRevision,
      releaseStatus: "unreleased-candidate",
      introducedInRelease: null,
      capturedAppVersion: packageJson.version,
      buildKind: "development",
      sourceCommit: expectedSha,
      captureCommit: expectedSha,
      featureCandidateCommit: catalog.featureCandidateCommit,
      featureSourceCommits: catalog.featureSourceCommits,
      source,
      recordedAt: new Date().toISOString(),
      appPid: pid,
      url: page.url,
      executable,
      fixtureManifest: fixturePath,
      fixtureManifestSha256: await hashFile(fixturePath),
      dataOrigin: "synthetic",
      fixtureUnchanged: true,
      fixtureBefore: before,
      fixtureAfter: after,
      isolatedProfile: fixture.profile,
      isolatedEidosHome: fixture.eidosHome,
      pluginPackage: plugin,
      expectedPluginStateChanges: scene.requiresPlugin
        ? ["tag group color", "tag group collapsed state"]
        : [],
      locale: "en",
      theme: "light",
      nativeWindow,
      captureProfile: profile,
      inputTimeline: {
        path: timelinePath,
        sha256: await hashFile(timelinePath),
        rawPath: rawTimelinePath,
        rawSha256: await hashFile(rawTimelinePath),
        clock: recordingClock,
        directNativeEvents: true,
        eventCount: timeline.events.length,
        scope:
          "Keyboard posts from this native helper; manual or external input is not observed",
      },
      shortcutAnnotations: {
        burnedIntoMp4: true,
        events: intervals.length,
        maximumConcurrentLabels: 1,
        minimumSeconds: profile.minimumTipSeconds,
        newRelevantKeyReplacesImmediately: true,
        addedCanvasPixels: 0,
        intervals,
      },
      toolHashes,
      sceneFileSha256: await hashFile(scenesPath),
      capture: {
        ...rect,
        padding: profile.desktopPadding,
        scale: viewport.scale,
        fps: profile.fps,
        audio: false,
        speed: 1,
        recorder: "ScreenCaptureKit",
        filter: "SCContentFilter(display:excludingWindows:)",
        nativeWindowControls: "Real macOS traffic lights; no synthetic overlay",
        exclusionLimit:
          "Initial window snapshot only; new windows, app dialogs, desktop and notifications require full-video review",
      },
      duration: Number(probe.format.duration),
      sourceDuration,
      actionsFinishedSeconds,
      exportBoundary: {
        start: 0,
        duration: scene.durationSeconds,
        policy:
          "Cap only the post-scenario stationary finalization tail; preserve a shorter real presentation duration and verify every action finished before its end",
      },
      nativeHelperBinarySha256: await hashFile(native),
      recorderBinarySha256: await hashFile(recorder),
      recorderArguments: [
        pid,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        scene.durationSeconds,
        viewport.scale,
        source,
      ],
      sourceRecordingSha256: await hashFile(source),
      posterSeconds,
      assertions,
      measurements: measures,
      output: {
        width: video.width,
        height: video.height,
        duration: Number(probe.format.duration),
      },
      technicalValidation: {
        fullDecode: true,
        h264: true,
        fps30: true,
        noAudio: true,
        faststart: true,
      },
      outputHashes: {
        "demo.mp4": await hashFile(out + "/demo.mp4"),
        "poster.webp": await hashFile(out + "/poster.webp"),
      },
      editorialReview: "pending",
      playbackReview: "pending",
      privacyReview: "pending",
    }
    checkSource()
    await writeFile(
      out + "/source.manifest.json",
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx" }
    )
    console.log(
      JSON.stringify(
        {
          video: out + "/demo.mp4",
          poster: out + "/poster.webp",
          assertions: assertions.length,
          output: manifest.output,
          sourceCommit: expectedSha,
          editorialReview: "pending",
          uploaded: false,
        },
        null,
        2
      )
    )
  } catch (error) {
    await writeFile(
      out + "/failed-take.json",
      JSON.stringify(
        {
          failedAt: new Date().toISOString(),
          error: String(error),
          source,
          assertions,
          publishable: false,
        },
        null,
        2
      ) + "\n"
    )
    throw error
  } finally {
    if (recording && recording.exitCode === null) {
      recording.kill("SIGTERM")
      await recordingDone?.catch(() => {})
    }
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(Error("Capture connection closed"))
    }
    ws.close()
  }
}
