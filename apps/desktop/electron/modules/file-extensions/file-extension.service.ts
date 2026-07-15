import { watch, type FSWatcher } from "node:fs"
import { app } from "electron"
import { IpcMethod, IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  createExtensionCommandTemplate,
  type ExtensionPackageInspection,
  type NormalizedExtensionPermissions,
} from "@eidos.space/extension-manifest"
import { discoverExtensionPackages } from "@eidos.space/extension-manifest/node"
import {
  assertExtensionSnapshotIdentity,
  type ExtensionLocalState,
  type ExtensionPermissionGrant,
  type ExtensionSnapshotIdentity,
} from "@eidos.space/extension-state"
import { BetterSqlite3ExtensionStateStore } from "@eidos.space/extension-state/better-sqlite3"

import { IpcInjectable, Inject } from "../../common/di"
import { withFileSpaceOperationLock } from "../space-management/file-space-operation-lock"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceRegistry } from "../space-management/space-registry"
import {
  ensureExtensionStateDatabasePath,
  resolveExtensionProjectPaths,
} from "./extension-paths"
import { writeExtensionTemplate } from "./extension-template-writer"
import type {
  FileExtensionChangedEvent,
  FileExtensionDiscoveryResult,
  FileExtensionGrantRequest,
  FileExtensionPackageSummary,
  FileExtensionSnapshotRequest,
  FileExtensionTemplateResult,
  FileExtensionWatchResult,
} from "./types"

const FILE_EXTENSION_ROOT = ".eidos/extensions" as const
const WATCH_DEBOUNCE_MS = 120
const LOCAL_EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

interface FileExtensionWatcher {
  root: string
  watcher: FSWatcher
  generation: number
  timer?: ReturnType<typeof setTimeout>
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

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(MainWindowProvider)
    private readonly windowProvider: MainWindowProvider
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
    return this.mutateCurrentSnapshot(spaceId, request, (store, current) =>
      store.trust(current.snapshot, current.requestedGrants)
    )
  }

  @IpcMethod()
  async revokeTrust(
    spaceId: string,
    request: FileExtensionSnapshotRequest
  ): Promise<ExtensionLocalState> {
    return this.mutateCurrentSnapshot(spaceId, request, (store, current) =>
      store.revokeTrust(current.snapshot)
    )
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
    return this.mutateCurrentSnapshot(spaceId, request, (store, current) =>
      store.setEnabled(current.snapshot, enabled)
    )
  }

  @IpcMethod()
  async setGrant(
    spaceId: string,
    request: FileExtensionGrantRequest
  ): Promise<ExtensionLocalState> {
    if (typeof request?.granted !== "boolean") {
      throw new Error("Extension grant state must be a boolean")
    }
    return this.mutateCurrentSnapshot(spaceId, request, (store, current) =>
      store.setGrant(current.snapshot, request.grant, request.granted)
    )
  }

  @IpcMethod()
  async createTemplate(
    spaceId: string,
    name: string
  ): Promise<FileExtensionTemplateResult> {
    const space = this.getFileSpace(spaceId)
    const packageName = this.normalizeLocalExtensionName(name)
    return withFileSpaceOperationLock(spaceId, async () => {
      const template = createExtensionCommandTemplate({
        publisher: "local",
        name: packageName,
        engineRange: `>=${app.getVersion()}`,
      })
      return writeExtensionTemplate(space.path, template)
    })
  }

  @IpcMethod()
  async startWatching(spaceId: string): Promise<FileExtensionWatchResult> {
    const space = this.getFileSpace(spaceId)
    let root: string | undefined
    try {
      root = (await resolveExtensionProjectPaths(space.path)).extensionsRoot
    } catch {
      this.stopWatcher(spaceId)
      return { watching: false, generation: 0, reason: "invalid-root" }
    }
    if (!root) {
      this.stopWatcher(spaceId)
      return { watching: false, generation: 0, reason: "missing-root" }
    }
    const existing = this.watchers.get(spaceId)
    if (existing?.root === root) {
      return { watching: true, generation: existing.generation }
    }
    this.stopWatcher(spaceId)

    try {
      const state: FileExtensionWatcher = {
        root,
        generation: 0,
        watcher: watch(root, { recursive: true }, () => {
          this.scheduleChange(spaceId)
        }),
      }
      state.watcher.on("error", () => {
        this.stopWatcher(spaceId)
      })
      this.watchers.set(spaceId, state)
      return { watching: true, generation: 0 }
    } catch {
      return { watching: false, generation: 0, reason: "watch-error" }
    }
  }

  @IpcMethod()
  stopWatching(spaceId: string): FileExtensionWatchResult {
    const generation = this.watchers.get(spaceId)?.generation ?? 0
    this.stopWatcher(spaceId)
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
        phase: "local-state",
        executionAvailable: false,
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
    state.generation += 1
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      const current = this.watchers.get(spaceId)
      if (!current) return
      current.timer = undefined
      const event: FileExtensionChangedEvent = {
        spaceId,
        generation: current.generation,
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
}
