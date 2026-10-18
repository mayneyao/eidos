import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Run only in a disposable CI runner, or in an explicitly supplied local
// directory on macOS. Windows and Debian installers change OS registrations.
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match =
      /^--(evidence|previous-tag|target-tag|candidate|version)=(.+)$/u.exec(arg)
    if (!match)
      throw new Error(`Unknown installation acceptance argument: ${arg}`)
    return [match[1], match[2]]
  })
)
assert.ok(
  args.evidence && path.isAbsolute(args.evidence),
  "--evidence must be absolute"
)
assert.equal(
  Boolean(args["target-tag"]),
  !Boolean(args.candidate),
  "Supply --target-tag or --candidate"
)
assert.ok(
  process.platform === "darwin" || process.env.CI === "true",
  "Windows/Linux installation acceptance requires a disposable CI runner"
)
const previousTag = args["previous-tag"] ?? "lite-v0.25.0"
const tagVersion = (tag) => {
  assert.match(tag, /^lite-v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/u)
  return tag.slice("lite-v".length)
}
const previousVersion = tagVersion(previousTag)
const targetVersion = args["target-tag"]
  ? tagVersion(args["target-tag"])
  : args.version
assert.ok(targetVersion && targetVersion !== previousVersion)
if (args.candidate) assert.ok(path.isAbsolute(args.candidate))
const root = path.resolve(args.evidence)
await fs.mkdir(root, { mode: 0o700 })
const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-installed-upgrade-")
)
const installRoot = path.join(temporaryRoot, "application")
const profile = path.join(temporaryRoot, "profile")
const space = path.join(temporaryRoot, "Space")
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const retainedFiles = [
  "project-tracker.eidos",
  "nested/calendar.eidos",
  "note.md",
  "nested/attachment.txt",
]
const report = {
  startedAt: new Date().toISOString(),
  platform: process.platform,
  architecture: process.arch,
  previousTag,
  targetVersion,
  source: process.env.GITHUB_SHA,
  artifacts: [],
  phases: [],
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const exists = (file) =>
  fs.stat(file).then(
    () => true,
    () => false
  )
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const writeReport = () =>
  fs.writeFile(
    path.join(root, "result.json"),
    `${JSON.stringify(report, null, 2)}\n`
  )

function command(executable, parameters, options = {}) {
  const result = spawnSync(executable, parameters, {
    encoding: "utf8",
    timeout: 180_000,
    ...options,
  })
  if (result.error) throw result.error
  assert.equal(
    result.status,
    0,
    `${executable} failed: ${result.stderr || result.stdout}`
  )
  return result.stdout
}

async function download(url, output) {
  const response = await fetch(url)
  assert.equal(response.status, 200, `Download failed: ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(output, bytes, { mode: 0o600 })
  return bytes
}

async function publishedInstaller(tag) {
  const release = JSON.parse(
    command("gh", ["api", `repos/mayneyao/eidos/releases/tags/${tag}`])
  )
  assert.equal(release.draft, false)
  const version = tagVersion(tag)
  const suffix =
    process.platform === "darwin"
      ? `mac-${process.arch}.dmg`
      : process.platform === "win32"
        ? "win-x64.exe"
        : `linux-${process.arch === "x64" ? "amd64" : "arm64"}.deb`
  const originalName = `Eidos Lite-${version}-${suffix}`
  const asset = release.assets.find(
    (entry) =>
      entry.name === originalName ||
      entry.name === originalName.replace(/^Eidos Lite-/u, "Eidos.Lite-")
  )
  const checksumAsset = release.assets.find(
    (entry) => entry.name === "SHA256SUMS"
  )
  assert.ok(
    asset && checksumAsset,
    `Missing published installer/checksums for ${tag}`
  )
  const checksums = await download(
    checksumAsset.browser_download_url,
    path.join(root, `${tag}-SHA256SUMS`)
  )
  const line = checksums
    .toString("utf8")
    .split("\n")
    .find(
      (entry) =>
        entry.slice(66).trim() === originalName ||
        entry.slice(66).trim() === asset.name
    )
  assert.ok(line, `No checksum for ${asset.name}`)
  const output = path.join(temporaryRoot, asset.name)
  const bytes = await download(asset.browser_download_url, output)
  const sha256 = hash(bytes)
  assert.equal(sha256, line.slice(0, 64), "Downloaded installer checksum")
  if (asset.digest)
    assert.equal(asset.digest, `sha256:${sha256}`, "GitHub asset digest")
  report.artifacts.push({
    tag,
    name: asset.name,
    sha256,
    bytes: bytes.length,
    release: release.html_url,
  })
  return output
}

async function install(installer) {
  if (process.platform === "darwin") {
    const mounted = path.join(temporaryRoot, "mount")
    await fs.mkdir(mounted, { recursive: true })
    command("hdiutil", [
      "attach",
      installer,
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mounted,
    ])
    try {
      const source = path.join(mounted, "Eidos Lite.app")
      command("codesign", ["--verify", "--deep", "--strict", source])
      const app = path.join(installRoot, "Eidos Lite.app")
      if (await exists(app)) {
        // Retain every replaced package; never replace or remove a user app.
        await fs.rename(
          app,
          path.join(
            temporaryRoot,
            `previous-package-${report.phases.length}-${Date.now()}.app`
          )
        )
      }
      command("ditto", [source, app])
      return path.join(app, "Contents/MacOS/Eidos Lite")
    } finally {
      command("hdiutil", ["detach", mounted])
    }
  }
  if (process.platform === "win32") {
    // /D must be the last NSIS argument and must not carry literal quotes.
    command(installer, ["/S", "/currentuser", `/D=${installRoot}`])
    const executable = path.join(installRoot, "Eidos Lite.exe")
    assert.ok(
      await exists(executable),
      "NSIS must install into the explicit test directory"
    )
    return executable
  }
  command("sudo", ["apt-get", "install", "-y", "--allow-downgrades", installer])
  assert.equal(
    command("dpkg-query", ["--show", "--showformat=${Status}", "eidos-lite"]),
    "install ok installed"
  )
  return "/opt/eidos-lite/eidos-lite-desktop"
}

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data)
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timeout)
      if (message.error)
        pending.reject(new Error(JSON.stringify(message.error)))
      else pending.resolve(message.result)
    })
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout)
        pending.reject(new Error("CDP closed"))
      }
      this.pending.clear()
    })
  }
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", reject, { once: true })
    })
    return new Cdp(socket)
  }
  send(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timed out: ${method}`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    assert.equal(
      response.exceptionDetails,
      undefined,
      JSON.stringify(response.exceptionDetails)
    )
    return response.result.value
  }
  close() {
    this.socket.close()
  }
}

async function waitFor(check, label, duration = 30_000) {
  const deadline = Date.now() + duration
  while (Date.now() < deadline) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function launch(executable, phase) {
  await fs.rm(path.join(profile, "DevToolsActivePort"), { force: true })
  const log = await fs.open(path.join(root, `${phase}.log`), "wx", 0o600)
  const environment = { ...process.env }
  for (const name of [
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "EIDOS_LITE_ENVIRONMENT",
    "EIDOS_LITE_GRAFT_SDK_PATH",
    "GRAFT_SDK_NATIVE_PATH",
  ])
    delete environment[name]
  const child = spawn(
    executable,
    [
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      path.join(space, "project-tracker.eidos"),
    ],
    { env: environment, stdio: ["ignore", log.fd, log.fd] }
  )
  const exit = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }))
    child.once("error", reject)
  })
  try {
    const port = await waitFor(async () => {
      assert.equal(
        child.exitCode,
        null,
        "Application exited before renderer initialization"
      )
      if (!(await exists(path.join(profile, "DevToolsActivePort"))))
        return false
      return Number(
        (
          await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0]
      )
    }, `${phase} debugging port`)
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      return (await response.json()).find(
        (entry) => entry.type === "page" && entry.url.includes("index.html")
      )
    }, `${phase} application page`)
    const cdp = await Cdp.connect(target.webSocketDebuggerUrl)
    await waitFor(
      () =>
        cdp.evaluate(
          "Boolean(window.eidosLite) && location.hash.includes('/spaces/')"
        ),
      `${phase} ordinary Space`
    )
    return { child, exit, log, cdp }
  } catch (error) {
    child.kill("SIGKILL")
    await exit
    await log.close()
    throw error
  }
}

