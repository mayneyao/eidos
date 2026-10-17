import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Invoke the exact retained staging executable. Never use an installed app,
// a development Electron binary, a native override, or a source SDK snapshot.
const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const match = /^--(app|evidence|account-state|token-file)=(.+)$/.exec(
      argument
    )
    if (!match)
      throw new Error(
        "Expected --app=, --evidence= and exactly one of --account-state= or --token-file="
      )
    return [match[1], match[2]]
  })
)
for (const key of ["app", "evidence"])
  if (!args[key] || !path.isAbsolute(args[key]))
    throw new Error(`--${key} must be absolute`)
if (Boolean(args["account-state"]) === Boolean(args["token-file"]))
  throw new Error("Supply exactly one owner-only staging credential file")
for (const name of ["EIDOS_LITE_GRAFT_SDK_PATH", "GRAFT_SDK_NATIVE_PATH"])
  if (process.env[name])
    throw new Error(`Remove ${name} before packaged validation`)

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const localRequire = createRequire(path.join(appRoot, "package.json"))
const builderRequire = createRequire(localRequire.resolve("electron-builder"))
const { extractFile } = builderRequire("@electron/asar")
const executable = await fs.realpath(args.app)
const resources =
  process.platform === "darwin"
    ? path.resolve(path.dirname(executable), "../Resources")
    : path.join(path.dirname(executable), "resources")
const archive = path.join(resources, "app.asar")
const readArchiveJson = (relative) =>
  JSON.parse(extractFile(archive, relative).toString("utf8"))
const services = readArchiveJson(
  "dist-electron/eidos-lite-build-environment.json"
)
const policy = readArchiveJson("dist-electron/graft-sdk-build-policy.json")
const sdk = readArchiveJson("node_modules/@eidos.space/graft/package.json")
if (
  services.name !== "staging" ||
  services.accountOrigin !== "https://staging.eidos.space" ||
  services.syncRemoteOrigin !== "https://sync-staging.eidos.space"
)
  throw new Error("The supplied package is not the fixed staging build")
if (policy.sourceSnapshot !== false)
  throw new Error("Packaged acceptance requires published SDK dependencies")

const credential = await fs.realpath(
  args["account-state"] ?? args["token-file"]
)
const originalCredential = await fs.lstat(
  args["account-state"] ?? args["token-file"]
)
if (
  !originalCredential.isFile() ||
  originalCredential.isSymbolicLink() ||
  (originalCredential.mode & 0o077) !== 0 ||
  (typeof process.getuid === "function" &&
    originalCredential.uid !== process.getuid())
)
  throw new Error("Credential must be an owner-only regular file")

async function nativeFiles(directory) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await nativeFiles(target)))
    else if (
      entry.isFile() &&
      entry.name.endsWith(".node") &&
      /[/\\]graft-[^/\\]+[/\\]/.test(target)
    )
      files.push(target)
  }
  return files.sort()
}
const addons = await nativeFiles(path.join(resources, "app.asar.unpacked"))
if (addons.length !== 1)
  throw new Error(
    "Expected exactly one bundled Graft native addon for this platform"
  )
const fixtureEngine = path.join(
  resources,
  "publish-engine",
  process.platform === "win32" ? "eidos.exe" : "eidos"
)
const fixtureCommands = [
  ["file", "new"],
  ["file", "inspect"],
  ["data", "mutate"],
  ["data", "query"],
  ["attachment", "import"],
]
for (const command of fixtureCommands) {
  const probe = spawnSync(fixtureEngine, [...command, "--help"], {
    encoding: "utf8",
    timeout: 15_000,
  })
  if (
    probe.error ||
    probe.status !== 0 ||
    !probe.stdout.includes("Usage: eidos")
  )
    throw new Error(
      `Bundled fixture engine does not support ${command.join(" ")}`
    )
}
async function identities() {
  return Promise.all(
    [executable, archive, fixtureEngine, ...addons].map(async (file) => ({
      path: file,
      sha256: createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex"),
    }))
  )
}
const before = await identities()
await fs.mkdir(args.evidence, { mode: 0o700 })
const evidence = await fs.realpath(args.evidence)
const startedAt = new Date().toISOString()
const enrollment = path.join(evidence, "enrollment.json")
const restart = path.join(evidence, "restart.json")
const environment = { ...process.env }
for (const key of Object.keys(environment))
  if (
    key.startsWith("EIDOS_LITE_SMOKE_") ||
    key.startsWith("EIDOS_LITE_STAGING_") ||
    [
      "ELECTRON_RUN_AS_NODE",
      "NODE_OPTIONS",
      "VITE_DEV_SERVER_URL",
      "EIDOS_LITE_DEV_USER_DATA",
      "EIDOS_LITE_ENVIRONMENT",
    ].includes(key)
  )
    delete environment[key]
