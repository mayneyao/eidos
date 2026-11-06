import type {
  EidosLiteAutomaticSync,
  EidosSyncQueueStatus,
  EidosSyncRunResponse,
} from "../../shared/contracts"
import { classifySyncFailure } from "./sync-failure"

export const AUTOMATIC_SYNC_INTERVAL_MS = 10 * 60_000
export const AUTOMATIC_SYNC_IDLE_SECONDS = 30
export const AUTOMATIC_SYNC_DEBOUNCE_MS = 5_000
const RETRY_BASE_MS = 30_000
const RETRY_MAX_MS = 15 * 60_000
// Zero means retryable failures have no attempt limit. Backoff is bounded;
// being offline for a long time must not silently disable automatic Sync.
const MAX_ATTEMPTS = 0

interface AutomaticSyncBinding {
  spaceId: string
  revision: string
  current(): boolean
  available(): boolean
  execute(signal: AbortSignal): Promise<EidosSyncRunResponse>
  emit(status: EidosSyncQueueStatus): void
}

interface Entry {
  binding: AutomaticSyncBinding
  dueAt: number
  status: EidosSyncQueueStatus
  operation?: AbortController
  running?: Promise<void>
  manual: number
  stopped: boolean
}

interface AutomaticSyncOptions {
  focused(): boolean
  now?: () => number
  onError?: (error: unknown) => void
}

/** Scheduling only. SpaceSession owns checkpoint, transfer, and materialization safety. */
export class AutomaticSync {
  private readonly entries = new Map<string, Entry>()
  private readonly now: () => number
  private mode: EidosLiteAutomaticSync = "off"
  private suspended = false
  private lastActivity: number
  private closed = false

  constructor(private readonly options: AutomaticSyncOptions) {
    this.now = options.now ?? Date.now
    this.lastActivity = this.now()
  }

  configure(mode: EidosLiteAutomaticSync): void {
    if (mode === this.mode) return
    this.mode = mode
    for (const entry of this.entries.values()) {
      entry.operation?.abort()
      entry.dueAt = this.now() + AUTOMATIC_SYNC_INTERVAL_MS
      entry.status = this.idle(entry.binding.spaceId)
      entry.binding.emit(entry.status)
    }
  }

  attach(binding: AutomaticSyncBinding): void {
    const previous = this.entries.get(binding.spaceId)
    if (previous?.binding.revision === binding.revision) {
      previous.binding = binding
      return
    }
    this.detach(binding.spaceId)
    this.entries.set(binding.spaceId, {
      binding,
      dueAt: this.now() + AUTOMATIC_SYNC_INTERVAL_MS,
      status: this.idle(binding.spaceId),
      manual: 0,
      stopped: false,
    })
  }

  changed(spaceId: string): void {
    const entry = this.entries.get(spaceId)
    if (
      !entry ||
      this.mode !== "on-change" ||
      entry.status.state === "paused" ||
      entry.status.state === "retry-wait"
    )
      return
    // A quiet five-second window coalesces saves. The ten-minute deadline is
    // retained so continuous external saves cannot postpone remote checks forever.
    entry.dueAt = Math.min(entry.dueAt, this.now() + AUTOMATIC_SYNC_DEBOUNCE_MS)
  }

  status(spaceId: string): EidosSyncQueueStatus | undefined {
    return this.entries.get(spaceId)?.status
  }

  recover(spaceId: string, codes: readonly string[]): void {
    const entry = this.entries.get(spaceId)
    if (
      !entry ||
      entry.status.state !== "paused" ||
      !codes.includes(entry.status.lastFailure?.code ?? "")
    )
      return
    entry.status = this.idle(spaceId)
    entry.dueAt = this.now() + AUTOMATIC_SYNC_DEBOUNCE_MS
    entry.binding.emit(entry.status)
  }

  activity(): void {
    this.lastActivity = this.now()
    for (const entry of this.entries.values()) entry.operation?.abort()
  }

  suspend(): void {
    this.suspended = true
    this.activity()
  }

  resume(): void {
    this.suspended = false
    this.activity()
  }

  detach(spaceId: string): void {
    const entry = this.entries.get(spaceId)
    if (!entry) return
    entry.stopped = true
    entry.operation?.abort()
    this.entries.delete(spaceId)
  }

  async manual<T>(spaceId: string, action: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(spaceId)
    if (!entry) return action()
    entry.manual += 1
    entry.operation?.abort()
    try {
      await entry.running
      return await action()
    } finally {
      entry.manual -= 1
      entry.status = this.idle(spaceId)
      entry.dueAt = this.now() + AUTOMATIC_SYNC_INTERVAL_MS
      if (this.current(entry)) entry.binding.emit(entry.status)
    }
  }

