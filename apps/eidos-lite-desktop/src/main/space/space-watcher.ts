import fs, { type FSWatcher } from "node:fs"
import path from "node:path"

export class SpaceWatcher {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private readonly pendingPaths = new Set<string>()
  private filtering = false
  private closed = false

  constructor(
    private readonly root: string,
    private readonly onStableChange: (relativePaths: readonly string[]) => void,
    private readonly debounceMs = 150,
    private readonly ignoredPaths: (
      relativePaths: readonly string[]
    ) => Promise<ReadonlySet<string>> = async () => new Set(),
    private readonly ignoreEvent: (relativePath: string) => boolean = () =>
      false
  ) {}

  start(): void {
    if (this.watcher || this.closed) return
    this.watcher = fs.watch(
      this.root,
      { recursive: true, persistent: false },
      (_eventType, fileName) => {
        const relativePath = String(fileName ?? "")
        if (
          relativePath === path.basename(this.root) &&
          !fs.existsSync(path.join(this.root, relativePath))
        ) {
          return
        }
        if (
          relativePath === ".graft" ||
          relativePath.startsWith(".graft/") ||
          relativePath.startsWith(".graft\\")
        ) {
          return
        }
        const normalizedPath = relativePath.split("\\").join("/")
        if (this.ignoreEvent(normalizedPath)) return
        this.pendingPaths.add(normalizedPath)
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          this.timer = null
          void this.flush()
        }, this.debounceMs)
      }
    )
    this.watcher.on("error", () => this.onStableChange([]))
  }

  close(): void {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pendingPaths.clear()
    this.watcher?.close()
    this.watcher = null
  }

  private async flush(): Promise<void> {
    if (this.closed || this.filtering) return
    this.filtering = true
    const paths = [...this.pendingPaths]
    this.pendingPaths.clear()
    try {
      let relevant = false
      try {
        const ignored = await this.ignoredPaths(paths)
        relevant = paths.some((relativePath) => !ignored.has(relativePath))
      } catch {
        relevant = true
      }
      if (!this.closed && relevant) this.onStableChange(paths)
    } finally {
      this.filtering = false
      if (!this.closed && this.pendingPaths.size > 0 && !this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null
          void this.flush()
        }, this.debounceMs)
      }
    }
  }
}
