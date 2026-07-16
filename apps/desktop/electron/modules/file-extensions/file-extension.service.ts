import { watch, type FSWatcher } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { app } from "electron"
import { IpcMethod, IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  SPACE_FILE_PREVIEW_MAX_BYTES,
  SpaceFiles,
} from "@eidos.space/file-space"
import {
  canonicalExtensionPackagePath,
  createExtensionCommandTemplate,
  createExtensionPanelTemplate,
  createExtensionTextEditorTemplate,
  isIgnoredExtensionPackagePath,
  type ExtensionFileEditorSelector,
  type ExtensionPackageInspection,
  type ExtensionPanelContribution,
  type NormalizedExtensionPermissions,
} from "@eidos.space/extension-manifest"
import {
  discoverExtensionPackages,
  inspectExtensionPackageSnapshot,
} from "@eidos.space/extension-manifest/node"
import {
  type ExtensionRuntimeJsonValue,
  type ExtensionRuntimeRpcRequest,
} from "@eidos.space/extension-runtime"
import {
  compileExtensionSurface,
  compileExtensionWorker,
} from "@eidos.space/extension-runtime/compiler"
import { createExtensionSurfaceSource } from "@eidos.space/extension-runtime/surface"
import {
  assertExtensionSnapshotIdentity,
  type ExtensionLocalState,
  type ExtensionPermissionGrant,
  type ExtensionSnapshotIdentity,
  type LegacyExtensionMapping,
} from "@eidos.space/extension-state"
import { BetterSqlite3ExtensionStateStore } from "@eidos.space/extension-state/better-sqlite3"
import { minimatch } from "minimatch"

import { IpcInjectable, Inject } from "../../common/di"
import {
  withFileSpaceOperationLock,
  withFileSpaceReadLock,
} from "../space-management/file-space-operation-lock"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceResourceLifecycle } from "../space-management/space-resource-lifecycle"
import { SpaceRegistry } from "../space-management/space-registry"
import {
  ensureExtensionStateDatabasePath,
  resolveExtensionProjectPaths,
} from "./extension-paths"
import { FileExtensionInstallManager } from "./file-extension-install-manager"
import { FileExtensionDocumentManager } from "./file-extension-document-manager"
import { FileExtensionDevelopmentManager } from "./file-extension-development-manager"
import { writeExtensionTemplate } from "./extension-template-writer"
import {
  FileExtensionRuntimeError,
  type FileExtensionRuntimeDescriptor,
  FileExtensionRuntimeManager,
} from "./runtime/file-extension-runtime-manager"
import type {
  FileExtensionChangedEvent,
  FileExtensionConfirmLegacyPortingRequest,
  FileExtensionDevelopmentChangedEvent,
  FileExtensionDevelopmentDiagnostic,
  FileExtensionDevelopmentSessionSummary,
  FileExtensionApplyInstallRequest,
  FileExtensionCommandPalette,
  FileExtensionCommandRequest,
  FileExtensionCommandSummary,
  FileExtensionDiscoveryResult,
  FileExtensionEditorSessionRequest,
  FileExtensionEditorSummary,
  FileExtensionGrantRequest,
  FileExtensionGitHubInstallRequest,
  FileExtensionInstallPreview,
  FileExtensionInstallResult,
  FileExtensionOpenEditorRequest,
  FileExtensionOpenEditorResult,
  FileExtensionOpenPanelRequest,
  FileExtensionOpenPanelResult,
  FileExtensionPanelSummary,
  FileExtensionPanelSessionRequest,
  FileExtensionPackageSummary,
  FileExtensionRetireLegacyPortingRequest,
  FileExtensionSnapshotRequest,
  FileExtensionStopDevelopmentSessionRequest,
  FileExtensionResolveConflictRequest,
  FileExtensionSurfaceRequestResult,
  FileExtensionSemanticUiRequest,
  FileExtensionSemanticUiResponse,
  FileExtensionTemplateRequest,
  FileExtensionTemplateResult,
  FileExtensionUninstallRequest,
  FileExtensionWatchResult,
} from "./types"

const FILE_EXTENSION_ROOT = ".eidos/extensions" as const
const WATCH_DEBOUNCE_MS = 120
const SEMANTIC_UI_TIMEOUT_MS = 55_000
const MAX_OPEN_EXTENSION_PANELS_PER_SPACE = 32
const LOCAL_EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/
const FILE_EDITOR_MEDIA_TYPES: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  html: "text/html",
  js: "text/javascript",
  json: "application/json",
  jsx: "text/jsx",
  markdown: "text/markdown",
  md: "text/markdown",
  py: "text/x-python",
  sh: "text/x-shellscript",
  sql: "application/sql",
  toml: "application/toml",
  ts: "text/typescript",
  tsv: "text/tab-separated-values",
  tsx: "text/tsx",
  txt: "text/plain",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
}

interface FileExtensionWatcher {
  root: string
  watcher: FSWatcher
  generation: number
  timer?: ReturnType<typeof setTimeout>
  pendingPackageIds: Set<string>
  unknownChange: boolean
}

interface PendingSemanticUiRequest {
  request: Exclude<FileExtensionSemanticUiRequest, { kind: "notice" }>
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface PreparedFileExtensionCommand {
  descriptor: FileExtensionRuntimeDescriptor
}

interface PreparedFileExtensionEditor {
  generation: string
  source: string
  editable: boolean
}

interface PreparedFileExtensionPanel {
  generation: string
  source: string
  title: string
}

interface FileExtensionPanelSession extends FileExtensionOpenPanelResult {
  spaceId: string
  snapshot: ExtensionSnapshotIdentity
  key: string
  suspended: boolean
}

function requestedGrants(
  permissions: NormalizedExtensionPermissions | undefined
): ExtensionPermissionGrant[] {
  if (!permissions) return []
  return [
    ...permissions.files.read.map((value) => ({
      kind: "files.read" as const,
      value,
    })),
    ...permissions.files.write.map((value) => ({
      kind: "files.write" as const,
      value,
    })),
    ...permissions.network.map((value) => ({
      kind: "network" as const,
      value,
    })),
  ]
}

function fileEditorMediaType(relativePath: string): string {
  const extension = path.posix.extname(relativePath).slice(1).toLowerCase()
  return FILE_EDITOR_MEDIA_TYPES[extension] ?? "text/plain"
}

function fileEditorLanguageId(relativePath: string): string | undefined {
  const extension = path.posix.extname(relativePath).slice(1).toLowerCase()
  if (extension === "md" || extension === "markdown") return "markdown"
  return extension || undefined
}

function fileEditorSelectorMatches(
  relativePath: string,
  mediaType: string,
  selector: ExtensionFileEditorSelector
): boolean {
  const patternMatches =
    !selector.filenamePattern ||
    minimatch(relativePath, selector.filenamePattern, {
      dot: true,
      matchBase: true,
      nocomment: true,
      nonegate: true,
      nocase: false,
    })
  const mediaTypeMatches =
    !selector.mediaType ||
    minimatch(mediaType, selector.mediaType, {
      nocomment: true,
      nonegate: true,
      nocase: true,
    })
  return patternMatches && mediaTypeMatches
}

@IpcInjectable("file-extensions", { exposeMode: "decorated" })
export class FileExtensionService extends IpcServiceBase {
  private readonly watchers = new Map<string, FileExtensionWatcher>()
  private readonly changeGenerations = new Map<string, number>()
  private readonly bundleCache = new Map<string, string>()
  private readonly packageDirectories = new Map<string, Map<string, string>>()
  private readonly pendingDocumentFlushes = new Map<
    string,
    Promise<Error | undefined>
  >()
  private readonly pendingSemanticUi = new Map<
    string,
    PendingSemanticUiRequest
  >()
  private readonly panelSessions = new Map<string, FileExtensionPanelSession>()
  private readonly panelSessionIdsByKey = new Map<string, string>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(MainWindowProvider)
    private readonly windowProvider: MainWindowProvider,
    @Inject(FileExtensionRuntimeManager)
    private readonly runtimeManager: FileExtensionRuntimeManager,
    @Inject(FileExtensionInstallManager)
    private readonly installManager: FileExtensionInstallManager = new FileExtensionInstallManager(),
    @Inject(FileExtensionDocumentManager)
    private readonly documentManager: FileExtensionDocumentManager = new FileExtensionDocumentManager(
      windowProvider
    ),
    @Inject(FileExtensionDevelopmentManager)
    private readonly developmentManager: FileExtensionDevelopmentManager = new FileExtensionDevelopmentManager(),
    @Inject(SpaceResourceLifecycle)
    resourceLifecycle: SpaceResourceLifecycle | undefined = undefined
  ) {
    super()
    resourceLifecycle?.register(
      "file-extensions",
      async (spacePath) => {
        const space = this.registry.getSpaceByPath(spacePath)
        if (space) {
          await this.disposeSpaceResources(
            space.id,
            "File extension Space was released"
          )
        }
      },
      () => this.disposeAllResources("Eidos is shutting down")
    )
  }

  @IpcMethod()
  async discover(spaceId: string): Promise<FileExtensionDiscoveryResult> {
    const space = this.getFileSpace(spaceId)
    return withFileSpaceOperationLock(spaceId, () =>
      this.discoverUnlocked(spaceId, space.path)
    )
  }