  /** Called once a second, and after settings/lifecycle changes. Never overlaps a Space run. */
  async tick(): Promise<void> {
    const idle = this.isIdle()
    if (!idle || this.mode === "off" || this.closed) {
      for (const entry of this.entries.values()) entry.operation?.abort()
      return
    }
    const tasks: Promise<void>[] = []
    for (const entry of this.entries.values()) {
      if (!this.current(entry)) {
        this.detach(entry.binding.spaceId)
        continue
      }
      if (
        entry.running ||
        entry.manual ||
        entry.status.state === "paused" ||
        this.now() < entry.dueAt
      )
        continue
      if (!entry.binding.available()) {
        if (entry.status.state !== "pending") {
          entry.status = {
            ...entry.status,
            state: "pending",
            trigger: "automatic",
            queuedAtMs: this.now(),
          }
          entry.binding.emit(entry.status)
        }
        continue
      }
      const operation = new AbortController()
      entry.operation = operation
      entry.running = this.run(entry, operation).finally(() => {
        entry.running = undefined
        entry.operation = undefined
      })
      tasks.push(entry.running)
    }
    await Promise.allSettled(tasks)
  }

  async close(): Promise<void> {
    this.closed = true
    const running = [...this.entries.values()].flatMap((entry) => {
      entry.stopped = true
      entry.operation?.abort()
      return entry.running ? [entry.running] : []
    })
    await Promise.allSettled(running)
    this.entries.clear()
  }

  private async run(entry: Entry, operation: AbortController): Promise<void> {
    entry.status = {
      ...entry.status,
      state: "running",
      trigger: "automatic",
      queuedAtMs: this.now(),
      nextAttemptAtMs: undefined,
    }
    entry.binding.emit(entry.status)
    try {
      const response = await entry.binding.execute(operation.signal)
      if (!this.current(entry)) return
      if (operation.signal.aborted) {
        this.defer(entry)
      } else if (response.ok) {
        entry.dueAt = this.now() + AUTOMATIC_SYNC_INTERVAL_MS
        // Divergence is a decision for the existing conflict workspace. Do not
        // repeat automatic checkpoints or attempt a three-way merge.
        entry.status =
          response.result.state === "conflict"
            ? {
                ...this.idle(entry.binding.spaceId),
                state: "paused",
                trigger: "automatic",
                lastFailure: {
                  ...classifySyncFailure(
                    new Error("Local and Hosted history diverged")
                  ),
                  retryable: false,
                  action: "review-local",
                  actionLabel: "Review changes",
                  message: response.result.message,
                },
              }
            : this.idle(entry.binding.spaceId)
      } else {
        const attempt = entry.status.attempt + 1
        if (response.failure.code === "local-changes") {
          this.defer(entry)
          entry.dueAt = this.now() + AUTOMATIC_SYNC_DEBOUNCE_MS
          entry.binding.emit(entry.status)
          return
        }
        const retryable = response.failure.retryable
        const delay = Math.max(
          Math.min(
            RETRY_MAX_MS,
            RETRY_BASE_MS * 2 ** Math.min(10, attempt - 1)
          ),
          response.failure.retryAfterMs ?? 0
        )
        entry.dueAt = this.now() + delay
        entry.status = {
          ...entry.status,
          state: retryable ? "retry-wait" : "paused",
          attempt,
          lastFailure: response.failure,
          ...(retryable ? { nextAttemptAtMs: entry.dueAt } : {}),
        }
      }
    } catch (error) {
      if (!this.current(entry)) return
      if (
        operation.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        this.defer(entry)
      } else {
        entry.status = {
          ...entry.status,
          state: "paused",
          lastFailure: classifySyncFailure(error),
        }
        this.options.onError?.(error)
      }
    }
    if (this.current(entry)) entry.binding.emit(entry.status)
  }

  private defer(entry: Entry): void {
    entry.status = this.idle(entry.binding.spaceId)
    entry.dueAt = Math.min(entry.dueAt, this.now())
  }

  private isIdle(): boolean {
    const grace = this.options.focused()
      ? AUTOMATIC_SYNC_IDLE_SECONDS * 1_000
      : AUTOMATIC_SYNC_DEBOUNCE_MS
    return !this.suspended && this.now() - this.lastActivity >= grace
  }

  private current(entry: Entry): boolean {
    return (
      !entry.stopped &&
      !this.closed &&
      this.entries.get(entry.binding.spaceId) === entry &&
      entry.binding.current()
    )
  }

  private idle(spaceId: string): EidosSyncQueueStatus {
    return {
      spaceId,
      state: "idle",
      trigger: "automatic",
      attempt: 0,
      maxAttempts: MAX_ATTEMPTS,
    }
  }
}
