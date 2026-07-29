import fs, { type FSWatcher } from "node:fs"

export class SpaceWatcher {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private closed = false

  constructor(
    private readonly root: string,
    private readonly onStableChange: () => void,
    private readonly debounceMs = 150
  ) {}

  start(): void {
    if (this.watcher || this.closed) return
    this.watcher = fs.watch(
      this.root,
      { recursive: true, persistent: false },
      (_eventType, fileName) => {
        const relativePath = String(fileName ?? "")
        if (
          relativePath === ".graft" ||
          relativePath.startsWith(".graft/") ||
          relativePath.startsWith(".graft\\")
        ) {
          return
        }
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          this.timer = null
          if (!this.closed) this.onStableChange()
        }, this.debounceMs)
      }
    )
    this.watcher.on("error", () => this.onStableChange())
  }

  close(): void {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.watcher?.close()
    this.watcher = null
  }
}
