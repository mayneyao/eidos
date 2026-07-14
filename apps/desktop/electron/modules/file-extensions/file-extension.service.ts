import { watch, type FSWatcher } from "node:fs"
import { lstat } from "node:fs/promises"
import path from "node:path"
import { app } from "electron"
import { IpcMethod, IpcServiceBase } from "@eidos.space/electron-ipc"
import { discoverExtensionPackages } from "@eidos.space/extension-manifest/node"

import { IpcInjectable, Inject } from "../../common/di"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceRegistry } from "../space-management/space-registry"
import type {
  FileExtensionChangedEvent,
  FileExtensionDiscoveryResult,
  FileExtensionPackageSummary,
  FileExtensionWatchResult,
} from "./types"

const FILE_EXTENSION_ROOT = ".eidos/extensions" as const
const WATCH_DEBOUNCE_MS = 120

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

    // This host-owned path is intentionally not exposed through SpaceFiles:
    // public Space file APIs continue to reject all .eidos and .graft paths.
    const extensionsRoot = path.join(space.path, ".eidos", "extensions")
    const hostVersion = app.getVersion()
    const discovery = await discoverExtensionPackages(extensionsRoot, {
      hostVersion,
    })

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
  }

  @IpcMethod()
  async startWatching(spaceId: string): Promise<FileExtensionWatchResult> {
    const space = this.getFileSpace(spaceId)
    const root = path.join(space.path, ".eidos", "extensions")
    const existing = this.watchers.get(spaceId)
    if (existing?.root === root) {
      return { watching: true, generation: existing.generation }
    }
    this.stopWatcher(spaceId)

    try {
      const rootStats = await lstat(root)
      if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
        return { watching: false, generation: 0, reason: "invalid-root" }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return { watching: false, generation: 0, reason: "missing-root" }
      }
      return { watching: false, generation: 0, reason: "watch-error" }
    }

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
