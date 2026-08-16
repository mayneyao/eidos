import type {
  EidosSyncFailureCode,
  EidosSyncQueueStatus,
  EidosSyncQueueTrigger,
  EidosSyncRunResponse,
} from "../../shared/contracts"
import type { StoredSyncQueueEntry, SyncQueueStore } from "./sync-queue-store"

export const SYNC_RETRY_BASE_MS = 1_000
export const SYNC_RETRY_MAX_MS = 60_000
export const SYNC_RETRY_AFTER_MAX_MS = 15 * 60_000
export const SYNC_RETRY_MAX_ATTEMPTS = 5

interface SyncQueueBinding {
  spaceId: string
  execute(): Promise<EidosSyncRunResponse>
  emit(status: EidosSyncQueueStatus): void
}

interface QueueEntry {
  binding: SyncQueueBinding
  status: EidosSyncQueueStatus
  timer: unknown | null
  inFlight: Promise<EidosSyncRunResponse> | null
  rerunRequested: boolean
  attached: boolean
}

interface BackgroundSyncQueueOptions {
  store: SyncQueueStore
  now?: () => number
  maxAttempts?: number
  schedule?: (task: () => Promise<void>, delayMs: number) => unknown
  cancel?: (timer: unknown) => void
}

function retryDelay(attempt: number, retryAfterMs: number | undefined): number {
  const exponential = Math.min(
    SYNC_RETRY_MAX_MS,
    SYNC_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1)
  )
  return Math.min(
    SYNC_RETRY_AFTER_MAX_MS,
    Math.max(exponential, Math.min(SYNC_RETRY_AFTER_MAX_MS, retryAfterMs ?? 0))
  )
}

export class BackgroundSyncQueue {
  private readonly entries = new Map<string, QueueEntry>()
  private readonly now: () => number
  private readonly maxAttempts: number
  private readonly scheduleTimer: (
    task: () => Promise<void>,
    delayMs: number
  ) => unknown
  private readonly cancelTimer: (timer: unknown) => void
  private closing = false

  constructor(private readonly options: BackgroundSyncQueueOptions) {
    this.now = options.now ?? Date.now
    this.maxAttempts = options.maxAttempts ?? SYNC_RETRY_MAX_ATTEMPTS
    this.scheduleTimer =
      options.schedule ??
      ((task, delayMs) =>
        setTimeout(() => {
          void task()
        }, delayMs))
    this.cancelTimer =
      options.cancel ??
      ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
  }

  async attach(binding: SyncQueueBinding): Promise<EidosSyncQueueStatus> {
    if (this.closing) throw new Error("Eidos Sync queue is closing")
    const existing = this.entries.get(binding.spaceId)
    if (existing) {
      existing.binding = binding
      existing.attached = true
      binding.emit(existing.status)
      return existing.status
    }
    const stored = await this.options.store.read(binding.spaceId)
    const wasRunning = stored?.state === "running"
    const recovered = wasRunning
      ? {
          ...stored,
          state: "pending" as const,
          trigger: "crash-recovery" as const,
          nextAttemptAtMs: undefined,
        }
      : stored
    const status = recovered
      ? this.project(binding.spaceId, recovered)
      : this.idle(binding.spaceId)
    const entry: QueueEntry = {
      binding,
      status,
      timer: null,
      inFlight: null,
      rerunRequested: false,
      attached: true,
    }
    this.entries.set(binding.spaceId, entry)
    binding.emit(status)
    if (wasRunning) {
      await this.persist(entry)
    }
    if (status.state === "pending" || status.state === "retry-wait") {
      this.schedule(entry)
    }
    return status
  }

  status(spaceId: string): EidosSyncQueueStatus {
    return this.entries.get(spaceId)?.status ?? this.idle(spaceId)
  }

  async enqueue(
    spaceId: string,
    trigger: Exclude<EidosSyncQueueTrigger, "manual">
  ): Promise<EidosSyncQueueStatus> {
    const entry = this.requireEntry(spaceId)
    if (entry.status.state === "running") {
      entry.rerunRequested = true
      return entry.status
    }
    const queuedAtMs = this.now()
    entry.status = {
      spaceId,
      state: "pending",
      trigger,
      attempt: 0,
      maxAttempts: this.maxAttempts,
      queuedAtMs,
    }
    await this.persistAndEmit(entry)
    this.schedule(entry)
    return entry.status
  }

  runNow(spaceId: string): Promise<EidosSyncRunResponse> {
    const entry = this.requireEntry(spaceId)
    if (entry.inFlight) return entry.inFlight
    this.clearTimer(entry)
    entry.status = {
      spaceId,
      state: "pending",
      trigger: "manual",
      attempt: 0,
      maxAttempts: this.maxAttempts,
      queuedAtMs: this.now(),
    }
    return this.run(entry)
  }

  async clearResolvedFailure(
    spaceId: string,
    code: EidosSyncFailureCode
  ): Promise<EidosSyncQueueStatus> {
    const entry = this.requireEntry(spaceId)
    if (
      entry.status.state !== "paused" ||
      entry.status.lastFailure?.code !== code
    ) {
      return entry.status
    }
    entry.status = this.idle(spaceId)
    await this.persistAndEmit(entry)
    return entry.status
  }

  async pause(
    spaceId: string,
    response: Extract<EidosSyncRunResponse, { ok: false }>
  ): Promise<void> {
    const entry = this.requireEntry(spaceId)
    this.clearTimer(entry)
    entry.rerunRequested = false
    await entry.inFlight?.catch(() => undefined)
    entry.status = {
      spaceId,
      state: "paused",
      trigger: entry.status.trigger ?? "manual",
      attempt: entry.status.attempt,
      maxAttempts: this.maxAttempts,
      queuedAtMs: entry.status.queuedAtMs ?? this.now(),
      lastFailure: response.failure,
    }
    await this.persistAndEmit(entry)
  }

