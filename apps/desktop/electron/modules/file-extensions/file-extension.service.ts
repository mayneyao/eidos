import { watch, type FSWatcher } from "node:fs"
import { randomUUID } from "node:crypto"
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
  type ExtensionPackageInspection,
  type NormalizedExtensionPermissions,
} from "@eidos.space/extension-manifest"
import {
  discoverExtensionPackages,
  inspectExtensionPackageSnapshot,
} from "@eidos.space/extension-manifest/node"
import { type ExtensionRuntimeRpcRequest } from "@eidos.space/extension-runtime"
import { compileExtensionWorker } from "@eidos.space/extension-runtime/compiler"
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
import { writeExtensionTemplate } from "./extension-template-writer"
import {
  FileExtensionRuntimeError,
  type FileExtensionRuntimeDescriptor,
  FileExtensionRuntimeManager,
} from "./runtime/file-extension-runtime-manager"
import type {
  FileExtensionChangedEvent,
  FileExtensionCommandRequest,
  FileExtensionCommandSummary,
  FileExtensionDiscoveryResult,
  FileExtensionGrantRequest,
  FileExtensionPackageSummary,
  FileExtensionSnapshotRequest,
  FileExtensionSemanticUiRequest,
  FileExtensionSemanticUiResponse,
  FileExtensionTemplateResult,
  FileExtensionWatchResult,
} from "./types"

const FILE_EXTENSION_ROOT = ".eidos/extensions" as const
const WATCH_DEBOUNCE_MS = 120
const SEMANTIC_UI_TIMEOUT_MS = 55_000
const LOCAL_EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

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
    private readonly runtimeManager: FileExtensionRuntimeManager
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

    const cacheKey = this.snapshotCacheKey(spaceId, snapshot)
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
    snapshot: ExtensionSnapshotIdentity
  ): string {
    return [
      spaceId,
      snapshot.packageId,
      snapshot.contentDigest,
      snapshot.permissionHash,
    ].join("\0")
  }
}
