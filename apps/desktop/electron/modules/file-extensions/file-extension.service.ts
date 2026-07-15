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
  type ExtensionFileEditorSelector,
  type ExtensionPackageInspection,
  type NormalizedExtensionPermissions,
} from "@eidos.space/extension-manifest"
import {
  discoverExtensionPackages,
  inspectExtensionPackageSnapshot,
} from "@eidos.space/extension-manifest/node"
import { type ExtensionRuntimeRpcRequest } from "@eidos.space/extension-runtime"
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
} from "@eidos.space/extension-state"
import { BetterSqlite3ExtensionStateStore } from "@eidos.space/extension-state/better-sqlite3"
import { minimatch } from "minimatch"

import { IpcInjectable, Inject } from "../../common/di"
import {
  withFileSpaceOperationLock,
  withFileSpaceReadLock,
} from "../space-management/file-space-operation-lock"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceRegistry } from "../space-management/space-registry"
import {
  ensureExtensionStateDatabasePath,
  resolveExtensionProjectPaths,
} from "./extension-paths"
import { FileExtensionInstallManager } from "./file-extension-install-manager"
import { FileExtensionDocumentManager } from "./file-extension-document-manager"
import { writeExtensionTemplate } from "./extension-template-writer"
import {
  FileExtensionRuntimeError,
  type FileExtensionRuntimeDescriptor,
  FileExtensionRuntimeManager,
} from "./runtime/file-extension-runtime-manager"
import type {
  FileExtensionChangedEvent,
  FileExtensionApplyInstallRequest,
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
  FileExtensionPackageSummary,
  FileExtensionSnapshotRequest,
  FileExtensionResolveConflictRequest,
  FileExtensionSurfaceRequestResult,
  FileExtensionSemanticUiRequest,
  FileExtensionSemanticUiResponse,
  FileExtensionTemplateResult,
  FileExtensionUninstallRequest,
  FileExtensionWatchResult,
} from "./types"

const FILE_EXTENSION_ROOT = ".eidos/extensions" as const
const WATCH_DEBOUNCE_MS = 120
const SEMANTIC_UI_TIMEOUT_MS = 55_000
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
  private readonly pendingSemanticUi = new Map<
    string,
    PendingSemanticUiRequest
  >()

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
    )
  ) {
    super()
  }

  @IpcMethod()
  async discover(spaceId: string): Promise<FileExtensionDiscoveryResult> {
    const space = this.getFileSpace(spaceId)
    return withFileSpaceOperationLock(spaceId, () =>
      this.discoverUnlocked(space.path)
    )
  }

  @IpcMethod()
  async trust(
    spaceId: string,
    request: FileExtensionSnapshotRequest
  ): Promise<ExtensionLocalState> {
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
  async listCommands(spaceId: string): Promise<FileExtensionCommandSummary[]> {
    const discovery = await this.discover(spaceId)
    return discovery.packages.flatMap((extension) => {
      if (
        extension.lifecycleStatus !== "enabled" ||
        !extension.manifest ||
        !extension.canonicalId ||
        !extension.contentDigest ||
        !extension.permissionHash
      ) {
        return []
      }
      const snapshot = {
        packageId: extension.canonicalId,
        contentDigest: extension.contentDigest,
        permissionHash: extension.permissionHash,
      }
      const menus = extension.manifest.contributes.menus ?? {}
      return (extension.manifest.contributes.commands ?? []).map((command) => ({
        ...snapshot,
        ...command,
        extensionDisplayName: extension.manifest!.displayName,
        menus: Object.fromEntries(
          Object.entries(menus).flatMap(([menuId, items]) => {
            const matching = items.filter((item) => item.command === command.id)
            return matching.length > 0 ? [[menuId, matching]] : []
          })
        ),
      }))
    })
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
        if (
          extension.lifecycleStatus !== "enabled" ||
          !extension.manifest?.entrypoints.ui ||
          !extension.canonicalId ||
          !extension.contentDigest ||
          !extension.permissionHash ||
          !extension.localState ||
          !this.hasPathGrant(extension.localState, "files.read", relativePath)
        ) {
          return []
        }
        const snapshot = {
          packageId: extension.canonicalId,
          contentDigest: extension.contentDigest,
          permissionHash: extension.permissionHash,
        }
        const editable = this.hasPathGrant(
          extension.localState,
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
    name: string
  ): Promise<FileExtensionTemplateResult> {
    const space = this.getFileSpace(spaceId)
    const packageName = this.normalizeLocalExtensionName(name)
    const result = await withFileSpaceOperationLock(spaceId, async () => {
      const template = createExtensionCommandTemplate({
        publisher: "local",
        name: packageName,
        engineRange: `>=${app.getVersion()}`,
      })
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
        watcher: watch(root, { recursive: true }, () => {
          this.scheduleChange(spaceId)
        }),
      }
      state.watcher.unref()
      state.watcher.on("error", () => {
        this.stopWatcher(spaceId)
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

  private async discoverUnlocked(
    spacePath: string
  ): Promise<FileExtensionDiscoveryResult> {
    // This host-owned path is intentionally not exposed through SpaceFiles:
    // public Space file APIs continue to reject all .eidos and .graft paths.
    const paths = await resolveExtensionProjectPaths(spacePath)
    const hostVersion = app.getVersion()
    const discovery = paths.extensionsRoot
      ? await discoverExtensionPackages(paths.extensionsRoot, { hostVersion })
      : { packages: [], diagnostics: [] }
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

    try {
      return {
        root: FILE_EXTENSION_ROOT,
        phase: "runtime-preview",
        executionAvailable: true,
        hostVersion,
        packages: discovery.packages.map((extension) =>
          this.toPackageSummary(extension, stateStore)
        ),
        diagnostics: discovery.diagnostics,
      }
    } finally {
      stateStore?.close()
    }
  }

  private toPackageSummary(
    extension: ExtensionPackageInspection,
    stateStore: BetterSqlite3ExtensionStateStore | undefined
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
        lifecycleStatus: extension.status,
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
        lifecycleStatus: "invalid",
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
      localState,
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

  private scheduleChange(spaceId: string): void {
    const state = this.watchers.get(spaceId)
    if (!state) return
    this.invalidateSpaceRuntime(spaceId, "Extension source changed on disk")
    state.generation = this.nextGeneration(spaceId)
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      const current = this.watchers.get(spaceId)
      if (!current) return
      current.timer = undefined
      const event: FileExtensionChangedEvent = {
        spaceId,
        generation: this.changeGenerations.get(spaceId) ?? current.generation,
      }
      this.windowProvider
        .getWindow()
        ?.webContents.send("file-extensions:changed", event)
    }, WATCH_DEBOUNCE_MS)
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
      const localState = store.get(snapshot)
      if (!localState.trusted || !localState.enabled) {
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
      localState = store.get(snapshot)
      if (!localState.trusted || !localState.enabled) {
        throw new Error(
          "Extension must be trusted and enabled before opening its editor"
        )
      }
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
      const state = store.get(snapshot)
      if (!state.trusted || !state.enabled) {
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

  private requestSemanticUi(
    spaceId: string,
    packageId: string,
    rpc: Exclude<
      ExtensionRuntimeRpcRequest,
      { method: "space.files.readText" | "window.showNotice" }
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

  private invalidateSpaceRuntime(spaceId: string, reason: string): void {
    this.runtimeManager.disposeSpace(spaceId, reason)
    void this.documentManager.flushAndDisposeSpace(spaceId, reason)
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
}