environment[
  args["token-file"]
    ? "EIDOS_LITE_STAGING_TOKEN_FILE"
    : "EIDOS_LITE_STAGING_ACCOUNT_STATE"
] = credential

async function run(result, previous) {
  const log = await fs.open(
    path.join(evidence, previous ? "restart.log" : "enrollment.log"),
    "wx",
    0o600
  )
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [], {
        env: {
          ...environment,
          EIDOS_LITE_STAGING_E2EE_RESULT: result,
          ...(previous
            ? { EIDOS_LITE_STAGING_REMEMBER_ENROLLMENT: previous }
            : { EIDOS_LITE_STAGING_REMEMBER_UNLOCK: "1" }),
        },
        stdio: ["ignore", log.fd, log.fd],
      })
      let timedOut = false
      let killTimer
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill("SIGTERM")
        killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000)
      }, 10 * 60_000)
      child.once("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once("exit", (code, signal) => {
        clearTimeout(timeout)
        clearTimeout(killTimer)
        if (code === 0 && !timedOut) resolve()
        else
          reject(
            new Error(
              `Packaged encrypted validation exited ${code ?? signal}${timedOut ? " after timeout" : ""}`
            )
          )
      })
    })
  } finally {
    await log.close()
  }
  const report = JSON.parse(await fs.readFile(result, "utf8"))
  if (
    report.status !== "passed" ||
    report.packaged !== true ||
    report.environment !== "staging" ||
    report.sdkVersion !== sdk.version ||
    (await fs.realpath(report.executable)) !== executable ||
    (await fs.realpath(report.fixtureCli)) !==
      (await fs.realpath(fixtureEngine))
  )
    throw new Error("Packaged encrypted result has mismatched provenance")
  return report
}

let report
try {
  const enrolled = await run(enrollment)
  const restored = await run(restart, enrollment)
  if (
    enrolled.processId === restored.processId ||
    restored.enrollmentProcessId !== enrolled.processId
  )
    throw new Error(
      "Restart did not use an independent packaged application process"
    )
  const after = await identities()
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(
      "Packaged executable or native artifacts changed during validation"
    )
  report = {
    status: "passed",
    startedAt,
    completedAt: new Date().toISOString(),
    sdkVersion: sdk.version,
    services,
    sourceSnapshot: false,
    fixtureCommands,
    packagedArtifacts: before,
    enrollment,
    restart,
    processIds: [enrolled.processId, restored.processId],
    coverage: [
      "encrypted first publication",
      "independent client clone",
      "wrong password",
      "real transfer cancellation and retry",
      "bidirectional SQLite and attachments",
      "OS-protected remembered restart",
    ],
    limitations: [
      "Two isolated clients on one physical machine",
      "Lock/sleep/wake acceptance is separate",
      "Staging package evidence does not prove signed production distribution",
    ],
  }
} catch (error) {
  report = {
    status: "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    packagedArtifacts: before,
    message:
      error instanceof Error ? error.message : "Packaged validation failed",
  }
  process.exitCode = 1
}
await fs.writeFile(
  path.join(evidence, "packaged-e2ee.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx", mode: 0o600 }
)
console.log(
  JSON.stringify({
    status: report.status,
    report: path.join(evidence, "packaged-e2ee.json"),
  })
)
