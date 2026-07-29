import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = path.resolve(appRoot, "../..")

async function executablePath() {
  if (process.env.EIDOS_LITE_PACKAGED_APP) {
    return path.resolve(process.env.EIDOS_LITE_PACKAGED_APP)
  }
  const output = path.join(appRoot, "dist-app")
  const candidates =
    process.platform === "darwin"
      ? [
          path.join(
            output,
            `mac-${process.arch === "arm64" ? "arm64" : "x64"}`,
            "Eidos Lite.app",
            "Contents",
            "MacOS",
            "Eidos Lite"
          ),
          path.join(
            output,
            "mac",
            "Eidos Lite.app",
            "Contents",
            "MacOS",
            "Eidos Lite"
          ),
        ]
      : process.platform === "win32"
        ? [path.join(output, "win-unpacked", "Eidos Lite.exe")]
        : [path.join(output, "linux-unpacked", "eidos-lite-desktop")]
  for (const candidate of candidates) {
    if (
      await fs.stat(candidate).then(
        () => true,
        () => false
      )
    )
      return candidate
  }
  throw new Error(
    "No unpacked Eidos Lite app found. Run pnpm build:eidos-lite:dev first."
  )
}

async function run(executable, space, result) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      env: {
        ...process.env,
        EIDOS_LITE_SMOKE_SPACE: space,
        EIDOS_LITE_SMOKE_RESULT: result,
      },
      stdio: "inherit",
    })
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("Packaged Eidos Lite smoke timed out"))
    }, 90_000)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(`Packaged app exited with ${code ?? signal}`))
    })
  })
}

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-lite-packaged-smoke-")
)

try {
  const space = path.join(temporaryRoot, "Real Multi-file Space")
  const nested = path.join(space, "projects")
  const result = path.join(temporaryRoot, "result.json")
  await fs.mkdir(nested, { recursive: true })
  await Promise.all([
    fs.copyFile(
      path.join(
        repositoryRoot,
        "apps/eidos-file-web/fixtures/project-tracker.eidos"
      ),
      path.join(space, "project-tracker.eidos")
    ),
    fs.copyFile(
      path.join(
        repositoryRoot,
        "apps/eidos-file-web/fixtures/content-calendar.eidos"
      ),
      path.join(nested, "content-calendar.eidos")
    ),
    fs.copyFile(
      path.join(
        repositoryRoot,
        "apps/eidos-file-web/fixtures/project-tracker.eidos"
      ),
      path.join(space, "planning.eidos")
    ),
    fs.copyFile(
      path.join(
        repositoryRoot,
        "apps/eidos-file-web/fixtures/content-calendar.eidos"
      ),
      path.join(nested, "archive.eidos")
    ),
    fs.writeFile(path.join(space, "README.md"), "# Packaged smoke Space\n"),
  ])
  await run(await executablePath(), space, result)
  const report = JSON.parse(await fs.readFile(result, "utf8"))
  const expectedSyncFailureCodes = [
    "offline",
    "authentication-required",
    "device-revoked",
    "entitlement-inactive",
    "remote-not-found",
    "remote-conflict",
    "quota-exceeded",
    "protocol-version-mismatch",
    "rate-limited",
    "remote-persistence-failed",
    "service-unavailable",
    "service-unavailable",
    "service-unavailable",
    "sync-process-crashed",
  ]
  const expectedSyncFailureStatuses = [
    null,
    null,
    null,
    null,
    404,
    409,
    413,
    426,
    429,
    500,
    502,
    503,
    504,
    null,
  ]
  if (
    !report.ok ||
    report.environment?.name !== "staging" ||
    report.environment?.accountOrigin !== "https://staging.eidos.space" ||
    report.environment?.billingOrigin !== "https://staging.eidos.space" ||
    report.environment?.syncRemoteOrigin !==
      "https://sync-staging.eidos.space" ||
    report.environment?.stagingBadge !== true ||
    Object.values(report.onboarding ?? {}).some((value) => value !== true) ||
    Object.keys(report.onboarding ?? {}).length !== 6 ||
    report.probes?.length !== 3 ||
    report.runtimeCache?.residentPaths?.length > 3 ||
    Object.values(report.fileLifecycle ?? {}).some((value) => value !== true) ||
    Object.values(report.lifecycleRecovery ?? {}).some(
      (value) => value !== true
    ) ||
    !report.graft?.available ||
    report.graft?.backend !== "sdk" ||
    report.graft?.version !== "0.1.0" ||
    report.mutation?.afterInsertCount !== report.mutation?.beforeCount + 1 ||
    report.mutation?.afterDeleteCount !== report.mutation?.beforeCount ||
    report.mutation?.checkpointCount !== report.mutation?.beforeCount + 1 ||
    report.mutation?.restoredCount !== report.mutation?.beforeCount ||
    Object.values(report.canonicalEditor ?? {}).some(
      (value) => value !== true
    ) ||
    Object.values(report.styleContract ?? {}).some((value) => value !== true) ||
    Object.values(report.workbenchLayout ?? {}).some(
      (value) => value !== true
    ) ||
    Object.values(report.syncControl ?? {}).some((value) => value !== true) ||
    JSON.stringify(report.syncReliability?.codes) !==
      JSON.stringify(expectedSyncFailureCodes) ||
    JSON.stringify(report.syncReliability?.statuses) !==
      JSON.stringify(expectedSyncFailureStatuses) ||
    report.syncReliability?.allClassified !== true ||
    report.syncReliability?.allLocalSafe !== true ||
    report.syncReliability?.allActionable !== true ||
    report.syncReliability?.failedTelemetry !== true ||
    report.syncReliability?.localRuntimeAvailable !== true ||
    report.syncReliability?.gateStayedReady !== true ||
    report.syncReliability?.ordinaryFilesUnchanged !== true ||
    report.syncReliability?.failuresScheduledSafely !== true ||
    report.syncReliability?.automaticRetryAttempted !== true ||
    report.versioning?.initialized !== true ||
    report.versioning?.clean !== true ||
    report.versioning?.changePaths < 1 ||
    report.versioning?.rowChanges < 1 ||
    report.versioning?.historyCount < 3 ||
    report.versioning?.restoreCreatedCheckpoint !== true ||
    report.versioning?.automaticCheckpoint !== true
  ) {
    throw new Error(`Invalid packaged smoke report: ${JSON.stringify(report)}`)
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  await fs.rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
