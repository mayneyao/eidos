interface SyncSessionLifecycleHooks {
  suspendAutomatic(): void
  resumeAutomatic(): void
  lockSessions(): Promise<void>
  onError(): void
}

/** System sleep/lock is temporary; logout and explicit locking stay independent. */
export class SyncSessionLifecycle {
  private screenLocked = false
  private sleeping = false
  private closed = false
  private generation = 0
  private barrier: Promise<void> = Promise.resolve()

  constructor(private readonly hooks: SyncSessionLifecycleHooks) {}

  readonly lockScreen = (): void => {
    this.screenLocked = true
    this.lock()
  }
  readonly suspend = (): void => {
    this.sleeping = true
    this.lock()
  }
  readonly unlockScreen = (): void => {
    this.screenLocked = false
    this.resume()
  }
  readonly wake = (): void => {
    this.sleeping = false
    this.resume()
  }

  private lock(): void {
    if (this.closed) return
    this.generation += 1
    this.hooks.suspendAutomatic()
    this.barrier = this.barrier
      .catch(() => undefined)
      .then(() => this.hooks.lockSessions())
    void this.barrier.catch(() => this.hooks.onError())
  }

  private resume(): void {
    if (this.closed || this.screenLocked || this.sleeping) return
    const generation = ++this.generation
    void this.barrier
      .then(() => {
        if (
          !this.closed &&
          generation === this.generation &&
          !this.screenLocked &&
          !this.sleeping
        )
          this.hooks.resumeAutomatic()
      })
      .catch(() => undefined)
  }

  async close(): Promise<void> {
    this.closed = true
    this.generation += 1
    await this.barrier.catch(() => undefined)
  }
}