  @IpcMethod()
  async startDevelopmentSession(
    spaceId: string,
    request: FileExtensionSnapshotRequest
  ): Promise<FileExtensionDevelopmentSessionSummary> {
    const space = this.getFileSpace(spaceId)
    assertExtensionSnapshotIdentity(request)
    const snapshot: ExtensionSnapshotIdentity = { ...request }
    const session = await withFileSpaceOperationLock(spaceId, async () => {
      const paths = await resolveExtensionProjectPaths(space.path)
      if (!paths.extensionsRoot) {
        throw new Error("Extension package is no longer installed")
      }
      const discovery = await discoverExtensionPackages(paths.extensionsRoot, {
        hostVersion: app.getVersion(),
      })
      const extension = discovery.packages.find(
        (candidate) => candidate.canonicalId === snapshot.packageId
      )
      if (
        !extension ||
        extension.status !== "ready" ||
        extension.contentDigest !== snapshot.contentDigest ||
        extension.permissionHash !== snapshot.permissionHash
      ) {
        throw new Error(
          "Extension package changed; inspect the current source before starting development"
        )
      }
      const store = new BetterSqlite3ExtensionStateStore(
        await ensureExtensionStateDatabasePath(space.path)
      )
      try {
        this.assertNoLegacyPortingConflict(store, snapshot.packageId)
        const localState = store.get(snapshot)
        if (!localState.trusted || !localState.enabled) {
          throw new Error(
            "Only an exact trusted and enabled snapshot can start a development session"
          )
        }
        this.rememberPackageDirectory(
          spaceId,
          extension.directoryName,
          snapshot.packageId
        )
        return this.developmentManager.start({
          spaceId,
          directoryName: extension.directoryName,
          snapshot,
          requestedGrants: localState.requestedGrants,
          granted: localState.granted,
        })
      } finally {
        store.close()
      }
    })
    const watcher = await this.startWatching(spaceId)
    if (!watcher.watching) {
      this.developmentManager.stop(
        spaceId,
        session.packageId,
        session.sessionId
      )
      throw new Error(
        "Extension source watching must be available before starting development"
      )
    }
    this.emitDevelopmentChange(spaceId, session)
    this.emitChange(spaceId)
    return session
  }

  @IpcMethod()
  async stopDevelopmentSession(
    spaceId: string,
    request: FileExtensionStopDevelopmentSessionRequest
  ): Promise<{ success: true }> {
    this.getFileSpace(spaceId)
    if (
      !request ||
      typeof request.packageId !== "string" ||
      !request.packageId ||
      typeof request.sessionId !== "string" ||
      !request.sessionId
    ) {
      throw new Error("A current extension development session is required")
    }
    await this.documentManager.flushPackage(spaceId, request.packageId)
    const stopped = this.developmentManager.stop(
      spaceId,
      request.packageId,
      request.sessionId
    )
    if (!stopped) {
      throw new Error("Extension development session is no longer active")
    }
    this.invalidatePackageRuntime(
      spaceId,
      request.packageId,
      "Extension development session stopped"
    )
    this.emitDevelopmentStopped(spaceId, stopped)
    this.emitChange(spaceId)
    return { success: true }
  }

  @IpcMethod()
  async trust(
    spaceId: string,
    request: FileExtensionSnapshotRequest
  ): Promise<ExtensionLocalState> {
    this.assertNoDevelopmentSession(spaceId, request.packageId)
    await this.documentManager.flushPackage(spaceId, request.packageId)
    const state = await this.mutateCurrentSnapshot(
      spaceId,
      request,
      (store, current) => store.trust(current.snapshot, current.requestedGrants)
    )
    this.invalidatePackageRuntime(
      spaceId,
      request.packageId,
      "Extension trust state changed"
    )
    this.emitChange(spaceId)
    return state
  }

  @IpcMethod()
  async revokeTrust(
    spaceId: string,
    request: FileExtensionSnapshotRequest
  ): Promise<ExtensionLocalState> {
    this.assertNoDevelopmentSession(spaceId, request.packageId)
    await this.documentManager.flushPackage(spaceId, request.packageId)
    const state = await this.mutateCurrentSnapshot(
      spaceId,
      request,
      (store, current) => store.revokeTrust(current.snapshot)
    )
    this.invalidatePackageRuntime(
      spaceId,
      request.packageId,
      "Extension trust was revoked"
    )
    this.emitChange(spaceId)
    return state
  }

  @IpcMethod()
  async setEnabled(
    spaceId: string,
    request: FileExtensionSnapshotRequest,
    enabled: boolean
  ): Promise<ExtensionLocalState> {
    this.assertNoDevelopmentSession(spaceId, request.packageId)
    if (typeof enabled !== "boolean") {
      throw new Error("Extension enablement must be a boolean")
    }
    await this.documentManager.flushPackage(spaceId, request.packageId)
    const state = await this.mutateCurrentSnapshot(
      spaceId,
      request,
      (store, current) => store.setEnabled(current.snapshot, enabled)
    )
    this.invalidatePackageRuntime(
      spaceId,
      request.packageId,
      enabled ? "Extension enablement changed" : "Extension was disabled"
    )
    this.emitChange(spaceId)
    return state
  }

  @IpcMethod()
  async setGrant(
    spaceId: string,
    request: FileExtensionGrantRequest
  ): Promise<ExtensionLocalState> {
    this.assertNoDevelopmentSession(spaceId, request.packageId)
    if (typeof request?.granted !== "boolean") {
      throw new Error("Extension grant state must be a boolean")
    }
    await this.documentManager.flushPackage(spaceId, request.packageId)
    const state = await this.mutateCurrentSnapshot(
      spaceId,
      request,
      (store, current) =>
        store.setGrant(current.snapshot, request.grant, request.granted)
    )
    this.invalidatePackageRuntime(
      spaceId,
      request.packageId,
      "Extension permission grants changed"
    )
    this.emitChange(spaceId)
    return state
  }

  @IpcMethod()
  async confirmLegacyPorting(
    spaceId: string,
    request: FileExtensionConfirmLegacyPortingRequest
  ): Promise<LegacyExtensionMapping> {
    const space = this.getFileSpace(spaceId)
    assertExtensionSnapshotIdentity(request)
    this.assertNoDevelopmentSession(spaceId, request.packageId)
    const result = await withFileSpaceOperationLock(spaceId, async () => {
      const paths = await resolveExtensionProjectPaths(space.path)
      if (!paths.extensionsRoot) {
        throw new Error("Extension package is no longer installed")
      }
      const current = await inspectExtensionPackageSnapshot(
        path.join(paths.extensionsRoot, request.packageId),
        { hostVersion: app.getVersion() }
      )
      const inspection = current.inspection
      if (
        inspection.status !== "ready" ||
        inspection.canonicalId !== request.packageId ||
        inspection.contentDigest !== request.contentDigest ||
        inspection.permissionHash !== request.permissionHash
      ) {
        throw new Error(
          "Extension package changed; inspect the current source before linking its legacy source"
        )
      }
      const receipt = inspection.legacyPorting?.receipt
      if (!inspection.legacyPorting?.valid || !receipt) {
        throw new Error(
          "Extension package does not contain a valid legacy porting receipt"
        )
      }
      const store = new BetterSqlite3ExtensionStateStore(
        await ensureExtensionStateDatabasePath(space.path)
      )
      try {
        const recorded = store.recordLegacyExtensionMapping({
          legacyExtensionId: receipt.source.legacyExtensionId,
          legacySlug: receipt.source.legacySlug ?? undefined,
          canonicalPackageId: receipt.target.canonicalPackageId,
          archiveDigest: receipt.source.archiveDigest,
          candidateContribution: receipt.target.candidateContribution,
        })
        const mapping = recorded.active
          ? recorded
          : store.setLegacyExtensionMappingActive(
              recorded.legacyExtensionId,
              recorded.canonicalPackageId,
              true
            )
        return {
          mapping,
          affectedPackageIds: [
            mapping.canonicalPackageId,
            ...mapping.conflictingCanonicalPackageIds,
          ],
        }
      } finally {
        store.close()
      }
    })
    for (const packageId of new Set(result.affectedPackageIds)) {
      this.invalidatePackageRuntime(
        spaceId,
        packageId,
        "Legacy extension mapping changed"
      )
    }
    this.emitChange(spaceId)
    return result.mapping
  }

  @IpcMethod()
  async retireLegacyPorting(
    spaceId: string,
    request: FileExtensionRetireLegacyPortingRequest
  ): Promise<LegacyExtensionMapping> {
    const space = this.getFileSpace(spaceId)
    if (
      !request ||
      typeof request.legacyExtensionId !== "string" ||
      !request.legacyExtensionId ||
      typeof request.canonicalPackageId !== "string" ||
      !request.canonicalPackageId
    ) {
      throw new Error("A current legacy extension mapping is required")
    }
    this.assertNoDevelopmentSession(spaceId, request.canonicalPackageId)
    const result = await withFileSpaceOperationLock(spaceId, async () => {
      const store = new BetterSqlite3ExtensionStateStore(
        await ensureExtensionStateDatabasePath(space.path)
      )
      try {
        const affectedPackageIds = store
          .listLegacyExtensionMappings()
          .filter(
            (mapping) =>
              mapping.legacyExtensionId === request.legacyExtensionId ||
              mapping.canonicalPackageId === request.canonicalPackageId
          )
          .map((mapping) => mapping.canonicalPackageId)
        const mapping = store.setLegacyExtensionMappingActive(
          request.legacyExtensionId,
          request.canonicalPackageId,
          false
        )
        return { mapping, affectedPackageIds }
      } finally {
        store.close()
      }
    })
    for (const packageId of new Set(result.affectedPackageIds)) {
      this.invalidatePackageRuntime(
        spaceId,
        packageId,
        "Legacy extension mapping was retired"
      )
    }
    this.emitChange(spaceId)
    return result.mapping
  }

  @IpcMethod()
  async listCommandPalette(
    spaceId: string
  ): Promise<FileExtensionCommandPalette> {
    const discovery = await this.discover(spaceId)
    const commands: FileExtensionCommandSummary[] = []
    const panels: FileExtensionPanelSummary[] = []
    for (const extension of discovery.packages) {
      if (
        !this.isPackageExecutionAvailable(spaceId, extension) ||
        !extension.manifest ||
        !extension.canonicalId ||
        !extension.contentDigest ||
        !extension.permissionHash
      ) {
        continue
      }
      const snapshot = {
        packageId: extension.canonicalId,
        contentDigest: extension.contentDigest,
        permissionHash: extension.permissionHash,
      }
      const menus = extension.manifest.contributes.menus ?? {}
      commands.push(
        ...(extension.manifest.contributes.commands ?? []).map((command) => ({
          ...snapshot,
          ...command,
          extensionDisplayName: extension.manifest!.displayName,
          menus: Object.fromEntries(
            Object.entries(menus).flatMap(([menuId, items]) => {
              const matching = items.filter(
                (item) => item.command === command.id
              )
              return matching.length > 0 ? [[menuId, matching]] : []
            })
          ),
        }))
      )
      if (extension.manifest.entrypoints.ui) {
        panels.push(
          ...(extension.manifest.contributes.panels ?? []).map((panel) => ({
            ...snapshot,
            ...panel,
            extensionDisplayName: extension.manifest!.displayName,
          }))
        )
      }
    }
    return { commands, panels }
  }

