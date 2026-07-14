import { watch, type FSWatcher } from "node:fs"
import { app } from "electron"
import { IpcMethod, IpcServiceBase } from "@eidos.space/electron-ipc"
import { createExtensionCommandTemplate } from "@eidos.space/extension-manifest"
import { discoverExtensionPackages } from "@eidos.space/extension-manifest/node"

import { IpcInjectable, Inject } from "../../common/di"
import {
  withFileSpaceOperationLock,
  withFileSpaceReadLock,
} from "../space-management/file-space-operation-lock"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceRegistry } from "../space-management/space-registry"
import { resolveExtensionProjectPaths } from "./extension-paths"
import { writeExtensionTemplate } from "./extension-template-writer"
import type {
  FileExtensionChangedEvent,
  FileExtensionDiscoveryResult,
  FileExtensionPackageSummary,
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
    return withFileSpaceReadLock(spaceId, async () => {
      // This host-owned path is intentionally not exposed through SpaceFiles:
      // public Space file APIs continue to reject all .eidos and .graft paths.
      const paths = await resolveExtensionProjectPaths(space.path)
      const hostVersion = app.getVersion()
      const discovery = paths.extensionsRoot
        ? await discoverExtensionPackages(paths.extensionsRoot, { hostVersion })
        : { packages: [], diagnostics: [] }

      return {
        root: FILE_EXTENSION_ROOT,
        phase: "inspection-only",
        executionAvailable: false,
        hostVersion,
        packages: discovery.packages.map(
          ({ packageRoot: _packageRoot, ...extension }) =>
            extension satisfies FileExtensionPackageSummary
        ),
        diagnostics: discovery.diagnostics,
      }
    })
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