async function quit(session) {
  // Browser.close requests the actual Electron application shutdown. Never
  // replace an installed package with a live application or utility process.
  await session.cdp.send("Browser.close").catch((error) => {
    if (error.message !== "CDP closed") throw error
  })
  session.cdp.close()
  const result = await Promise.race([
    session.exit,
    sleep(10_000).then(() => false),
  ])
  if (!result) {
    session.child.kill("SIGKILL")
    await session.exit
    throw new Error("Application did not shut down cleanly for installation")
  }
  await session.log.close()
  assert.equal(
    result.code,
    0,
    "Clean application exit before package replacement"
  )
}

async function fileHashes() {
  return Object.fromEntries(
    await Promise.all(
      retainedFiles.map(async (name) => [
        name,
        hash(await fs.readFile(path.join(space, name))),
      ])
    )
  )
}

async function inspect(session) {
  const snapshot = await session.cdp.evaluate(`(async () => {
    const api = window.eidosLite;
    const opened = await api.openEidosFile('project-tracker.eidos');
    const nested = await api.openEidosFile('nested/calendar.eidos');
    return { diagnostics: await api.getDiagnostics(), space: await api.getSpace(), history: await api.getVersionHistory(20), preferences: await api.getPreferences(), tables: opened.snapshot.tables, nestedTables: nested.snapshot.tables };
  })()`)
  // Checkpoint acknowledgement intentionally precedes background repository
  // reconciliation. Package replacement must wait for that work to finish.
  snapshot.space = await waitFor(
    () =>
      session.cdp.evaluate(
        "(async () => { const space = await window.eidosLite.getSpace(); return space?.operation.phase === 'ready' ? space : null; })()"
      ),
    "Space operations to drain before package replacement"
  )
  return snapshot
}