  async detach(spaceId: string): Promise<void> {
    const entry = this.entries.get(spaceId)
    if (!entry) return
    entry.attached = false
    this.clearTimer(entry)
    if (entry.status.state === "running") {
      entry.status = {
        ...entry.status,
        state: "pending",
        trigger: "crash-recovery",
        nextAttemptAtMs: undefined,
      }
      await this.persist(entry)
    }
    if (!entry.inFlight) this.entries.delete(spaceId)
  }

  async close(): Promise<void> {
    this.closing = true
    for (const entry of this.entries.values()) {
      this.clearTimer(entry)
      if (entry.status.state === "running") {
        entry.status = {
          ...entry.status,
          state: "pending",
          trigger: "crash-recovery",
          nextAttemptAtMs: undefined,
        }
        await this.persist(entry)
      }
    }
    await Promise.allSettled(
      [...this.entries.values()].flatMap((entry) =>
        entry.inFlight ? [entry.inFlight] : []
      )
    )
    this.entries.clear()
  }

  private run(entry: QueueEntry): Promise<EidosSyncRunResponse> {
    if (entry.inFlight) return entry.inFlight
    this.clearTimer(entry)
    entry.status = {
      ...entry.status,
      state: "running",
      nextAttemptAtMs: undefined,
    }
    const scheduled = this.persistAndEmit(entry)
      .then(() => entry.binding.execute())
      .then(async (response) => {
        if (response.ok) {
          if (entry.rerunRequested) {
            entry.rerunRequested = false
            entry.status = {
              spaceId: entry.binding.spaceId,
              state: "pending",
              trigger: "local-checkpoint",
              attempt: 0,
              maxAttempts: this.maxAttempts,
              queuedAtMs: this.now(),
            }
            await this.persistAndEmit(entry)
            this.schedule(entry)
          } else {
            entry.status = this.idle(entry.binding.spaceId)
            await this.persistAndEmit(entry)
          }
          return response
        }
        const attempt = entry.status.attempt + 1
        if (response.failure.retryable && attempt < this.maxAttempts) {
          const nextAttemptAtMs =
            this.now() + retryDelay(attempt, response.failure.retryAfterMs)
          entry.status = {
            spaceId: entry.binding.spaceId,
            state: "retry-wait",
            trigger: entry.status.trigger ?? "manual",
            attempt,
            maxAttempts: this.maxAttempts,
            queuedAtMs: entry.status.queuedAtMs ?? this.now(),
            nextAttemptAtMs,
            lastFailure: response.failure,
          }
          await this.persistAndEmit(entry)
          this.schedule(entry)
        } else {
          entry.status = {
            spaceId: entry.binding.spaceId,
            state: "paused",
            trigger: entry.status.trigger ?? "manual",
            attempt,
            maxAttempts: this.maxAttempts,
            queuedAtMs: entry.status.queuedAtMs ?? this.now(),
            lastFailure: response.failure,
          }
          await this.persistAndEmit(entry)
        }
        return response
      })
      .finally(() => {
        entry.inFlight = null
        if (!entry.attached) this.entries.delete(entry.binding.spaceId)
      })
    entry.inFlight = scheduled
    return scheduled
  }

  private schedule(entry: QueueEntry): void {
    if (this.closing || entry.timer) return
    const delay = Math.max(
      0,
      (entry.status.nextAttemptAtMs ?? this.now()) - this.now()
    )
    entry.timer = this.scheduleTimer(async () => {
      entry.timer = null
      if (!this.closing) {
        await this.run(entry).catch((error) => {
          console.error("Background Eidos Sync queue failed", error)
        })
      }
    }, delay)
  }

  private clearTimer(entry: QueueEntry): void {
    if (!entry.timer) return
    this.cancelTimer(entry.timer)
    entry.timer = null
  }

  private async persistAndEmit(entry: QueueEntry): Promise<void> {
    await this.persist(entry)
    entry.binding.emit(entry.status)
  }

  private persist(entry: QueueEntry): Promise<void> {
    const status = entry.status
    if (status.state === "idle") {
      return this.options.store.write(status.spaceId, null)
    }
    return this.options.store.write(status.spaceId, {
      version: 1,
      state: status.state,
      trigger: status.trigger ?? "manual",
      attempt: status.attempt,
      queuedAtMs: status.queuedAtMs ?? this.now(),
      ...(status.nextAttemptAtMs === undefined
        ? {}
        : { nextAttemptAtMs: status.nextAttemptAtMs }),
      ...(status.lastFailure === undefined
        ? {}
        : { lastFailure: status.lastFailure }),
    })
  }

  private project(
    spaceId: string,
    stored: StoredSyncQueueEntry
  ): EidosSyncQueueStatus {
    return {
      spaceId,
      state: stored.state,
      trigger: stored.trigger,
      attempt: stored.attempt,
      maxAttempts: this.maxAttempts,
      queuedAtMs: stored.queuedAtMs,
      ...(stored.nextAttemptAtMs === undefined
        ? {}
        : { nextAttemptAtMs: stored.nextAttemptAtMs }),
      ...(stored.lastFailure === undefined
        ? {}
        : { lastFailure: stored.lastFailure }),
    }
  }

  private idle(spaceId: string): EidosSyncQueueStatus {
    return {
      spaceId,
      state: "idle",
      trigger: null,
      attempt: 0,
      maxAttempts: this.maxAttempts,
    }
  }

  private requireEntry(spaceId: string): QueueEntry {
    const entry = this.entries.get(spaceId)
    if (!entry) throw new Error("Open the Space before scheduling Eidos Sync")
    return entry
  }
}
