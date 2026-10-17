interface SyncSessionLifecycleHooks {
  suspendAutomatic(): void
  resumeAutomatic(): void
  lockSessions(): Promise<void>
  onError(): void
}

interface SyncPowerMonitor {
  on(
    event: "lock-screen" | "unlock-screen" | "suspend" | "resume",
    listener: () => void
  ): void
  removeListener(
    event: "lock-screen" | "unlock-screen" | "suspend" | "resume",
    listener: () => void
  ): void
  getSystemIdleState(
    threshold: number
  ): "active" | "idle" | "locked" | "unknown"
}

export function bindSyncSessionLifecycle(
  powerMonitor: SyncPowerMonitor,
  lifecycle: SyncSessionLifecycle,
  platform: NodeJS.Platform = process.platform
): () => void {
  powerMonitor.on("lock-screen", lifecycle.lockScreen)
  powerMonitor.on("suspend", lifecycle.suspend)
  powerMonitor.on("unlock-screen", lifecycle.unlockScreen)
  powerMonitor.on("resume", lifecycle.wake)
  // A process started while locked will not receive the earlier lock event.
  // Subscribe first so subsequent unlocks cannot be missed during initialization.
  // Electron emits screen lock/unlock only on macOS and Windows.
  if (
    (platform === "darwin" || platform === "win32") &&
    powerMonitor.getSystemIdleState(1) === "locked"
  )
    lifecycle.lockScreen()
  return () => {
    powerMonitor.removeListener("lock-screen", lifecycle.lockScreen)
    powerMonitor.removeListener("suspend", lifecycle.suspend)
    powerMonitor.removeListener("unlock-screen", lifecycle.unlockScreen)
    powerMonitor.removeListener("resume", lifecycle.wake)
  }
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
