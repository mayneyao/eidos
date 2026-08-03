export interface StableCheckpointSchedulerOptions {
  quietMs?: number
  maxWaitMs?: number
  run(): Promise<void>
  onError(error: unknown): void
}

export const AUTOMATIC_CHECKPOINT_QUIET_MS = 30_000
export const AUTOMATIC_CHECKPOINT_MAX_WAIT_MS = 5 * 60_000

export class StableCheckpointScheduler {
  private quietTimer: NodeJS.Timeout | null = null
  private maxWaitTimer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private pending = false
  private accepting = true

  constructor(private readonly options: StableCheckpointSchedulerOptions) {
    if ((options.quietMs ?? AUTOMATIC_CHECKPOINT_QUIET_MS) < 0) {
      throw new Error("Checkpoint quiet period cannot be negative")
    }
    if ((options.maxWaitMs ?? AUTOMATIC_CHECKPOINT_MAX_WAIT_MS) < 1) {
      throw new Error("Checkpoint maximum wait must be positive")
    }
  }

  notifyStableChange(): void {
    if (!this.accepting) return
    this.pending = true
    this.clearQuietTimer()
    this.quietTimer = setTimeout(
      () => void this.runPending().catch(this.options.onError),
      this.options.quietMs ?? AUTOMATIC_CHECKPOINT_QUIET_MS
    )
    this.maxWaitTimer ??= setTimeout(
      () => void this.runPending().catch(this.options.onError),
      this.options.maxWaitMs ?? AUTOMATIC_CHECKPOINT_MAX_WAIT_MS
    )
  }

  cancelPending(): void {
    this.clearTimers()
    this.pending = false
  }

  async close(flush: boolean): Promise<void> {
    if (!this.accepting) {
      await this.running
      return
    }
    this.accepting = false
    this.clearTimers()
    await this.running
    if (flush && this.pending) await this.runPending()
    this.pending = false
  }

  private async runPending(): Promise<void> {
    this.clearTimers()
    if (this.running) {
      await this.running
      return
    }
    if (!this.pending) return
    this.pending = false
    this.running = this.options.run().finally(() => {
      this.running = null
      if (this.pending && this.accepting) this.notifyStableChange()
    })
    await this.running
  }

  private clearTimers(): void {
    this.clearQuietTimer()
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer)
    this.maxWaitTimer = null
  }

  private clearQuietTimer(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer)
    this.quietTimer = null
  }
}
