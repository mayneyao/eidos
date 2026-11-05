import type {
  PluginInstallProgress,
  PluginInstallTask,
} from "../../shared/plugins"

/** Installs retain their target Space and survive renderer navigation. */
export class PluginInstallQueue {
  private readonly tasks = new Map<string, PluginInstallTask>()
  private readonly pending = new Map<string, Promise<boolean>>()
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly changed: () => void) {}

  snapshot(spaceId?: string): Record<string, PluginInstallTask> {
    return Object.fromEntries(
      [...this.tasks.values()]
        .filter((task) => task.spaceId === spaceId)
        .map((task) => [task.id, { ...task }])
    )
  }

  progress(progress: PluginInstallProgress, spaceId?: string): void {
    if (!this.pending.has(this.key(progress.id, spaceId))) return
    this.set({
      id: progress.id,
      spaceId,
      status: progress.phase,
      percent: progress.percent ?? 0,
    })
  }

  run(
    id: string,
    install: () => Promise<boolean>,
    spaceId?: string
  ): Promise<boolean> {
    const key = this.key(id, spaceId)
    const existing = this.pending.get(key)
    if (existing) return existing
    this.set({ id, spaceId, status: "queued", percent: 0 })
    const result = this.tail.then(async () => {
      this.set({ id, spaceId, status: "downloading", percent: 0 })
      try {
        const installed = await install()
        this.set({
          id,
          spaceId,
          status: installed ? "installed" : "cancelled",
          percent: installed ? 100 : 0,
        })
        return installed
      } catch (cause) {
        this.set({
          id,
          spaceId,
          status: "failed",
          percent: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        })
        throw cause
      } finally {
        this.pending.delete(key)
      }
    })
    this.pending.set(key, result)
    this.tail = result.catch(() => {})
    return result
  }

  private set(task: PluginInstallTask): void {
    this.tasks.set(this.key(task.id, task.spaceId), task)
    this.changed()
  }

  private key(id: string, spaceId?: string): string {
    return `${spaceId ?? ""}\0${id}`
  }
}
