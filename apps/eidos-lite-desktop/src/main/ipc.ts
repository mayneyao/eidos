import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"

import {
  EIDOS_LITE_CSV_EXPORT_BYTES_MAX,
  EIDOS_LITE_CSV_FILE_BYTES_MAX,
  IPC_CHANNELS,
  RUNTIME_METHODS,
  type EidosLitePreferences,
  type EidosLiteCsvSelection,
  type EidosLiteSettingsDestination,
  type EidosSyncHelpDestination,
  type EidosSyncQueueStatus,
  type EidosSyncRunResponse,
  type EidosSyncPreflightApproval,
  type EidosSyncPhase,
  type RuntimeCalls,
  type RuntimeMethod,
} from "../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"
import { eidosLiteLogger, logCorrelationKey } from "./logging"
import { BackgroundSyncQueue } from "./sync/background-sync-queue"
import { scheduleCheckpointSyncAfterLocalSave } from "./sync/checkpoint-sync-scheduler"
import { cloudDisplayNameForLocalSpace } from "./sync/cloud-space-name"
import type { SyncControlPlane } from "./sync/sync-control-plane"
import {
  classifySyncFailure,
  type PackagedSyncFault,
} from "./sync/sync-failure"
import { SyncExecutor } from "./sync/sync-executor"
import { SyncQueueStore } from "./sync/sync-queue-store"
import { SyncRunTracker } from "./sync/sync-run-tracker"
import type { WindowController } from "./window-controller"

const runtimeMethods = new Set<RuntimeMethod>(RUNTIME_METHODS)
const CSV_SOURCE_TTL_MS = 30 * 60_000
const CSV_SOURCES_PER_WINDOW_MAX = 8

interface RegisteredCsvSource extends EidosLiteCsvSelection {
  sourcePath: string
  expiresAtMs: number
}

