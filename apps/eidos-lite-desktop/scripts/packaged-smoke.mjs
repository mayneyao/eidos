import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = path.resolve(appRoot, "../..")

const expectedEnvironmentName =
  process.env.EIDOS_LITE_SMOKE_EXPECTED_ENVIRONMENT ?? "staging"
if (
  expectedEnvironmentName !== "staging" &&
  expectedEnvironmentName !== "production"
) {
  throw new Error(
    `Invalid packaged smoke environment: ${expectedEnvironmentName}`
  )
}
const expectedServices =
  expectedEnvironmentName === "production"
    ? {
        name: "production",
        accountOrigin: "https://eidos.space",
        billingOrigin: "https://eidos.space",
        syncRemoteOrigin: "https://sync.eidos.space",
        stagingBadge: false,
      }
    : {
        name: "staging",
        accountOrigin: "https://staging.eidos.space",
        billingOrigin: "https://staging.eidos.space",
        syncRemoteOrigin: "https://sync-staging.eidos.space",
        stagingBadge: true,
      }

const performancePolicy =
  process.env.EIDOS_LITE_SMOKE_PERFORMANCE_POLICY ?? "enforce"
if (performancePolicy !== "enforce" && performancePolicy !== "observe") {
  throw new Error(
    `Invalid packaged smoke performance policy: ${performancePolicy}`
  )
}
const enforcePerformance = performancePolicy === "enforce"

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
    const launchedAtMs = Date.now()
    const child = spawn(executable, [], {
      env: {
        ...process.env,
        EIDOS_LITE_SMOKE_SPACE: space,
        EIDOS_LITE_SMOKE_RESULT: result,
        EIDOS_LITE_SMOKE_LAUNCHED_AT_MS: String(launchedAtMs),
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

async function resourcesPath(executable) {
  const resolvedExecutable = await fs.realpath(executable)
  return process.platform === "darwin"
    ? path.resolve(path.dirname(resolvedExecutable), "../Resources")
    : path.join(path.dirname(resolvedExecutable), "resources")
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
    fs.writeFile(path.join(space, "Empty.md"), ""),
  ])
  const executable = await executablePath()
  const packagedCli = path.join(await resourcesPath(executable), "graft")
  if (
    await fs.stat(packagedCli).then(
      () => true,
      () => false
    )
  ) {
    throw new Error(`Packaged Eidos Lite still contains ${packagedCli}`)
  }
  await run(executable, space, result)
  const reportText = await fs.readFile(result, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error(
        "Packaged app exited without a smoke report; verify single-instance ownership and startup logs"
      )
    }
    throw error
  })
  const report = JSON.parse(reportText)
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
  const startup = report.performance?.startup
  const budgets = report.performance?.budgets
  const startupPhases = startup
    ? [
        startup.launcherToBootstrapMs,
        startup.bootstrapToMainMs,
        startup.mainToReadyMs,
        startup.readyToIpcMs,
        startup.ipcToProbeMs,
        startup.probeToRendererMs,
        startup.rendererToUsableMs,
      ]
    : []
  if (
    !report.ok ||
    report.environment?.name !== expectedServices.name ||
    report.environment?.accountOrigin !== expectedServices.accountOrigin ||
    report.environment?.billingOrigin !== expectedServices.billingOrigin ||
    report.environment?.syncRemoteOrigin !==
      expectedServices.syncRemoteOrigin ||
    report.environment?.stagingBadge !== expectedServices.stagingBadge ||
    report.performance?.coldStartMs <= 0 ||
    !Number.isFinite(budgets?.coldStartMs) ||
    (enforcePerformance &&
      report.performance?.coldStartMs > budgets.coldStartMs) ||
    startupPhases.length !== 7 ||
    startupPhases.some(
      (duration) => !Number.isFinite(duration) || duration < 0
    ) ||
    startup?.totalMs !== report.performance?.coldStartMs ||
    startupPhases.reduce((total, duration) => total + duration, 0) !==
      startup?.totalMs ||
    report.performance?.utilityOpenP95Ms <= 0 ||
    !Number.isFinite(budgets?.utilityOpenP95Ms) ||
    (enforcePerformance &&
      report.performance?.utilityOpenP95Ms > budgets.utilityOpenP95Ms) ||
    report.performance?.utilityOpenMs?.length !== 4 ||
    report.performance?.denseGrid?.rows !== 100_000 ||
    report.performance?.denseGrid?.preparationMs <= 0 ||
    report.performance?.denseGrid?.renderedFirstFrameMs <= 0 ||
    !Number.isFinite(budgets?.denseGridFirstFrameMs) ||
    (enforcePerformance &&
      report.performance?.denseGrid?.renderedFirstFrameMs >
        budgets.denseGridFirstFrameMs) ||
    report.performance?.denseGrid?.canvasWidth <= 0 ||
    report.performance?.denseGrid?.canvasHeight <= 0 ||
    Object.values(report.launchRouting ?? {}).some((value) => value !== true) ||
    Object.keys(report.launchRouting ?? {}).length !== 3 ||
    report.diagnostics?.workbenchActionAbsent !== true ||
    report.diagnostics?.copyApi !== true ||
    report.diagnostics?.schemaVersion !== 1 ||
    report.diagnostics?.environment !== expectedServices.name ||
    report.diagnostics?.openSpace !== true ||
    report.diagnostics?.safe !== true ||
    Object.values(report.onboarding ?? {}).some((value) => value !== true) ||
    Object.keys(report.onboarding ?? {}).length !== 6 ||
    report.probes?.length !== 3 ||
    report.runtimeCache?.residentPaths?.length > 3 ||
    Object.values(report.fileLifecycle ?? {}).some((value) => value !== true) ||
    Object.values(report.textEditor ?? {}).some((value) => value !== true) ||
    Object.values(report.lifecycleRecovery ?? {}).some(
      (value) => value !== true
    ) ||
    !report.graft?.available ||
    report.graft?.backend !== "sdk" ||
    report.graft?.version !== "0.3.21" ||
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
    report.versioning?.iconAction !== true ||
    report.versioning?.changeBadge !== true ||
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