  @IpcMethod()
  async listCommands(spaceId: string): Promise<FileExtensionCommandSummary[]> {
    return (await this.listCommandPalette(spaceId)).commands
  }

  @IpcMethod()
  async listFileEditors(
    spaceId: string,
    resourcePath: string
  ): Promise<FileExtensionEditorSummary[]> {
    const relativePath = this.canonicalPublicSpacePath(resourcePath)
    const mediaType = fileEditorMediaType(relativePath)
    const discovery = await this.discover(spaceId)
    return discovery.packages
      .flatMap((extension) => {
        const effectiveState = this.effectiveStateForSummary(spaceId, extension)
        if (
          !effectiveState ||
          !extension.manifest?.entrypoints.ui ||
          !extension.canonicalId ||
          !extension.contentDigest ||
          !extension.permissionHash ||
          !this.hasPathGrant(effectiveState, "files.read", relativePath)
        ) {
          return []
        }
        const snapshot = {
          packageId: extension.canonicalId,
          contentDigest: extension.contentDigest,
          permissionHash: extension.permissionHash,
        }
        const editable = this.hasPathGrant(
          effectiveState,
          "files.write",
          relativePath
        )
        return (extension.manifest.contributes.fileEditors ?? [])
          .filter((editor) =>
            editor.selector.some((selector) =>
              fileEditorSelectorMatches(relativePath, mediaType, selector)
            )
          )
          .map((editor) => ({
            ...snapshot,
            ...editor,
            extensionDisplayName: extension.manifest!.displayName,
            editable,
          }))
      })
      .sort(
        (left, right) =>
          Number(right.priority === "default") -
            Number(left.priority === "default") ||
          left.displayName.localeCompare(right.displayName)
      )
  }

  @IpcMethod()
  async openFileEditor(
    spaceId: string,
    request: FileExtensionOpenEditorRequest
  ): Promise<FileExtensionOpenEditorResult> {
    const space = this.getFileSpace(spaceId)
    assertExtensionSnapshotIdentity(request)
    if (typeof request.editorId !== "string" || !request.editorId) {
      throw new Error("A file editor contribution ID is required")
    }
    const relativePath = this.canonicalPublicSpacePath(request.path)
    const watcher = await this.startWatching(spaceId)
    if (!watcher.watching) {
      throw new Error(
        "Extension source watching must be available before opening third-party UI"
      )
    }
    return withFileSpaceReadLock(spaceId, async () => {
      const prepared = await this.prepareFileEditor(
        spaceId,
        space.path,
        request,
        relativePath
      )
      return this.documentManager.open({
        spaceId,
        spacePath: space.path,
        packageId: request.packageId,
        editorId: request.editorId,
        generation: prepared.generation,
        source: prepared.source,
        path: relativePath,
        mediaType: fileEditorMediaType(relativePath),
        languageId: fileEditorLanguageId(relativePath),
        editable: prepared.editable,
      })
    })
  }

  @IpcMethod()
  async handleFileEditorRequest(
    spaceId: string,
    request: FileExtensionEditorSessionRequest,
    message: unknown
  ): Promise<FileExtensionSurfaceRequestResult> {
    return this.documentManager.handleRequest(
      spaceId,
      request.sessionId,
      request.viewId,
      message
    )
  }

  @IpcMethod()
  async flushFileEditor(
    spaceId: string,
    request: FileExtensionEditorSessionRequest
  ): Promise<{ success: true }> {
    return this.documentManager.flush(
      spaceId,
      request.sessionId,
      request.viewId
    )
  }

  @IpcMethod()
  async refreshFileEditor(
    spaceId: string,
    request: FileExtensionEditorSessionRequest
  ): Promise<{ success: true }> {
    return this.documentManager.refresh(
      spaceId,
      request.sessionId,
      request.viewId
    )
  }

  @IpcMethod()
  async resolveFileEditorConflict(
    spaceId: string,
    request: FileExtensionResolveConflictRequest
  ): Promise<{ success: true }> {
    return this.documentManager.resolveConflict(
      spaceId,
      request.sessionId,
      request.viewId,
      request.resolution
    )
  }

  @IpcMethod()
  async closeFileEditor(
    spaceId: string,
    request: FileExtensionEditorSessionRequest
  ): Promise<{ success: true }> {
    return this.documentManager.close(
      spaceId,
      request.sessionId,
      request.viewId
    )
  }

  @IpcMethod()
  async openPanel(
    spaceId: string,
    request: FileExtensionOpenPanelRequest
  ): Promise<FileExtensionOpenPanelResult> {
    assertExtensionSnapshotIdentity(request)
    if (
      typeof request.panelId !== "string" ||
      !request.panelId ||
      request.panelId.length > 256
    ) {
      throw new Error("A valid extension panel ID is required")
    }
    return this.openDeclaredPanel(spaceId, request, request.panelId)
  }

  private async openDeclaredPanel(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity,
    panelId: string,
    state?: ExtensionRuntimeJsonValue
  ): Promise<FileExtensionOpenPanelResult> {
    const space = this.getFileSpace(spaceId)
    const watcher = await this.startWatching(spaceId)
    if (!watcher.watching) {
      throw new FileExtensionRuntimeError(
        "CAPABILITY_DENIED",
        "Extension source watching must be available before opening third-party UI"
      )
    }
    return withFileSpaceReadLock(spaceId, async () => {
      const prepared = await this.preparePanel(
        spaceId,
        space.path,
        snapshot,
        panelId
      )
      return this.openOrUpdatePanelSession(
        spaceId,
        snapshot,
        panelId,
        state,
        prepared
      )
    })
  }

  @IpcMethod()
  async getPanelSession(
    spaceId: string,
    request: FileExtensionPanelSessionRequest
  ): Promise<FileExtensionOpenPanelResult> {
    const session = this.requirePanelSession(spaceId, request)
    if (session.suspended) {
      throw new Error("Extension panel is reloading")
    }
    const space = this.getFileSpace(spaceId)
    await withFileSpaceReadLock(spaceId, () =>
      this.requireCurrentEnabledSnapshot(spaceId, space.path, session.snapshot)
    )
    return this.publicPanelSession(session)
  }

  @IpcMethod()
  closePanelSession(
    spaceId: string,
    request: FileExtensionPanelSessionRequest
  ): { success: true } {
    const session = this.requirePanelSession(spaceId, request)
    this.deletePanelSession(session)
    return { success: true }
  }

  @IpcMethod()
  async executeCommand(
    spaceId: string,
    request: FileExtensionCommandRequest
  ): Promise<{ success: true }> {
    const space = this.getFileSpace(spaceId)
    assertExtensionSnapshotIdentity(request)
    if (
      typeof request.commandId !== "string" ||
      !request.commandId ||
      request.commandId.length > 256
    ) {
      throw new Error("A valid extension command ID is required")
    }
    if (
      !request.resource ||
      typeof request.resource.path !== "string" ||
      request.resource.path.length > 4096
    ) {
      throw new Error("A valid extension command resource is required")
    }
    const prepared = await withFileSpaceOperationLock(spaceId, () =>
      this.prepareCommand(space.path, spaceId, request)
    )
    await this.runtimeManager.execute({
      descriptor: prepared.descriptor,
      commandId: request.commandId,
      resource: { path: request.resource.path },
      handleRpc: (rpc) =>
        this.handleRuntimeRpc(spaceId, prepared.descriptor.snapshot, rpc),
    })
    return { success: true }
  }

  @IpcMethod()
  resolveSemanticUi(
    spaceId: string,
    response: FileExtensionSemanticUiResponse
  ): { success: true } {
    if (!response || typeof response.requestId !== "string") {
      throw new Error("A semantic UI request ID is required")
    }
    const pending = this.pendingSemanticUi.get(response.requestId)
    if (!pending || pending.request.spaceId !== spaceId) {
      throw new Error("Semantic UI request is no longer active")
    }
    clearTimeout(pending.timer)
    this.pendingSemanticUi.delete(response.requestId)
    if (response.cancelled) {
      pending.resolve(pending.request.kind === "confirm" ? false : undefined)
      return { success: true }
    }
    if (pending.request.kind === "confirm") {
      if (typeof response.value !== "boolean") {
        pending.reject(new Error("Confirm response must be a boolean"))
        throw new Error("Confirm response must be a boolean")
      }
      pending.resolve(response.value)
      return { success: true }
    }
    if (
      typeof response.value !== "string" ||
      !pending.request.items.some((item) => item.value === response.value)
    ) {
      pending.reject(
        new Error("Select response is not one of the offered items")
      )
      throw new Error("Select response is not one of the offered items")
    }
    pending.resolve(response.value)
    return { success: true }
  }

  @IpcMethod()
  async createTemplate(
    spaceId: string,
    request: FileExtensionTemplateRequest
  ): Promise<FileExtensionTemplateResult> {
    const space = this.getFileSpace(spaceId)
    const normalized = this.normalizeLocalTemplateRequest(request)
    const result = await withFileSpaceOperationLock(spaceId, async () => {
      const common = {
        publisher: "local",
        name: normalized.name,
        engineRange: `>=${app.getVersion()}`,
      }
      const template =
        normalized.template === "text-editor"
          ? createExtensionTextEditorTemplate({
              ...common,
              filenamePattern: normalized.filenamePattern,
              mediaType: normalized.mediaType,
            })
          : normalized.template === "panel"
            ? createExtensionPanelTemplate(common)
            : createExtensionCommandTemplate(common)
      return writeExtensionTemplate(space.path, template)
    })
    await this.startWatching(spaceId)
    this.emitChange(spaceId)
    return result
  }

  @IpcMethod()
  async prepareGitHubInstall(
    spaceId: string,
    request: FileExtensionGitHubInstallRequest
  ): Promise<FileExtensionInstallPreview> {
    const space = this.getFileSpace(spaceId)
    return this.installManager.prepare(
      spaceId,
      space.path,
      request,
      app.getVersion()
    )
  }