function optionalRelativePath(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") throw new Error("Invalid Space folder")
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${label}`)
  return value
}

function requiredBytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`Invalid ${label}`)
  if (value.byteLength > EIDOS_LITE_CSV_EXPORT_BYTES_MAX) {
    throw new Error(`${label} exceeds the 256 MiB export limit`)
  }
  return new Uint8Array(value)
}

function preferencesPatch(value: unknown): Partial<EidosLitePreferences> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid preferences")
  }
  const candidate = value as Record<string, unknown>
  const patch: Partial<EidosLitePreferences> = {}
  if ("appearance" in candidate) {
    if (
      candidate.appearance !== "system" &&
      candidate.appearance !== "light" &&
      candidate.appearance !== "dark"
    ) {
      throw new Error("Invalid appearance preference")
    }
    patch.appearance = candidate.appearance
  }
  if ("automaticCheckpoints" in candidate) {
    if (typeof candidate.automaticCheckpoints !== "boolean") {
      throw new Error("Invalid automatic checkpoint preference")
    }
    patch.automaticCheckpoints = candidate.automaticCheckpoints
  }
  if ("defaultSpaceLocation" in candidate) {
    if (
      candidate.defaultSpaceLocation !== null &&
      (typeof candidate.defaultSpaceLocation !== "string" ||
        !candidate.defaultSpaceLocation.trim())
    ) {
      throw new Error("Invalid default Space location")
    }
    patch.defaultSpaceLocation = candidate.defaultSpaceLocation
  }
  return patch
}

function syncPreflightApproval(value: unknown): EidosSyncPreflightApproval {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid Sync scope approval")
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.manifestId !== "string" ||
    candidate.manifestId.length !== 64 ||
    typeof candidate.confirmWarnings !== "boolean"
  ) {
    throw new Error("Invalid Sync scope approval")
  }
  return {
    manifestId: candidate.manifestId,
    confirmWarnings: candidate.confirmWarnings,
  }
}

export function registerIpc(
  controller: WindowController,
  services: EidosLiteServiceEnvironment,
  syncControl: SyncControlPlane,
  options: {
    syncFailuresForTesting?: readonly PackagedSyncFault[]
  } = {}
): { close(): Promise<void> } {
  const syncExecutor = new SyncExecutor(
    syncControl,
    options.syncFailuresForTesting
  )
  const syncQueue = new BackgroundSyncQueue({
    store: new SyncQueueStore(path.join(app.getPath("userData"))),
  })
  const attachedSenders = new Set<number>()
  const automaticCheckpointUnsubscribers = new Map<number, () => void>()
  const csvSourcesBySender = new Map<number, Map<string, RegisteredCsvSource>>()
  const csvSourceCleanupSenders = new Set<number>()
  const sourcesForSender = (sender: Electron.WebContents) => {
    let sources = csvSourcesBySender.get(sender.id)
    if (!sources) {
      sources = new Map()
      csvSourcesBySender.set(sender.id, sources)
    }
    const now = Date.now()
    for (const [token, source] of sources) {
      if (source.expiresAtMs <= now) sources.delete(token)
    }
    if (!csvSourceCleanupSenders.has(sender.id)) {
      csvSourceCleanupSenders.add(sender.id)
      sender.once("destroyed", () => {
        csvSourcesBySender.delete(sender.id)
        csvSourceCleanupSenders.delete(sender.id)
      })
    }
    return sources
  }
  const requireCsvSource = (
    sender: Electron.WebContents,
    token: unknown
  ): RegisteredCsvSource => {
    if (typeof token !== "string" || !token) {
      throw new Error("Invalid CSV selection")
    }
    const source = sourcesForSender(sender).get(token)
    if (!source) {
      throw new Error(
        "The selected CSV is no longer available; choose it again"
      )
    }
    source.expiresAtMs = Date.now() + CSV_SOURCE_TTL_MS
    return source
  }
  const attachSyncQueue = async (event: Electron.IpcMainInvokeEvent) => {
    const session = controller.requireSession(event.sender)
    const emitStatus = (status: EidosSyncQueueStatus) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.syncQueueChanged, status)
      }
    }
    const status = await syncQueue.attach({
      spaceId: session.canonical.id,
      execute: () =>
        syncExecutor.run(session, (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.syncProgress, progress)
          }
        }),
      emit: emitStatus,
    })
    if (!attachedSenders.has(event.sender.id)) {
      attachedSenders.add(event.sender.id)
      automaticCheckpointUnsubscribers.set(
        event.sender.id,
        session.onAutomaticCheckpoint(() => {
          void (async () => {
            try {
              if (await session.officialSyncRemoteUrl()) {
                await syncQueue.enqueue(
                  session.canonical.id,
                  "local-checkpoint"
                )
              }
            } catch (error) {
              console.warn(
                "Could not queue the automatic checkpoint for Eidos Sync",
                error
              )
            }
          })()
        })
      )
      event.sender.once("destroyed", () => {
        attachedSenders.delete(event.sender.id)
        automaticCheckpointUnsubscribers.get(event.sender.id)?.()
        automaticCheckpointUnsubscribers.delete(event.sender.id)
        void syncQueue.detach(session.canonical.id)
      })
    }
    return { session, status }
  }
  ipcMain.handle(IPC_CHANNELS.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    services,
  }))
  ipcMain.handle(IPC_CHANNELS.preferencesGet, () => controller.getPreferences())
  ipcMain.handle(IPC_CHANNELS.preferencesUpdate, (_event, value: unknown) =>
    controller.updatePreferences(preferencesPatch(value))
  )
  ipcMain.handle(IPC_CHANNELS.preferencesChooseSpaceLocation, (event) =>
    controller.chooseDefaultSpaceLocation(event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.settingsOpen, () => {
    controller.showSettingsWindow()
  })
  ipcMain.handle(
    IPC_CHANNELS.settingsOpenDestination,
    (_event, value: unknown) => {
      if (
        value !== "documentation" &&
        value !== "website" &&
        value !== "logs"
      ) {
        throw new Error("Invalid Settings destination")
      }
      return controller.openSettingsDestination(
        value as EidosLiteSettingsDestination
      )
    }
  )
  ipcMain.handle(IPC_CHANNELS.diagnostics, (event) =>
    controller.diagnostics(event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.copyDiagnostics, (event) =>
    controller.copyDiagnostics(event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.openSpace, (event) =>
    controller.chooseAndBindSpace(event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.newSpace, (event) =>
    controller.newAndBindSpace(event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.recentSpaces, () => controller.listRecentSpaces())
  ipcMain.handle(IPC_CHANNELS.openRecentSpace, (event, id: unknown) =>
    controller.openRecentSpace(event.sender, requiredString(id, "recent Space"))
  )
  ipcMain.handle(IPC_CHANNELS.removeRecentSpace, (_event, id: unknown) =>
    controller.removeRecentSpace(requiredString(id, "recent Space"))
  )
  ipcMain.handle(
    IPC_CHANNELS.getSpace,
    (event) => controller.sessionFor(event.sender)?.snapshot() ?? null
  )
  ipcMain.handle(
    IPC_CHANNELS.refreshSpace,
    (event) => controller.sessionFor(event.sender)?.refresh() ?? null
  )
  ipcMain.handle(
    IPC_CHANNELS.refreshExplorer,
    (event) => controller.sessionFor(event.sender)?.refreshExplorer() ?? null
  )
  ipcMain.handle(
    IPC_CHANNELS.loadSpaceDirectory,
    (event, relativePath: unknown) =>
      controller
        .requireSession(event.sender)
        .loadDirectory(requiredString(relativePath, "Space directory"))
  )
  ipcMain.handle(IPC_CHANNELS.takeLaunchFile, (event) =>
    controller.takeLaunchEidosFile(event.sender)
  )
  ipcMain.handle(IPC_CHANNELS.openFile, (event, relativePath: unknown) => {
    if (typeof relativePath !== "string") throw new Error("Invalid file path")
    return controller.requireSession(event.sender).openEidosFile(relativePath)
  })
  ipcMain.handle(
    IPC_CHANNELS.previewTextFile,
    (event, relativePath: unknown) => {
      if (typeof relativePath !== "string") throw new Error("Invalid file path")
      return controller
        .requireSession(event.sender)
        .previewTextFile(relativePath)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.inspectFileIssue,
    (event, relativePath: unknown) => {
      if (typeof relativePath !== "string") throw new Error("Invalid file path")
      return controller
        .requireSession(event.sender)
        .inspectEidosFileIssue(relativePath)
    }
  )
  ipcMain.handle(IPC_CHANNELS.closeFile, (event, sessionId: unknown) => {
    if (typeof sessionId !== "string")
      throw new Error("Invalid runtime session")
    return controller.requireSession(event.sender).closeEidosFile(sessionId)
  })
  ipcMain.handle(
    IPC_CHANNELS.createEidosFile,
    (event, parentRelativePath: unknown, name: unknown) =>
      controller
        .requireSession(event.sender)
        .createEidosFile(
          optionalRelativePath(parentRelativePath),
          requiredString(name, "file name")
        )
  )
  ipcMain.handle(
    IPC_CHANNELS.createFolder,
    (event, parentRelativePath: unknown, name: unknown) =>
      controller
        .requireSession(event.sender)
        .createFolder(
          optionalRelativePath(parentRelativePath),
          requiredString(name, "folder name")
        )
  )
  ipcMain.handle(
    IPC_CHANNELS.renamePath,
    (event, relativePath: unknown, name: unknown) =>
      controller
        .requireSession(event.sender)
        .renamePath(
          requiredString(relativePath, "Space path"),
          requiredString(name, "new name")
        )
  )
  ipcMain.handle(
    IPC_CHANNELS.movePath,
    (event, relativePath: unknown, targetDirectory: unknown) =>
      controller
        .requireSession(event.sender)
        .movePath(
          requiredString(relativePath, "Space path"),
          optionalRelativePath(targetDirectory)
        )
  )
  ipcMain.handle(
    IPC_CHANNELS.copyPath,
    (event, relativePath: unknown, targetDirectory: unknown) =>
      controller
        .requireSession(event.sender)
        .copyPath(
          requiredString(relativePath, "Space path"),
          optionalRelativePath(targetDirectory)
        )
  )
  ipcMain.handle(IPC_CHANNELS.deletePath, (event, relativePath: unknown) =>
    controller.deletePath(
      event.sender,
      requiredString(relativePath, "Space path")
    )
  )
  ipcMain.handle(IPC_CHANNELS.importFiles, (event, targetDirectory: unknown) =>
    controller.chooseFilesToImport(
      event.sender,
      optionalRelativePath(targetDirectory)
    )
  )
  ipcMain.handle(
    IPC_CHANNELS.saveCsv,
    (event, suggestedName: unknown, bytes: unknown) =>
      controller.saveCsvFile(
        event.sender,
        requiredString(suggestedName, "CSV file name"),
        requiredBytes(bytes, "CSV content")
      )
  )
  ipcMain.handle(IPC_CHANNELS.selectCsv, async (event) => {
    controller.requireSession(event.sender)
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: "Import CSV as a new table",
      buttonLabel: "Choose CSV",
      defaultPath: app.getPath("downloads"),
      filters: [
        { name: "CSV", extensions: ["csv"] },
        { name: "Text", extensions: ["txt"] },
      ],
      properties: ["openFile"],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    const sourcePath = result.filePaths[0]
    if (result.canceled || !sourcePath) return null
    const stats = await fs.stat(sourcePath)
    if (!stats.isFile()) throw new Error("The selected CSV is not a file")
    if (stats.size > EIDOS_LITE_CSV_FILE_BYTES_MAX) {
      throw new Error("CSV files larger than 1 GiB are not supported")
    }
    const source: RegisteredCsvSource = {
      token: randomUUID(),
      sourcePath,
      fileName: path.basename(sourcePath),
      size: stats.size,
      modifiedAtMs: stats.mtimeMs,
      expiresAtMs: Date.now() + CSV_SOURCE_TTL_MS,
    }
    const sources = sourcesForSender(event.sender)
    while (sources.size >= CSV_SOURCES_PER_WINDOW_MAX) {
      const oldest = sources.keys().next().value
      if (typeof oldest !== "string") break
      sources.delete(oldest)
    }
    sources.set(source.token, source)
    return {
      token: source.token,
      fileName: source.fileName,
      size: source.size,
      modifiedAtMs: source.modifiedAtMs,
    } satisfies EidosLiteCsvSelection
  })
  ipcMain.handle(IPC_CHANNELS.releaseCsv, (event, token: unknown) => {
    if (typeof token !== "string") throw new Error("Invalid CSV selection")
    sourcesForSender(event.sender).delete(token)
  })
  ipcMain.handle(
    IPC_CHANNELS.runtimeCall,
    async (
      event,
      sessionId: unknown,
      method: unknown,
      args: unknown
    ): Promise<unknown> => {
      if (typeof sessionId !== "string")
        throw new Error("Invalid runtime session")
      if (
        typeof method !== "string" ||
        !runtimeMethods.has(method as RuntimeMethod)
      ) {
        throw new Error("Runtime method is not allowed")
      }
      if (!Array.isArray(args))
        throw new Error("Runtime arguments must be an array")
      const runtimeMethod = method as RuntimeMethod
      const runtimeArgs =
        runtimeMethod === "previewCsvFile" || runtimeMethod === "importCsvFile"
          ? [requireCsvSource(event.sender, args[0]), ...args.slice(1)]
          : args
      return controller
        .requireSession(event.sender)
        .callRuntime(
          sessionId,
          runtimeMethod,
          runtimeArgs as RuntimeCalls[RuntimeMethod]["args"]
        )
    }
  )
  ipcMain.handle(IPC_CHANNELS.enableVersioning, (event) =>
    controller.requireSession(event.sender).enableVersioning()
  )
  ipcMain.handle(
    IPC_CHANNELS.createCheckpoint,
    async (event, message: unknown) => {
      if (message !== undefined && typeof message !== "string") {
        throw new Error("Invalid checkpoint message")
      }
      const session = controller.requireSession(event.sender)
      const checkpointRunId = randomUUID()
      const checkpointStartedAtMs = Date.now()
      const spaceKey = logCorrelationKey(session.canonical.id)
      eidosLiteLogger()?.info("version.checkpoint.started", {
        checkpointRunId,
        spaceKey,
      })
      let snapshot
      try {
        snapshot = await session.createCheckpoint(message)
      } catch (error) {
        eidosLiteLogger()?.error(
          "version.checkpoint.failed",
          {
            checkpointRunId,
            spaceKey,
            durationMs: Math.max(0, Date.now() - checkpointStartedAtMs),
          },
          error
        )
        throw error
      }
      const localCompletedAtMs = Date.now()
      eidosLiteLogger()?.info("version.checkpoint.local-completed", {
        checkpointRunId,
        spaceKey,
        durationMs: Math.max(0, localCompletedAtMs - checkpointStartedAtMs),
      })
      // The local checkpoint is already durable. Account lookup, queue-store I/O,
      // and Hosted Sync scheduling must not extend the Save version interaction.
      // The scheduler deliberately returns void so future callers cannot await
      // this cloud-only tail by accident.
      scheduleCheckpointSyncAfterLocalSave({
        run: async () => {
          if (await session.officialSyncRemoteUrl()) {
            await attachSyncQueue(event)
            await syncQueue.enqueue(session.canonical.id, "local-checkpoint")
            eidosLiteLogger()?.info("version.checkpoint.sync-queued", {
              checkpointRunId,
              spaceKey,
              delayMs: Math.max(0, Date.now() - localCompletedAtMs),
            })
          } else {
            eidosLiteLogger()?.debug("version.checkpoint.sync-skipped", {
              checkpointRunId,
              spaceKey,
              reason: "not-connected",
            })
          }
        },
        onError: (error) => {
          eidosLiteLogger()?.warn(
            "version.checkpoint.sync-queue-failed",
            {
              checkpointRunId,
              spaceKey,
              delayMs: Math.max(0, Date.now() - localCompletedAtMs),
            },
            error
          )
          console.warn(
            "Could not queue the new checkpoint for Eidos Sync",
            error
          )
        },
      })
      return snapshot
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.versionChanges,
    (event, limit: unknown, after: unknown) => {
      if (limit !== undefined && typeof limit !== "number") {
        throw new Error("Invalid change limit")
      }
      if (after !== undefined && typeof after !== "string") {
        throw new Error("Invalid change cursor")
      }
      return controller
        .requireSession(event.sender)
        .getVersionChanges(limit, after)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.versionHistory,
    (event, limit: unknown, after: unknown) => {
      if (limit !== undefined && typeof limit !== "number") {
        throw new Error("Invalid history limit")
      }
      if (after !== undefined && typeof after !== "string") {
        throw new Error("Invalid history cursor")
      }
      return controller
        .requireSession(event.sender)
        .getVersionHistory(limit, after)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.versionDiff,
    (
      event,
      commitId: unknown,
      parentId: unknown,
      limit: unknown,
      after: unknown
    ) => {
      if (typeof commitId !== "string") throw new Error("Invalid checkpoint")
      if (
        parentId !== undefined &&
        parentId !== null &&
        typeof parentId !== "string"
      ) {
        throw new Error("Invalid checkpoint parent")
      }
      if (limit !== undefined && typeof limit !== "number") {
        throw new Error("Invalid diff limit")
      }
      if (after !== undefined && typeof after !== "string") {
        throw new Error("Invalid diff cursor")
      }
      return controller
        .requireSession(event.sender)
        .getVersionDiff(
          commitId,
          parentId as string | null | undefined,
          limit,
          after
        )
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.versionPathDiff,
    (
      event,
      relativePath: unknown,
      commitId: unknown,
      parentId: unknown,
      tableName: unknown,
      rowAfter: unknown
    ) => {
      if (typeof relativePath !== "string") {
        throw new Error("Invalid diff path")
      }
      if (
        commitId !== undefined &&
        commitId !== null &&
        typeof commitId !== "string"
      ) {
        throw new Error("Invalid diff checkpoint")
      }
      if (
        parentId !== undefined &&
        parentId !== null &&
        typeof parentId !== "string"
      ) {
        throw new Error("Invalid diff checkpoint parent")
      }
      if (
        tableName !== undefined &&
        (typeof tableName !== "string" || !tableName.trim())
      ) {
        throw new Error("Invalid diff table")
      }
      if (
        rowAfter !== undefined &&
        (typeof rowAfter !== "string" || !rowAfter.trim())
      ) {
        throw new Error("Invalid row-diff cursor")
      }
      return controller
        .requireSession(event.sender)
        .getVersionPathDiff(
          relativePath,
          commitId as string | null | undefined,
          parentId as string | null | undefined,
          tableName as string | undefined,
          rowAfter as string | undefined
        )
    }
  )
  ipcMain.handle(IPC_CHANNELS.versionCancel, (event) => {
    controller.requireSession(event.sender).cancelVersionReads()
  })
  ipcMain.handle(
    IPC_CHANNELS.trackedIgnoredPaths,
    (event, limit: unknown, after: unknown) => {
      if (limit !== undefined && typeof limit !== "number") {
        throw new Error("Invalid ignored-path limit")
      }
      if (after !== undefined && typeof after !== "string") {
        throw new Error("Invalid ignored-path cursor")
      }
      return controller
        .requireSession(event.sender)
        .getTrackedIgnoredPaths(limit, after)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.untrackIgnoredPaths,
    (event, expectedHead: unknown) => {
      if (typeof expectedHead !== "string") {
        throw new Error("Invalid ignored-path migration request")
      }
      return controller
        .requireSession(event.sender)
        .untrackIgnoredPaths(expectedHead)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.versionTextDiff,
    (event, commitId: unknown, parentId: unknown, relativePath: unknown) => {
      if (typeof commitId !== "string") throw new Error("Invalid checkpoint")
      if (parentId !== null && typeof parentId !== "string") {
        throw new Error("Invalid checkpoint parent")
      }
      if (typeof relativePath !== "string") {
        throw new Error("Invalid version text path")
      }
      return controller
        .requireSession(event.sender)
        .getVersionTextDiff(commitId, parentId, relativePath)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.versionWorkingTextDiff,
    (event, expectedHead: unknown, relativePath: unknown) => {
      if (expectedHead !== null && typeof expectedHead !== "string") {
        throw new Error("Invalid expected checkpoint")
      }
      if (typeof relativePath !== "string") {
        throw new Error("Invalid working text path")
      }
      return controller
        .requireSession(event.sender)
        .getWorkingTextDiff(expectedHead, relativePath)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.restoreCheckpoint,
    (event, commitId: unknown, expectedHead: unknown) => {
      if (typeof commitId !== "string" || typeof expectedHead !== "string") {
        throw new Error("Invalid restore request")
      }
      return controller
        .requireSession(event.sender)
        .restoreCheckpoint(commitId, expectedHead)
    }
  )
  const currentRemoteUrl = async (event: Electron.IpcMainInvokeEvent) =>
    (await controller.sessionFor(event.sender)?.officialSyncRemoteUrl()) ?? null
  const repositoryDisplayNameRepairs = new Set<string>()
  ipcMain.handle(IPC_CHANNELS.syncStatus, async (event) => {
    const session = controller.sessionFor(event.sender)
    const remoteUrl = await currentRemoteUrl(event)
    const status = await syncControl.status(remoteUrl)
    if (session && remoteUrl && status.entitlement.state === "read-write") {
      const spaceKey = logCorrelationKey(session.canonical.id)
      const displayName = cloudDisplayNameForLocalSpace(session.canonical.name)
      const repairKey = `${remoteUrl}\0${displayName}`
      if (!repositoryDisplayNameRepairs.has(repairKey)) {
        repositoryDisplayNameRepairs.add(repairKey)
        void syncControl
          .repairLegacyRepositoryDisplayName(remoteUrl, displayName)
          .then((repaired) => {
            if (repaired) {
              eidosLiteLogger()?.info("sync.repository-display-name.repaired", {
                spaceKey,
              })
            }
          })
          .catch((error) => {
            repositoryDisplayNameRepairs.delete(repairKey)
            eidosLiteLogger()?.warn(
              "sync.repository-display-name.repair-failed",
              { spaceKey },
              error
            )
          })
      }
    }
    return status
  })
  ipcMain.handle(IPC_CHANNELS.syncSignIn, async (event) =>
    syncControl.signIn(await currentRemoteUrl(event))
  )
  ipcMain.handle(IPC_CHANNELS.syncSignOut, async (event) => {
    const session = controller.sessionFor(event.sender)
    const remoteUrl = await currentRemoteUrl(event)
    await session?.clearHostedSyncCredentials()
    const status = await syncControl.signOut(remoteUrl)
    if (session && remoteUrl) {
      const attached = await attachSyncQueue(event)
      const failure = classifySyncFailure(
        Object.assign(new Error("Sign in to resume Eidos Sync"), {
          code: "authentication-required",
        }),
        "authorization"
      )
      const response: Extract<EidosSyncRunResponse, { ok: false }> = {
        ok: false,
        runId: "signed-out",
        failure,
        telemetry: {
          startedAtMs: Date.now(),
          completedAtMs: Date.now(),
          durationMs: 0,
          phases: [],
        },
      }
      await syncQueue.pause(attached.session.canonical.id, response)
    }
    return status
  })
  ipcMain.handle(IPC_CHANNELS.syncPreflight, (event) =>
    controller.requireSession(event.sender).syncPreflight()
  )
  ipcMain.handle(IPC_CHANNELS.syncEnable, async (event, value: unknown) => {
    const session = controller.requireSession(event.sender)
    const spaceKey = logCorrelationKey(session.canonical.id)
    const tracker = new SyncRunTracker(
      randomUUID(),
      (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC_CHANNELS.syncProgress, progress)
        }
      },
      Date.now,
      "connect"
    )
    let currentPhase: EidosSyncPhase = "authorization"
    const transition = (phase: EidosSyncPhase, detail: string) => {
      currentPhase = phase
      tracker.transition(phase, detail)
    }
    let stage = "existing-remote"
    eidosLiteLogger()?.info("sync.enable.started", { spaceKey })
    try {
      transition("authorization", "Checking account access")
      const existing = await session.officialSyncRemoteUrl()
      if (existing) {
        eidosLiteLogger()?.info("sync.enable.already-connected", { spaceKey })
        const status = await syncControl.status(existing)
        const telemetry = tracker.complete("Space is connected")
        return { ok: true as const, status, telemetry }
      }
      stage = "preflight"
      transition("analyze", "Preparing this Space")
      const approval = syncPreflightApproval(value)
      await session.assertSyncPreflight(approval)
      await session.assertHostedSyncReady()
      stage = "provision"
      transition("authorization", "Creating secure cloud access")
      const provisioned = await syncControl.provisionRepository(
        session.canonical.id,
        cloudDisplayNameForLocalSpace(session.canonical.name)
      )
      eidosLiteLogger()?.info("sync.enable.remote-ready", { spaceKey })
      stage = "initial-push"
      transition("push", "Uploading this Space")
      await session.enableHostedSync(
        provisioned.remoteUrl,
        provisioned.accessToken,
        approval
      )
      stage = "status"
      transition("validate", "Finishing the connection")
      const status = await syncControl.status(provisioned.remoteUrl)
      const telemetry = tracker.complete("Space is connected")
      eidosLiteLogger()?.info("sync.enable.completed", { spaceKey })
      return { ok: true as const, status, telemetry }
    } catch (error) {
      const failure = classifySyncFailure(error, currentPhase)
      const telemetry = tracker.fail(failure.message)
      eidosLiteLogger()?.error(
        "sync.enable.failed",
        {
          spaceKey,
          stage,
          failureCode: failure.code,
          status: failure.status,
          retryable: failure.retryable,
        },
        error
      )
      return {
        ok: false as const,
        runId: tracker.runId,
        failure,
        telemetry,
      }
    }
  })
  ipcMain.handle(IPC_CHANNELS.syncRepositories, () =>
    syncControl.repositories()
  )
  ipcMain.handle(
    IPC_CHANNELS.syncClone,
    async (event, remoteUrl: unknown, displayName: unknown) => {
      const remote = requiredString(remoteUrl, "Hosted Remote")
      const suggestedName =
        displayName === undefined
          ? undefined
          : requiredString(displayName, "Space name")
      const remoteKey = logCorrelationKey(remote)
      const startedAtMs = Date.now()
      const tracker = new SyncRunTracker(
        randomUUID(),
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.syncProgress, progress)
          }
        },
        Date.now,
        "clone"
      )
      let currentPhase: EidosSyncPhase = "authorization"
      const transition = (phase: EidosSyncPhase, detail: string) => {
        currentPhase = phase
        tracker.transition(phase, detail)
      }
      eidosLiteLogger()?.info("sync.clone.started", { remoteKey })
      try {
        transition("authorization", "Checking account access")
        const access = await syncControl.repositoryAccess(remote)
        transition("drain", "Choose where to keep the local Space")
        const result = await controller.cloneAndBindSpace(
          event.sender,
          remote,
          access.accessToken,
          suggestedName,
          (phase) => {
            if (phase === "preparing") {
              transition("drain", "Preparing the local Space")
            } else if (phase === "cloning") {
              transition("fetch", "Downloading the Space")
            } else if (phase === "validating") {
              transition("validate", "Checking downloaded files")
            } else {
              transition("reopen", "Opening the local Space")
            }
          }
        )
        const telemetry = tracker.complete(
          result ? "Space is ready" : "Download cancelled"
        )
        eidosLiteLogger()?.info("sync.clone.completed", {
          remoteKey,
          durationMs: Math.max(0, Date.now() - startedAtMs),
          cancelled: result === null,
        })
        return { ok: true as const, snapshot: result, telemetry }
      } catch (error) {
        const failure = classifySyncFailure(error, currentPhase)
        const telemetry = tracker.fail(failure.message)
        eidosLiteLogger()?.error(
          "sync.clone.failed",
          {
            remoteKey,
            durationMs: Math.max(0, Date.now() - startedAtMs),
            failureCode: failure.code,
            status: failure.status,
            retryable: failure.retryable,
          },
          error
        )
        return {
          ok: false as const,
          runId: tracker.runId,
          failure,
          telemetry,
        }
      }
    }
  )
  ipcMain.handle(IPC_CHANNELS.syncRun, async (event) => {
    const { session } = await attachSyncQueue(event)
    return syncQueue.runNow(session.canonical.id)
  })
  ipcMain.handle(IPC_CHANNELS.syncQueueStatus, async (event) => {
    const session = controller.sessionFor(event.sender)
    if (!session) return null
    await attachSyncQueue(event)
    return syncQueue.status(session.canonical.id)
  })
  ipcMain.handle(IPC_CHANNELS.syncRecoverLocal, async (event) => {
    const session = controller.requireSession(event.sender)
    const remoteUrl = await session.officialSyncRemoteUrl()
    if (!remoteUrl) throw new Error("This Space is not connected to Eidos Sync")
    const access = await syncControl.repositoryAccess(remoteUrl)
    await session.assertHostedDivergence(access.accessToken)
    return controller.copyLocalRecoverySpace(event.sender)
  })
  ipcMain.handle(IPC_CHANNELS.syncRecoverHosted, async (event) => {
    const session = controller.requireSession(event.sender)
    const remoteUrl = await session.officialSyncRemoteUrl()
    if (!remoteUrl) throw new Error("This Space is not connected to Eidos Sync")
    const access = await syncControl.repositoryAccess(remoteUrl)
    await session.assertHostedDivergence(access.accessToken)
    return controller.cloneHostedRecoverySpace(
      event.sender,
      remoteUrl,
      access.accessToken
    )
  })
  ipcMain.handle(IPC_CHANNELS.syncOpenHelp, async (_event, value: unknown) => {
    const destination = requiredString(
      value,
      "Sync help destination"
    ) as EidosSyncHelpDestination
    if (destination !== "account" && destination !== "download") {
      throw new Error("Invalid Sync help destination")
    }
    await shell.openExternal(
      destination === "account"
        ? services.accountOrigin
        : "https://eidos.space/download"
    )
  })
  ipcMain.handle(IPC_CHANNELS.revealPath, (event, relativePath: unknown) => {
    if (typeof relativePath !== "string") throw new Error("Invalid file path")
    return controller.reveal(event.sender, relativePath)
  })
  ipcMain.handle(IPC_CHANNELS.openPath, (event, relativePath: unknown) => {
    if (typeof relativePath !== "string") throw new Error("Invalid file path")
    return controller.openPath(event.sender, relativePath)
  })
  return {
    close: () => syncQueue.close(),
  }
}
