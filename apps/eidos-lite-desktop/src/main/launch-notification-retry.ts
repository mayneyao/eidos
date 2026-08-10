const DEFAULT_RETRY_DELAY_MS = 250

export class LaunchNotificationRetry {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly retryDelayMs = DEFAULT_RETRY_DELAY_MS) {}

  notifyUntil(shouldNotify: () => boolean, notify: () => void): void {
    if (!shouldNotify()) {
      this.cancel()
      return
    }
    notify()
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.notifyUntil(shouldNotify, notify)
    }, this.retryDelayMs)
    this.timer.unref?.()
  }

  cancel(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }
}