  @IpcMethod()
  async applyGitHubInstall(
    spaceId: string,
    request: FileExtensionApplyInstallRequest
  ): Promise<FileExtensionInstallResult> {
    const space = this.getFileSpace(spaceId)
    await this.documentManager.flushSpace(spaceId)
    const result = await withFileSpaceOperationLock(spaceId, () =>
      this.installManager.apply(spaceId, space.path, request, app.getVersion())
    )
    this.stopDevelopmentSessionForPackage(
      spaceId,
      result.canonicalId,
      "Extension source was installed from GitHub"
    )
    this.invalidatePackageRuntime(
      spaceId,
      result.canonicalId,
      "Extension source was installed from GitHub"
    )
    await this.startWatching(spaceId)
    this.emitChange(spaceId)
    return result
  }

  @IpcMethod()
  async cancelGitHubInstall(
    spaceId: string,
    previewId: string
  ): Promise<{ success: true }> {
    this.getFileSpace(spaceId)
    await this.installManager.cancel(spaceId, previewId)
    return { success: true }
  }

  @IpcMethod()
  async uninstall(
    spaceId: string,
    request: FileExtensionUninstallRequest
  ): Promise<{ success: true }> {
    const space = this.getFileSpace(spaceId)
    if (!request || typeof request.directoryName !== "string") {
      throw new Error("An extension package directory name is required")
    }
    await this.documentManager.flushPackage(
      spaceId,
      request.canonicalId ?? request.directoryName
    )
    this.stopDevelopmentSessionForPackage(
      spaceId,
      request.canonicalId ?? request.directoryName,
      "Extension source was uninstalled"
    )
    await withFileSpaceOperationLock(spaceId, () =>
      this.installManager.uninstall(space.path, request, app.getVersion())
    )
    this.invalidatePackageRuntime(
      spaceId,
      request.canonicalId ?? request.directoryName,
      "Extension source was uninstalled"
    )
    this.emitChange(spaceId)
    return { success: true }
  }

  @IpcMethod()
  async startWatching(spaceId: string): Promise<FileExtensionWatchResult> {
    const space = this.getFileSpace(spaceId)
    let root: string | undefined
    try {
      root = (await resolveExtensionProjectPaths(space.path)).extensionsRoot
    } catch {
      this.stopWatcher(spaceId)
      return {
        watching: false,
        generation: this.changeGenerations.get(spaceId) ?? 0,
        reason: "invalid-root",
      }
    }
    if (!root) {
      this.stopWatcher(spaceId)
      return {
        watching: false,
        generation: this.changeGenerations.get(spaceId) ?? 0,
        reason: "missing-root",
      }
    }
    const existing = this.watchers.get(spaceId)
    if (existing?.root === root) {
      return { watching: true, generation: existing.generation }
    }
    this.stopWatcher(spaceId)

    try {
      const state: FileExtensionWatcher = {
        root,
        generation: this.changeGenerations.get(spaceId) ?? 0,
        pendingPackageIds: new Set(),
        unknownChange: false,
        watcher: watch(root, { recursive: true }, (_eventType, filename) => {
          this.scheduleChange(spaceId, filename)
        }),
      }
      state.watcher.unref()
      state.watcher.on("error", () => {
        this.stopWatcher(spaceId)
        this.stopDevelopmentSessionsForSpace(
          spaceId,
          "Extension watcher failed"
        )
        this.invalidateSpaceRuntime(spaceId, "Extension watcher failed")
        this.emitChange(spaceId)
      })
      this.watchers.set(spaceId, state)
      return { watching: true, generation: state.generation }
    } catch {
      return {
        watching: false,
        generation: this.changeGenerations.get(spaceId) ?? 0,
        reason: "watch-error",
      }
    }
  }

  @IpcMethod()
  stopWatching(spaceId: string): FileExtensionWatchResult {
    const generation = this.changeGenerations.get(spaceId) ?? 0
    this.stopWatcher(spaceId)
    this.stopDevelopmentSessionsForSpace(
      spaceId,
      "Extension source watcher stopped"
    )
    this.invalidateSpaceRuntime(spaceId, "Extension watcher stopped")
    return { watching: false, generation }
  }

  private getFileSpace(spaceId: string) {
    if (typeof spaceId !== "string" || spaceId.length === 0) {
      throw new Error("A Space ID is required")
    }
    const space = this.registry.getSpace(spaceId)
    if (!space) throw new Error(`Space not found: ${spaceId}`)
    if (space.mode !== "file") {
      throw new Error("File-based extensions are only available in file Spaces")
    }
    return space
  }