let active
try {
  await fs.mkdir(installRoot)
  await fs.mkdir(profile)
  await fs.mkdir(path.join(space, "nested"), { recursive: true })
  await fs.writeFile(
    path.join(profile, "preferences.json"),
    JSON.stringify({ automaticUpdates: false })
  )
  await fs.copyFile(
    path.join(
      repositoryRoot,
      "apps/eidos-file-web/fixtures/project-tracker.eidos"
    ),
    path.join(space, "project-tracker.eidos")
  )
  await fs.copyFile(
    path.join(
      repositoryRoot,
      "apps/eidos-file-web/fixtures/content-calendar.eidos"
    ),
    path.join(space, "nested/calendar.eidos")
  )
  await fs.writeFile(
    path.join(space, "note.md"),
    "# Preserve this ordinary Space\n升级前的本地内容。\n"
  )
  await fs.writeFile(
    path.join(space, "nested/attachment.txt"),
    "Preserve the nested attachment.\n"
  )
  const previous = await publishedInstaller(previousTag)
  const candidate =
    args.candidate ?? (await publishedInstaller(args["target-tag"]))
  let expected
  let hashes
  for (const [phase, installer, version] of [
    ["previous", previous, previousVersion],
    ["upgrade", candidate, targetVersion],
    ["rollback", previous, previousVersion],
    ["reinstall", candidate, targetVersion],
  ]) {
    console.log(`Installing and opening ${phase}: ${version}`)
    const executable = await install(installer)
    active = await launch(executable, phase)
    if (phase === "previous") {
      await active.cdp.evaluate(
        "window.eidosLite.updatePreferences({appearance:'light',automaticUpdates:false,weekStartsOnMonday:false})"
      )
      await active.cdp.evaluate("window.eidosLite.enableVersioning()")
      await fs.appendFile(
        path.join(space, "note.md"),
        "Checkpoint retained across installation.\n"
      )
      await active.cdp.evaluate(
        "window.eidosLite.createCheckpoint('Before installer upgrade')"
      )
    }
    const snapshot = await inspect(active)
    assert.equal(
      snapshot.diagnostics.app.version,
      version,
      `${phase} actual runtime version`
    )
    assert.equal(snapshot.diagnostics.app.packaged, true)
    assert.equal(snapshot.diagnostics.environment, "production")
    // Older published versions remain usable as diagnostic targets.
    const [targetMajor, targetMinor] = targetVersion.split(".").map(Number)
    const verifyPluginProtocol =
      process.platform === "win32" &&
      version === targetVersion &&
      (targetMajor > 0 || targetMinor >= 25)
    if (verifyPluginProtocol) {
      const registration = command("reg", [
        "query",
        "HKCU\\Software\\Classes\\eidos-lite\\shell\\open\\command",
        "/ve",
      ])
      assert.ok(
        registration.toLowerCase().includes(executable.toLowerCase()),
        "Plugin installation links must open this installed application"
      )
      assert.ok(
        registration.includes("%1"),
        "Plugin installation links must pass their URL to the application"
      )
    }
    assert.equal(snapshot.space.operation.phase, "ready")
    assert.equal(snapshot.space.eidosFileCount, 2)
    assert.ok(snapshot.tables.length > 0 && snapshot.nestedTables.length > 0)
    if (expected) {
      assert.equal(
        snapshot.space.id,
        expected.space.id,
        "Canonical Space identity preserved"
      )
      assert.equal(
        snapshot.history.currentHead,
        expected.history.currentHead,
        "Durable history head preserved"
      )
      assert.deepEqual(
        snapshot.history.commits.map((commit) => commit.id),
        expected.history.commits.map((commit) => commit.id),
        "Every history entry preserved"
      )
      assert.deepEqual(
        snapshot.tables,
        expected.tables,
        "Eidos File schema preserved"
      )
      assert.deepEqual(snapshot.nestedTables, expected.nestedTables)
      for (const key of [
        "appearance",
        "automaticUpdates",
        "weekStartsOnMonday",
      ])
        assert.equal(
          snapshot.preferences[key],
          expected.preferences[key],
          `${key} preserved`
        )
      assert.deepEqual(
        await fileHashes(),
        hashes,
        "Every ordinary file preserved"
      )
    }
    if (phase === "upgrade") {
      await fs.appendFile(
        path.join(space, "note.md"),
        "Checkpoint created by the upgraded version.\n"
      )
      await active.cdp.evaluate(
        "window.eidosLite.createCheckpoint('After installer upgrade')"
      )
    }
    expected = await inspect(active)
    hashes = await fileHashes()
    await fs.writeFile(
      path.join(root, `${phase}.json`),
      JSON.stringify(expected, null, 2)
    )
    const screenshot = await active.cdp.send("Page.captureScreenshot", {
      format: "png",
    })
    await fs.writeFile(
      path.join(root, `${phase}.png`),
      Buffer.from(screenshot.data, "base64")
    )
    await quit(active)
    active = undefined
    report.phases.push({
      phase,
      version,
      ...(verifyPluginProtocol ? { pluginProtocolRegistered: true } : {}),
      historyHead: expected.history.currentHead,
      commits: expected.history.commits.length,
      files: hashes,
      processExitedCleanly: true,
    })
    await writeReport()
  }
  report.status = "passed"
  report.finishedAt = new Date().toISOString()
  await writeReport()
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.status = "failed"
  report.error = error instanceof Error ? error.message : String(error)
  await writeReport()
  throw error
} finally {
  if (active) {
    active.cdp.close()
    active.child.kill("SIGKILL")
    await active.exit
    await active.log.close()
  }
  // Keep the test profiles and all replaced packages for failed-run diagnosis.
  await fs.writeFile(
    path.join(root, "temporary-root.txt"),
    `${temporaryRoot}\n`
  )
}