  private normalizeLocalExtensionName(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("Extension name must be a string")
    }
    const name = value.trim()
    if (!LOCAL_EXTENSION_NAME_PATTERN.test(name)) {
      throw new Error(
        "Extension name must start with a lowercase letter, contain only lowercase letters, numbers, or hyphens, and be 2-63 characters long"
      )
    }
    return name
  }

  private normalizeLocalTemplateRequest(
    value: unknown
  ): FileExtensionTemplateRequest {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Extension template request must be an object")
    }
    const request = value as Record<string, unknown>
    if (
      request.template !== "command" &&
      request.template !== "panel" &&
      request.template !== "text-editor"
    ) {
      throw new Error(
        "Extension template must be command, panel, or text-editor"
      )
    }
    return {
      name: this.normalizeLocalExtensionName(request.name),
      template: request.template,
      filenamePattern: this.normalizeOptionalTemplateValue(
        request.filenamePattern,
        "File pattern",
        512
      ),
      mediaType: this.normalizeOptionalTemplateValue(
        request.mediaType,
        "Media type",
        128
      ),
    }
  }

  private normalizeOptionalTemplateValue(
    value: unknown,
    label: string,
    maxLength: number
  ): string | undefined {
    if (value === undefined) return undefined
    if (typeof value !== "string") {
      throw new Error(`${label} must be a string`)
    }
    const normalized = value.trim()
    if (!normalized) return undefined
    if (normalized.length > maxLength) {
      throw new Error(`${label} must be at most ${maxLength} characters`)
    }
    return normalized
  }

  private async discoverUnlocked(
    spaceId: string,
    spacePath: string
  ): Promise<FileExtensionDiscoveryResult> {
    // This host-owned path is intentionally not exposed through SpaceFiles:
    // public Space file APIs continue to reject all .eidos and .graft paths.
    const paths = await resolveExtensionProjectPaths(spacePath)
    const hostVersion = app.getVersion()
    const discovery = paths.extensionsRoot
      ? await discoverExtensionPackages(paths.extensionsRoot, { hostVersion })
      : { packages: [], diagnostics: [] }
    this.packageDirectories.set(
      spaceId,
      new Map(
        discovery.packages.flatMap((extension) =>
          extension.canonicalId
            ? [[extension.directoryName, extension.canonicalId] as const]
            : []
        )
      )
    )
    const hasStatefulPackage = discovery.packages.some(
      (extension) =>
        extension.status === "ready" &&
        extension.canonicalId &&
        extension.contentDigest &&
        extension.permissionHash
    )
    const stateStore = hasStatefulPackage
      ? new BetterSqlite3ExtensionStateStore(
          await ensureExtensionStateDatabasePath(spacePath)
        )
      : undefined
    const legacyMappings = stateStore?.listLegacyExtensionMappings() ?? []

    try {
      return {
        root: FILE_EXTENSION_ROOT,
        phase: "runtime-preview",
        executionAvailable: true,
        hostVersion,
        packages: discovery.packages.map((extension) =>
          this.toPackageSummary(
            spaceId,
            extension,
            stateStore,
            legacyMappings.filter(
              (mapping) => mapping.canonicalPackageId === extension.canonicalId
            )
          )
        ),
        diagnostics: discovery.diagnostics,
      }
    } finally {
      stateStore?.close()
    }
  }

  private toPackageSummary(
    spaceId: string,
    extension: ExtensionPackageInspection,
    stateStore: BetterSqlite3ExtensionStateStore | undefined,
    legacyMappings: LegacyExtensionMapping[]
  ): FileExtensionPackageSummary {
    const {
      packageRoot: _packageRoot,
      normalizedPermissions,
      ...inspection
    } = extension
    const grants = requestedGrants(normalizedPermissions)
    if (extension.status !== "ready") {
      return {
        ...inspection,
        normalizedPermissions,
        requestedGrants: grants,
        legacyMappings,
        lifecycleStatus: extension.status,
        developmentSession:
          (extension.canonicalId
            ? this.developmentManager.get(spaceId, extension.canonicalId)
            : undefined) ??
          this.developmentManager.getByDirectory(
            spaceId,
            extension.directoryName
          ),
      }
    }
    if (
      !extension.canonicalId ||
      !extension.contentDigest ||
      !extension.permissionHash ||
      !stateStore
    ) {
      return {
        ...inspection,
        normalizedPermissions,
        requestedGrants: grants,
        legacyMappings,
        lifecycleStatus: "invalid",
        developmentSession:
          (extension.canonicalId
            ? this.developmentManager.get(spaceId, extension.canonicalId)
            : undefined) ??
          this.developmentManager.getByDirectory(
            spaceId,
            extension.directoryName
          ),
      }
    }
    const snapshot: ExtensionSnapshotIdentity = {
      packageId: extension.canonicalId,
      contentDigest: extension.contentDigest,
      permissionHash: extension.permissionHash,
    }
    const localState = stateStore.get(snapshot)
    return {
      ...inspection,
      normalizedPermissions,
      requestedGrants: grants,
      legacyMappings,
      localState,
      developmentSession:
        this.developmentManager.get(spaceId, extension.canonicalId) ??
        this.developmentManager.getByDirectory(
          spaceId,
          extension.directoryName
        ),
      lifecycleStatus: !localState.trusted
        ? "untrusted"
        : localState.enabled
          ? "enabled"
          : "disabled",
    }
  }

  private async mutateCurrentSnapshot(
    spaceId: string,
    request: FileExtensionSnapshotRequest,
    mutate: (
      store: BetterSqlite3ExtensionStateStore,
      current: {
        snapshot: ExtensionSnapshotIdentity
        requestedGrants: ExtensionPermissionGrant[]
      }
    ) => ExtensionLocalState
  ): Promise<ExtensionLocalState> {
    const space = this.getFileSpace(spaceId)
    assertExtensionSnapshotIdentity(request)
    const snapshot: ExtensionSnapshotIdentity = {
      packageId: request.packageId,
      contentDigest: request.contentDigest,
      permissionHash: request.permissionHash,
    }
    return withFileSpaceOperationLock(spaceId, async () => {
      const paths = await resolveExtensionProjectPaths(space.path)
      if (!paths.extensionsRoot) {
        throw new Error("Extension package is no longer installed")
      }
      const discovery = await discoverExtensionPackages(paths.extensionsRoot, {
        hostVersion: app.getVersion(),
      })
      const extension = discovery.packages.find(
        (candidate) => candidate.canonicalId === snapshot.packageId
      )
      if (
        !extension ||
        extension.status !== "ready" ||
        !extension.contentDigest ||
        !extension.permissionHash ||
        extension.contentDigest !== snapshot.contentDigest ||
        extension.permissionHash !== snapshot.permissionHash
      ) {
        throw new Error(
          "Extension package changed; inspect the current source before changing trust"
        )
      }
      const store = new BetterSqlite3ExtensionStateStore(
        await ensureExtensionStateDatabasePath(space.path)
      )
      try {
        return mutate(store, {
          snapshot,
          requestedGrants: requestedGrants(extension.normalizedPermissions),
        })
      } finally {
        store.close()
      }
    })
  }

  private scheduleChange(
    spaceId: string,
    filename: string | Buffer | null
  ): void {
    const state = this.watchers.get(spaceId)
    if (!state) return
    const packageId = this.packageIdForWatchEvent(spaceId, filename)
    if (packageId === null) return
    if (packageId) {
      const firstChange = !state.pendingPackageIds.has(packageId)
      state.pendingPackageIds.add(packageId)
      if (firstChange) {
        const session = this.developmentManager.markChecking(spaceId, packageId)
        if (session) this.emitDevelopmentChange(spaceId, session)
        this.invalidatePackageRuntimeSafely(
          spaceId,
          packageId,
          "Extension source changed on disk"
        )
      }
    } else if (!state.unknownChange) {
      state.unknownChange = true
      for (const session of this.developmentManager.list(spaceId)) {
        const checking = this.developmentManager.markChecking(
          spaceId,
          session.packageId
        )
        if (checking) this.emitDevelopmentChange(spaceId, checking)
      }
      this.invalidateSpaceRuntime(spaceId, "Extension source changed on disk")
    }
    state.generation = this.nextGeneration(spaceId)
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      void this.flushScheduledChanges(spaceId)
    }, WATCH_DEBOUNCE_MS)
  }

  private async flushScheduledChanges(spaceId: string): Promise<void> {
    const state = this.watchers.get(spaceId)
    if (!state) return
    state.timer = undefined
    const unknownChange = state.unknownChange
    const packageIds = unknownChange
      ? this.developmentManager
          .list(spaceId)
          .map((session) => session.packageId)
      : [...state.pendingPackageIds]
    state.pendingPackageIds.clear()
    state.unknownChange = false

    const flushError = await this.consumeDocumentFlushes(spaceId, packageIds)
    if (flushError) {
      for (const packageId of packageIds) {
        const session = this.developmentManager.get(spaceId, packageId)
        if (!session) continue
        const blocked = this.developmentManager.markBlocked(
          spaceId,
          packageId,
          "invalid",
          [
            {
              code: "document-save",
              message: `The extension was not reloaded because an open document could not be saved: ${flushError.message}`,
            },
          ]
        )
        if (blocked) this.emitDevelopmentChange(spaceId, blocked)
      }
    }

    for (const packageId of flushError ? [] : packageIds) {
      const session = this.developmentManager.get(spaceId, packageId)
      if (!session) continue
      const next = await this.reconcileDevelopmentSession(spaceId, session)
      if (next) this.emitDevelopmentChange(spaceId, next)
    }

    const current = this.watchers.get(spaceId)
    if (!current) return
    const event: FileExtensionChangedEvent = {
      spaceId,
      generation: this.changeGenerations.get(spaceId) ?? current.generation,
    }
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:changed", event)
  }

  private async reconcileDevelopmentSession(
    spaceId: string,
    expected: FileExtensionDevelopmentSessionSummary
  ): Promise<FileExtensionDevelopmentSessionSummary | undefined> {
    const directoryName = this.developmentManager.directoryName(
      spaceId,
      expected.packageId
    )
    if (!directoryName) return undefined
    const space = this.registry.getSpace(spaceId)
    if (!space || space.mode !== "file") {
      return this.applyDevelopmentResult(spaceId, expected, () =>
        this.developmentManager.markBlocked(
          spaceId,
          expected.packageId,
          "missing",
          [{ code: "inspection", message: "The file Space is no longer open." }]
        )
      )
    }

    try {
      const paths = await resolveExtensionProjectPaths(space.path)
      if (!paths.extensionsRoot) {
        return this.applyDevelopmentResult(spaceId, expected, () =>
          this.developmentManager.markBlocked(
            spaceId,
            expected.packageId,
            "missing",
            [
              {
                code: "inspection",
                message: "The extension package is no longer installed.",
              },
            ]
          )
        )
      }
      const { inspection, files } = await inspectExtensionPackageSnapshot(
        path.join(paths.extensionsRoot, directoryName),
        { hostVersion: app.getVersion() }
      )
      const snapshot =
        inspection.canonicalId &&
        inspection.contentDigest &&
        inspection.permissionHash
          ? {
              packageId: inspection.canonicalId,
              contentDigest: inspection.contentDigest,
              permissionHash: inspection.permissionHash,
            }
          : undefined

      if (inspection.status !== "ready" || !inspection.manifest || !snapshot) {
        const diagnostics: FileExtensionDevelopmentDiagnostic[] =
          inspection.diagnostics.map((diagnostic) => ({
            code: "inspection",
            message: `${diagnostic.code}: ${diagnostic.message}`,
            path: diagnostic.path,
          }))
        return this.applyDevelopmentResult(spaceId, expected, () =>
          this.developmentManager.markBlocked(
            spaceId,
            expected.packageId,
            "invalid",
            diagnostics.length > 0
              ? diagnostics
              : [
                  {
                    code: "inspection",
                    message: "The extension package is invalid.",
                  },
                ],
            snapshot
          )
        )
      }
      if (
        snapshot.packageId !== expected.packageId ||
        snapshot.permissionHash !== expected.anchorSnapshot.permissionHash
      ) {
        return this.applyDevelopmentResult(spaceId, expected, () =>
          this.developmentManager.markBlocked(
            spaceId,
            expected.packageId,
            "permissions-changed",
            [
              {
                code: "inspection",
                message:
                  "The extension ID or requested permissions changed. Stop development and review the new source before running it.",
              },
            ],
            snapshot
          )
        )
      }

      let surfaceBundleCode: string | undefined
      try {
        if (inspection.manifest.entrypoints.worker) {
          const compiled = await compileExtensionWorker({
            entrypoint: inspection.manifest.entrypoints.worker,
            files,
          })
          this.bundleCache.set(
            this.snapshotCacheKey(spaceId, snapshot, "worker"),
            compiled.code
          )
        }
        if (inspection.manifest.entrypoints.ui) {
          const compiled = await compileExtensionSurface({
            entrypoint: inspection.manifest.entrypoints.ui,
            files,
          })
          surfaceBundleCode = compiled.code
          this.bundleCache.set(
            this.snapshotCacheKey(spaceId, snapshot, "surface"),
            compiled.code
          )
        }
      } catch (error) {
        return this.applyDevelopmentResult(spaceId, expected, () =>
          this.developmentManager.markBlocked(
            spaceId,
            expected.packageId,
            "invalid",
            [
              {
                code: "compile",
                message:
                  error instanceof Error
                    ? error.message
                    : "The extension could not be compiled.",
              },
            ],
            snapshot
          )
        )
      }

      const next = this.applyDevelopmentResult(spaceId, expected, () =>
        this.developmentManager.markReady(spaceId, expected.packageId, snapshot)
      )
      if (
        next?.status === "ready" &&
        next.currentSnapshot?.packageId === snapshot.packageId &&
        next.currentSnapshot.contentDigest === snapshot.contentDigest &&
        next.currentSnapshot.permissionHash === snapshot.permissionHash
      ) {
        this.resumeDevelopmentPanelSessions(
          spaceId,
          snapshot,
          inspection.manifest.contributes.panels ?? [],
          surfaceBundleCode
        )
      }
      return next
    } catch (error) {
      return this.applyDevelopmentResult(spaceId, expected, () =>
        this.developmentManager.markBlocked(
          spaceId,
          expected.packageId,
          "invalid",
          [
            {
              code: "inspection",
              message:
                error instanceof Error
                  ? error.message
                  : "The extension package could not be inspected.",
            },
          ]
        )
      )
    }
  }

  private applyDevelopmentResult(
    spaceId: string,
    expected: FileExtensionDevelopmentSessionSummary,
    apply: () => FileExtensionDevelopmentSessionSummary | undefined
  ): FileExtensionDevelopmentSessionSummary | undefined {
    const current = this.developmentManager.get(spaceId, expected.packageId)
    if (
      !current ||
      current.sessionId !== expected.sessionId ||
      current.generation !== expected.generation
    ) {
      return current
    }
    return apply()
  }

  private packageIdForWatchEvent(
    spaceId: string,
    filename: string | Buffer | null
  ): string | null | undefined {
    if (filename === null) return undefined
    const relativePath = Buffer.isBuffer(filename)
      ? filename.toString("utf8")
      : filename
    const segments = relativePath.split(/[\\/]/)
    const directoryName = segments[0]
    if (!directoryName || directoryName === "." || directoryName === "..") {
      return undefined
    }
    if (segments.length > 1) {
      try {
        if (
          isIgnoredExtensionPackagePath(
            canonicalExtensionPackagePath(segments.slice(1).join("/"))
          )
        ) {
          return null
        }
      } catch {
        return undefined
      }
    }
    return (
      this.packageDirectories.get(spaceId)?.get(directoryName) ??
      this.developmentManager.getByDirectory(spaceId, directoryName)?.packageId
    )
  }

  private stopWatcher(spaceId: string): void {
    const state = this.watchers.get(spaceId)
    if (!state) return
    if (state.timer) clearTimeout(state.timer)
    state.watcher.close()
    this.watchers.delete(spaceId)
  }

  private nextGeneration(spaceId: string): number {
    const generation = (this.changeGenerations.get(spaceId) ?? 0) + 1
    this.changeGenerations.set(spaceId, generation)
    return generation
  }

  private emitChange(spaceId: string): void {
    const generation = this.nextGeneration(spaceId)
    const watcher = this.watchers.get(spaceId)
    if (watcher) watcher.generation = generation
    const event: FileExtensionChangedEvent = { spaceId, generation }
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:changed", event)
  }

  private async prepareCommand(
    spacePath: string,
    spaceId: string,
    request: FileExtensionCommandRequest
  ): Promise<PreparedFileExtensionCommand> {
    const paths = await resolveExtensionProjectPaths(spacePath)
    if (!paths.extensionsRoot) {
      throw new Error("Extension package is no longer installed")
    }
    const packageRoot = path.join(paths.extensionsRoot, request.packageId)
    const { inspection, files } = await inspectExtensionPackageSnapshot(
      packageRoot,
      { hostVersion: app.getVersion() }
    )
    if (
      inspection.status !== "ready" ||
      inspection.canonicalId !== request.packageId ||
      inspection.contentDigest !== request.contentDigest ||
      inspection.permissionHash !== request.permissionHash ||
      !inspection.manifest?.entrypoints.worker
    ) {
      throw new Error(
        "Extension package changed; inspect the current source before execution"
      )
    }
    const commandIds = (inspection.manifest.contributes.commands ?? []).map(
      (command) => command.id
    )
    const panelIds = (inspection.manifest.contributes.panels ?? []).map(
      (panel) => panel.id
    )
    if (!commandIds.includes(request.commandId)) {
      throw new Error("Extension command is not declared by this package")
    }
    const snapshot: ExtensionSnapshotIdentity = {
      packageId: request.packageId,
      contentDigest: request.contentDigest,
      permissionHash: request.permissionHash,
    }
    const store = new BetterSqlite3ExtensionStateStore(
      await ensureExtensionStateDatabasePath(spacePath)
    )
    try {
      this.assertNoLegacyPortingConflict(store, snapshot.packageId)
      const localState = this.effectiveLocalState(
        spaceId,
        snapshot,
        store.get(snapshot)
      )
      if (!localState) {
        throw new Error(
          "Extension must be trusted and enabled before execution"
        )
      }
    } finally {
      store.close()
    }

    const cacheKey = this.snapshotCacheKey(spaceId, snapshot, "worker")
    let bundleCode = this.bundleCache.get(cacheKey)
    if (!bundleCode) {
      const compiled = await compileExtensionWorker({
        entrypoint: inspection.manifest.entrypoints.worker,
        files,
      })
      bundleCode = compiled.code
      this.bundleCache.set(cacheKey, bundleCode)
    }
    return {
      descriptor: {
        spaceId,
        snapshot,
        bundleCode,
        commandIds,
        panelIds,
      },
    }
  }

  private async prepareFileEditor(
    spaceId: string,
    spacePath: string,
    request: FileExtensionOpenEditorRequest,
    relativePath: string
  ): Promise<PreparedFileExtensionEditor> {
    const paths = await resolveExtensionProjectPaths(spacePath)
    if (!paths.extensionsRoot) {
      throw new Error("Extension package is no longer installed")
    }
    const { inspection, files } = await inspectExtensionPackageSnapshot(
      path.join(paths.extensionsRoot, request.packageId),
      { hostVersion: app.getVersion() }
    )
    if (
      inspection.status !== "ready" ||
      inspection.canonicalId !== request.packageId ||
      inspection.contentDigest !== request.contentDigest ||
      inspection.permissionHash !== request.permissionHash ||
      !inspection.manifest?.entrypoints.ui
    ) {
      throw new Error(
        "Extension package changed; inspect the current source before opening its editor"
      )
    }
    const editor = (inspection.manifest.contributes.fileEditors ?? []).find(
      (candidate) => candidate.id === request.editorId
    )
    const mediaType = fileEditorMediaType(relativePath)
    if (
      !editor ||
      !editor.selector.some((selector) =>
        fileEditorSelectorMatches(relativePath, mediaType, selector)
      )
    ) {
      throw new Error("Extension file editor does not match this resource")
    }

    const snapshot: ExtensionSnapshotIdentity = {
      packageId: request.packageId,
      contentDigest: request.contentDigest,
      permissionHash: request.permissionHash,
    }
    const store = new BetterSqlite3ExtensionStateStore(
      await ensureExtensionStateDatabasePath(spacePath)
    )
    let localState: ExtensionLocalState
    try {
      this.assertNoLegacyPortingConflict(store, snapshot.packageId)
      const effectiveState = this.effectiveLocalState(
        spaceId,
        snapshot,
        store.get(snapshot)
      )
      if (!effectiveState) {
        throw new Error(
          "Extension must be trusted and enabled before opening its editor"
        )
      }
      localState = effectiveState
    } finally {
      store.close()
    }
    if (!this.hasPathGrant(localState, "files.read", relativePath)) {
      throw new FileExtensionRuntimeError(
        "CAPABILITY_DENIED",
        `Extension is not granted read access to ${relativePath}`
      )
    }
    const editable = this.hasPathGrant(localState, "files.write", relativePath)
    const cacheKey = this.snapshotCacheKey(spaceId, snapshot, "surface")
    let bundleCode = this.bundleCache.get(cacheKey)
    if (!bundleCode) {
      const compiled = await compileExtensionSurface({
        entrypoint: inspection.manifest.entrypoints.ui,
        files,
      })
      bundleCode = compiled.code
      this.bundleCache.set(cacheKey, bundleCode)
    }
    const generation = this.surfaceGeneration(snapshot, localState)
    return {
      generation,
      source: createExtensionSurfaceSource({
        bundleCode,
        extensionId: snapshot.packageId,
        generation,
      }),
      editable,
    }
  }

  private async preparePanel(
    spaceId: string,
    spacePath: string,
    snapshot: ExtensionSnapshotIdentity,
    panelId: string
  ): Promise<PreparedFileExtensionPanel> {
    const paths = await resolveExtensionProjectPaths(spacePath)
    if (!paths.extensionsRoot) {
      throw new Error("Extension package is no longer installed")
    }
    const { inspection, files } = await inspectExtensionPackageSnapshot(
      path.join(paths.extensionsRoot, snapshot.packageId),
      { hostVersion: app.getVersion() }
    )
    if (
      inspection.status !== "ready" ||
      inspection.canonicalId !== snapshot.packageId ||
      inspection.contentDigest !== snapshot.contentDigest ||
      inspection.permissionHash !== snapshot.permissionHash ||
      !inspection.manifest?.entrypoints.ui
    ) {
      throw new FileExtensionRuntimeError(
        "RUNTIME_STALE",
        "Extension package changed before its panel could open"
      )
    }
    const panel = (inspection.manifest.contributes.panels ?? []).find(
      (candidate) => candidate.id === panelId
    )
    if (!panel) {
      throw new FileExtensionRuntimeError(
        "CAPABILITY_DENIED",
        "Extension panel is not declared by this package"
      )
    }
    let localState = await this.requireCurrentEnabledSnapshot(
      spaceId,
      spacePath,
      snapshot
    )
    const cacheKey = this.snapshotCacheKey(spaceId, snapshot, "surface")
    let bundleCode = this.bundleCache.get(cacheKey)
    if (!bundleCode) {
      const compiled = await compileExtensionSurface({
        entrypoint: inspection.manifest.entrypoints.ui,
        files,
      })
      bundleCode = compiled.code
      this.bundleCache.set(cacheKey, bundleCode)
    }
    localState = await this.requireCurrentEnabledSnapshot(
      spaceId,
      spacePath,
      snapshot
    )
    const generation = this.surfaceGeneration(snapshot, localState)
    return {
      generation,
      source: createExtensionSurfaceSource({
        bundleCode,
        extensionId: snapshot.packageId,
        generation,
      }),
      title: panel.displayName,
    }
  }

  private async handleRuntimeRpc(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity,
    rpc: ExtensionRuntimeRpcRequest
  ): Promise<unknown> {
    const space = this.getFileSpace(spaceId)
    if (rpc.method === "space.files.readText") {
      return withFileSpaceReadLock(spaceId, async () => {
        const localState = await this.requireCurrentEnabledSnapshot(
          spaceId,
          space.path,
          snapshot
        )
        const relativePath = this.canonicalPublicSpacePath(rpc.params.path)
        const allowed = localState.granted.some(
          (grant) =>
            grant.kind === "files.read" &&
            minimatch(relativePath, grant.value, {
              dot: true,
              nocomment: true,
              nonegate: true,
              nocase: false,
            })
        )
        if (!allowed) {
          throw new FileExtensionRuntimeError(
            "CAPABILITY_DENIED",
            `Extension is not granted read access to ${relativePath}`
          )
        }
        const preview = await new SpaceFiles(space.path).readPreview(
          relativePath
        )
        if (preview.kind !== "text") {
          throw new FileExtensionRuntimeError(
            "CAPABILITY_DENIED",
            `Extension can only read text files: ${relativePath}`
          )
        }
        if (preview.truncated || preview.size > SPACE_FILE_PREVIEW_MAX_BYTES) {
          throw new FileExtensionRuntimeError(
            "CAPABILITY_DENIED",
            `Text file exceeds the ${SPACE_FILE_PREVIEW_MAX_BYTES}-byte extension preview limit`
          )
        }
        return preview.content
      })
    }
    if (rpc.method === "window.openPanel") {
      await this.openDeclaredPanel(
        spaceId,
        snapshot,
        rpc.params.panelId,
        rpc.params.state
      )
      return undefined
    }
    await withFileSpaceReadLock(spaceId, () =>
      this.requireCurrentEnabledSnapshot(spaceId, space.path, snapshot)
    )
    if (rpc.method === "window.showNotice") {
      this.sendSemanticUi({
        kind: "notice",
        id: randomUUID(),
        spaceId,
        packageId: snapshot.packageId,
        message: rpc.params.message,
      })
      return undefined
    }
    return this.requestSemanticUi(spaceId, snapshot.packageId, rpc)
  }

  private async requireCurrentEnabledSnapshot(
    spaceId: string,
    spacePath: string,
    snapshot: ExtensionSnapshotIdentity
  ): Promise<ExtensionLocalState> {
    const paths = await resolveExtensionProjectPaths(spacePath)
    if (!paths.extensionsRoot) {
      throw new FileExtensionRuntimeError(
        "RUNTIME_STALE",
        "Extension package is no longer installed"
      )
    }
    const current = await inspectExtensionPackageSnapshot(
      path.join(paths.extensionsRoot, snapshot.packageId),
      { hostVersion: app.getVersion() }
    )
    if (
      current.inspection.status !== "ready" ||
      current.inspection.canonicalId !== snapshot.packageId ||
      current.inspection.contentDigest !== snapshot.contentDigest ||
      current.inspection.permissionHash !== snapshot.permissionHash
    ) {
      this.invalidatePackageRuntime(
        spaceId,
        snapshot.packageId,
        "Extension package changed during execution"
      )
      throw new FileExtensionRuntimeError(
        "RUNTIME_STALE",
        "Extension package changed during execution"
      )
    }
    const store = new BetterSqlite3ExtensionStateStore(
      await ensureExtensionStateDatabasePath(spacePath)
    )
    try {
      this.assertNoLegacyPortingConflict(store, snapshot.packageId)
      const state = this.effectiveLocalState(
        spaceId,
        snapshot,
        store.get(snapshot)
      )
      if (!state) {
        throw new FileExtensionRuntimeError(
          "CAPABILITY_DENIED",
          "Extension trust or enablement was revoked"
        )
      }
      return state
    } finally {
      store.close()
    }
  }

  private canonicalPublicSpacePath(value: string): string {
    const relativePath = canonicalExtensionPackagePath(value)
    const root = relativePath.split("/", 1)[0]?.toLowerCase()
    if (root === ".eidos" || root === ".graft") {
      throw new FileExtensionRuntimeError(
        "CAPABILITY_DENIED",
        "Private Space paths are not available to extensions"
      )
    }
    return relativePath
  }

  private effectiveLocalState(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity,
    persisted: ExtensionLocalState
  ): ExtensionLocalState | undefined {
    if (persisted.trusted && persisted.enabled) return persisted
    const development = this.developmentManager.authorize(spaceId, snapshot)
    if (!development) return undefined
    return {
      snapshot: { ...snapshot },
      trusted: true,
      enabled: true,
      requestedGrants: development.requestedGrants,
      granted: development.granted,
    }
  }

  private effectiveStateForSummary(
    spaceId: string,
    extension: FileExtensionPackageSummary
  ): ExtensionLocalState | undefined {
    if (this.hasLegacyPortingConflict(extension.legacyMappings)) {
      return undefined
    }
    if (
      !extension.canonicalId ||
      !extension.contentDigest ||
      !extension.permissionHash ||
      !extension.localState
    ) {
      return undefined
    }
    return this.effectiveLocalState(
      spaceId,
      {
        packageId: extension.canonicalId,
        contentDigest: extension.contentDigest,
        permissionHash: extension.permissionHash,
      },
      extension.localState
    )
  }

  private isPackageExecutionAvailable(
    spaceId: string,
    extension: FileExtensionPackageSummary
  ): boolean {
    return this.effectiveStateForSummary(spaceId, extension) !== undefined
  }

  private hasLegacyPortingConflict(
    mappings: readonly LegacyExtensionMapping[]
  ): boolean {
    return mappings.some((mapping) => mapping.conflict !== "none")
  }

  private assertNoLegacyPortingConflict(
    store: BetterSqlite3ExtensionStateStore,
    packageId: string
  ): void {
    const mappings = store
      .listLegacyExtensionMappings()
      .filter((mapping) => mapping.canonicalPackageId === packageId)
    if (this.hasLegacyPortingConflict(mappings)) {
      throw new Error(
        "Extension execution is blocked until its legacy mapping conflict is resolved"
      )
    }
  }

  private assertNoDevelopmentSession(spaceId: string, packageId: string): void {
    if (this.developmentManager.get(spaceId, packageId)) {
      throw new Error(
        "Stop the extension development session before changing trust, enablement, or grants"
      )
    }
  }

  private rememberPackageDirectory(
    spaceId: string,
    directoryName: string,
    packageId: string
  ): void {
    let directories = this.packageDirectories.get(spaceId)
    if (!directories) {
      directories = new Map()
      this.packageDirectories.set(spaceId, directories)
    }
    directories.set(directoryName, packageId)
  }

  private hasPathGrant(
    localState: ExtensionLocalState,
    kind: "files.read" | "files.write",
    relativePath: string
  ): boolean {
    return localState.granted.some(
      (grant) =>
        grant.kind === kind &&
        minimatch(relativePath, grant.value, {
          dot: true,
          matchBase: true,
          nocomment: true,
          nonegate: true,
          nocase: false,
        })
    )
  }

  private surfaceGeneration(
    snapshot: ExtensionSnapshotIdentity,
    localState: ExtensionLocalState
  ): string {
    const grants = localState.granted
      .map((grant) => `${grant.kind}:${grant.value}`)
      .sort()
    return `sha256:${createHash("sha256")
      .update(
        JSON.stringify({
          packageId: snapshot.packageId,
          contentDigest: snapshot.contentDigest,
          permissionHash: snapshot.permissionHash,
          grants,
        })
      )
      .digest("hex")}`
  }

  private emitDevelopmentChange(
    spaceId: string,
    session: FileExtensionDevelopmentSessionSummary
  ): void {
    const event: FileExtensionDevelopmentChangedEvent = {
      spaceId,
      packageId: session.packageId,
      sessionId: session.sessionId,
      status: session.status,
      generation: session.generation,
      diagnostics: session.diagnostics,
    }
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:development-changed", event)
  }

  private emitDevelopmentStopped(
    spaceId: string,
    session: FileExtensionDevelopmentSessionSummary
  ): void {
    const event: FileExtensionDevelopmentChangedEvent = {
      spaceId,
      packageId: session.packageId,
      sessionId: session.sessionId,
      status: "stopped",
      generation: session.generation + 1,
      diagnostics: [],
    }
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:development-changed", event)
  }

  private requestSemanticUi(
    spaceId: string,
    packageId: string,
    rpc: Exclude<
      ExtensionRuntimeRpcRequest,
      {
        method:
          | "space.files.readText"
          | "window.showNotice"
          | "window.openPanel"
      }
    >
  ): Promise<unknown> {
    const id = randomUUID()
    const request: Exclude<FileExtensionSemanticUiRequest, { kind: "notice" }> =
      rpc.method === "window.confirm"
        ? {
            kind: "confirm",
            id,
            spaceId,
            packageId,
            ...rpc.params,
          }
        : {
            kind: "select",
            id,
            spaceId,
            packageId,
            ...rpc.params,
          }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingSemanticUi.delete(id)
        this.sendSemanticUiCancellation(id)
        reject(
          new FileExtensionRuntimeError(
            "RUNTIME_TIMEOUT",
            "Extension prompt timed out"
          )
        )
      }, SEMANTIC_UI_TIMEOUT_MS)
      this.pendingSemanticUi.set(id, { request, resolve, reject, timer })
      this.sendSemanticUi(request)
    })
  }

  private sendSemanticUi(request: FileExtensionSemanticUiRequest): void {
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:semantic-ui", request)
  }

  private sendSemanticUiCancellation(requestId: string): void {
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:semantic-ui-cancel", { requestId })
  }

  private invalidatePackageRuntime(
    spaceId: string,
    packageId: string,
    reason: string
  ): void {
    this.runtimeManager.disposePackage(spaceId, packageId, reason)
    this.documentManager.disposePackage(spaceId, packageId, reason)
    this.clearPackageRuntimeState(spaceId, packageId, reason)
  }

  private invalidatePackageRuntimeSafely(
    spaceId: string,
    packageId: string,
    reason: string
  ): void {
    this.runtimeManager.disposePackage(spaceId, packageId, reason)
    this.clearPackageRuntimeState(spaceId, packageId, reason)
    this.trackDocumentFlush(`${spaceId}\0${packageId}`, () =>
      this.documentManager.flushAndDisposePackage(spaceId, packageId, reason)
    )
  }

  private clearPackageRuntimeState(
    spaceId: string,
    packageId: string,
    reason: string
  ): void {
    this.invalidatePanelSessions(
      (session) =>
        session.spaceId === spaceId && session.snapshot.packageId === packageId,
      reason
    )
    const prefix = `${spaceId}\0${packageId}\0`
    for (const key of this.bundleCache.keys()) {
      if (key.startsWith(prefix)) this.bundleCache.delete(key)
    }
    for (const [id, pending] of this.pendingSemanticUi) {
      if (
        pending.request.spaceId === spaceId &&
        pending.request.packageId === packageId
      ) {
        clearTimeout(pending.timer)
        this.pendingSemanticUi.delete(id)
        this.sendSemanticUiCancellation(id)
        pending.reject(new FileExtensionRuntimeError("RUNTIME_STALE", reason))
      }
    }
  }

  private trackDocumentFlush(key: string, start: () => Promise<void>): void {
    if (this.pendingDocumentFlushes.has(key)) return
    const pending = start().then(
      () => undefined,
      (error) =>
        error instanceof Error
          ? error
          : new Error("The extension document could not be saved")
    )
    this.pendingDocumentFlushes.set(key, pending)
  }

  private async consumeDocumentFlushes(
    spaceId: string,
    packageIds: readonly string[]
  ): Promise<Error | undefined> {
    const packageSet = new Set(packageIds)
    const prefix = `${spaceId}\0`
    const matching = [...this.pendingDocumentFlushes.entries()].filter(
      ([key]) => {
        if (!key.startsWith(prefix)) return false
        const packageId = key.slice(prefix.length)
        return packageId === "*" || packageSet.has(packageId)
      }
    )
    const results = await Promise.all(matching.map(([, pending]) => pending))
    matching.forEach(([key, pending]) => {
      if (this.pendingDocumentFlushes.get(key) === pending) {
        this.pendingDocumentFlushes.delete(key)
      }
    })
    return results.find((result): result is Error => result instanceof Error)
  }

  private invalidateSpaceRuntime(spaceId: string, reason: string): void {
    this.runtimeManager.disposeSpace(spaceId, reason)
    this.invalidatePanelSessions(
      (session) => session.spaceId === spaceId,
      reason
    )
    this.trackDocumentFlush(`${spaceId}\0*`, () =>
      this.documentManager.flushAndDisposeSpace(spaceId, reason)
    )
    const prefix = `${spaceId}\0`
    for (const key of this.bundleCache.keys()) {
      if (key.startsWith(prefix)) this.bundleCache.delete(key)
    }
    for (const [id, pending] of this.pendingSemanticUi) {
      if (pending.request.spaceId === spaceId) {
        clearTimeout(pending.timer)
        this.pendingSemanticUi.delete(id)
        this.sendSemanticUiCancellation(id)
        pending.reject(new FileExtensionRuntimeError("RUNTIME_STALE", reason))
      }
    }
  }

  private stopDevelopmentSessionsForSpace(
    spaceId: string,
    reason: string
  ): void {
    for (const session of this.developmentManager.stopSpace(spaceId)) {
      this.emitDevelopmentStopped(spaceId, session)
      this.runtimeManager.disposePackage(spaceId, session.packageId, reason)
    }
  }

  private stopDevelopmentSessionForPackage(
    spaceId: string,
    packageId: string,
    reason: string
  ): void {
    const stopped = this.developmentManager.stop(spaceId, packageId)
    if (!stopped) return
    this.emitDevelopmentStopped(spaceId, stopped)
    this.runtimeManager.disposePackage(spaceId, packageId, reason)
  }

  private async disposeSpaceResources(
    spaceId: string,
    reason: string
  ): Promise<void> {
    this.stopWatcher(spaceId)
    this.developmentManager.stopSpace(spaceId)
    this.runtimeManager.disposeSpace(spaceId, reason)
    this.disposePanelSessions((session) => session.spaceId === spaceId, reason)
    await this.documentManager.flushAndDisposeSpace(spaceId, reason)
    this.packageDirectories.delete(spaceId)
    for (const key of this.pendingDocumentFlushes.keys()) {
      if (key.startsWith(`${spaceId}\0`))
        this.pendingDocumentFlushes.delete(key)
    }
    const prefix = `${spaceId}\0`
    for (const key of this.bundleCache.keys()) {
      if (key.startsWith(prefix)) this.bundleCache.delete(key)
    }
    for (const [id, pending] of this.pendingSemanticUi) {
      if (pending.request.spaceId !== spaceId) continue
      clearTimeout(pending.timer)
      this.pendingSemanticUi.delete(id)
      this.sendSemanticUiCancellation(id)
      pending.reject(new FileExtensionRuntimeError("RUNTIME_STALE", reason))
    }
  }

  private async disposeAllResources(reason: string): Promise<void> {
    const spaceIds = new Set([
      ...this.watchers.keys(),
      ...this.registry.getAllSpaces().map((space) => space.id),
    ])
    for (const spaceId of this.watchers.keys()) this.stopWatcher(spaceId)
    this.developmentManager.stopAll()
    this.runtimeManager.disposeAll(reason)
    this.disposePanelSessions(() => true, reason)
    await Promise.all(
      [...spaceIds].map((spaceId) =>
        this.documentManager.flushAndDisposeSpace(spaceId, reason)
      )
    )
    this.packageDirectories.clear()
    this.pendingDocumentFlushes.clear()
    this.bundleCache.clear()
    for (const [id, pending] of this.pendingSemanticUi) {
      clearTimeout(pending.timer)
      this.pendingSemanticUi.delete(id)
      this.sendSemanticUiCancellation(id)
      pending.reject(new FileExtensionRuntimeError("RUNTIME_DISPOSED", reason))
    }
  }

  private snapshotCacheKey(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity,
    target: "worker" | "surface"
  ): string {
    return [
      spaceId,
      snapshot.packageId,
      snapshot.contentDigest,
      snapshot.permissionHash,
      target,
    ].join("\0")
  }

  private panelSessionKey(
    spaceId: string,
    packageId: string,
    panelId: string
  ): string {
    return [spaceId, packageId, panelId].join("\0")
  }

  private openOrUpdatePanelSession(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity,
    panelId: string,
    state: ExtensionRuntimeJsonValue | undefined,
    prepared: PreparedFileExtensionPanel
  ): FileExtensionOpenPanelResult {
    const key = this.panelSessionKey(spaceId, snapshot.packageId, panelId)
    const existingId = this.panelSessionIdsByKey.get(key)
    const existing = existingId ? this.panelSessions.get(existingId) : undefined
    if (
      !existing &&
      [...this.panelSessions.values()].filter(
        (session) => session.spaceId === spaceId
      ).length >= MAX_OPEN_EXTENSION_PANELS_PER_SPACE
    ) {
      throw new FileExtensionRuntimeError(
        "CAPABILITY_DENIED",
        `A Space can have at most ${MAX_OPEN_EXTENSION_PANELS_PER_SPACE} extension panels open`
      )
    }
    const session: FileExtensionPanelSession = existing
      ? {
          ...existing,
          snapshot: { ...snapshot },
          title: prepared.title,
          generation: prepared.generation,
          source: prepared.source,
          state,
          revision: existing.revision + 1,
          suspended: false,
        }
      : {
          key,
          spaceId,
          sessionId: randomUUID(),
          packageId: snapshot.packageId,
          panelId,
          title: prepared.title,
          revision: 1,
          generation: prepared.generation,
          source: prepared.source,
          state,
          snapshot: { ...snapshot },
          suspended: false,
        }
    this.panelSessions.set(session.sessionId, session)
    this.panelSessionIdsByKey.set(key, session.sessionId)
    this.emitPanelOpen(session)
    return this.publicPanelSession(session)
  }

  private resumeDevelopmentPanelSessions(
    spaceId: string,
    snapshot: ExtensionSnapshotIdentity,
    panels: readonly ExtensionPanelContribution[],
    bundleCode: string | undefined
  ): void {
    const authorization = this.developmentManager.authorize(spaceId, snapshot)
    if (!authorization) return
    const localState: ExtensionLocalState = {
      snapshot: { ...snapshot },
      trusted: true,
      enabled: true,
      requestedGrants: authorization.requestedGrants,
      granted: authorization.granted,
    }
    const generation = this.surfaceGeneration(snapshot, localState)
    const source = bundleCode
      ? createExtensionSurfaceSource({
          bundleCode,
          extensionId: snapshot.packageId,
          generation,
        })
      : undefined

    for (const session of [...this.panelSessions.values()]) {
      if (
        !session.suspended ||
        session.spaceId !== spaceId ||
        session.packageId !== snapshot.packageId
      ) {
        continue
      }
      const contribution = panels.find((panel) => panel.id === session.panelId)
      if (!contribution || !source) {
        this.disposePanelSession(
          session,
          "The extension no longer contributes this panel"
        )
        continue
      }
      const resumed: FileExtensionPanelSession = {
        ...session,
        snapshot: { ...snapshot },
        title: contribution.displayName,
        generation,
        source,
        revision: session.revision + 1,
        suspended: false,
      }
      this.panelSessions.set(resumed.sessionId, resumed)
      this.emitPanelOpen(resumed)
    }
  }

  private emitPanelOpen(session: FileExtensionPanelSession): void {
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:open-panel", {
        spaceId: session.spaceId,
        sessionId: session.sessionId,
        title: session.title,
        revision: session.revision,
      })
  }

  private requirePanelSession(
    spaceId: string,
    request: FileExtensionPanelSessionRequest
  ): FileExtensionPanelSession {
    if (!request || typeof request.sessionId !== "string") {
      throw new Error("An extension panel session ID is required")
    }
    const session = this.panelSessions.get(request.sessionId)
    if (!session || session.spaceId !== spaceId) {
      throw new Error("Extension panel session is unavailable")
    }
    return session
  }

  private publicPanelSession(
    session: FileExtensionPanelSession
  ): FileExtensionOpenPanelResult {
    return {
      sessionId: session.sessionId,
      packageId: session.packageId,
      panelId: session.panelId,
      title: session.title,
      revision: session.revision,
      generation: session.generation,
      source: session.source,
      state: session.state,
    }
  }

  private deletePanelSession(session: FileExtensionPanelSession): void {
    this.panelSessions.delete(session.sessionId)
    if (this.panelSessionIdsByKey.get(session.key) === session.sessionId) {
      this.panelSessionIdsByKey.delete(session.key)
    }
  }

  private invalidatePanelSessions(
    matches: (session: FileExtensionPanelSession) => boolean,
    reason: string
  ): void {
    for (const session of [...this.panelSessions.values()]) {
      if (!matches(session)) continue
      const development = this.developmentManager.get(
        session.spaceId,
        session.packageId
      )
      if (development?.status === "checking") {
        session.suspended = true
        this.panelSessions.set(session.sessionId, session)
      } else {
        this.disposePanelSession(session, reason)
      }
    }
  }

  private disposePanelSession(
    session: FileExtensionPanelSession,
    reason: string
  ): void {
    this.deletePanelSession(session)
    this.windowProvider
      .getWindow()
      ?.webContents.send("file-extensions:panel-disposed", {
        spaceId: session.spaceId,
        sessionId: session.sessionId,
        reason,
      })
  }

  private disposePanelSessions(
    matches: (session: FileExtensionPanelSession) => boolean,
    reason: string
  ): void {
    for (const session of [...this.panelSessions.values()]) {
      if (!matches(session)) continue
      this.disposePanelSession(session, reason)
    }
  }
}
