import { afterEach, describe, expect, it, vi } from "vitest"

import { LaunchNotificationRetry } from "./launch-notification-retry"

describe("LaunchNotificationRetry", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("retries a lost launch notification until the pending file is consumed", () => {
    vi.useFakeTimers()
    let pending = true
    const notify = vi.fn()
    const retry = new LaunchNotificationRetry(250)

    retry.notifyUntil(() => pending, notify)
    expect(notify).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(250)
    expect(notify).toHaveBeenCalledTimes(2)

    pending = false
    vi.advanceTimersByTime(500)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it("keeps one retry chain while allowing a new file to wake immediately", () => {
    vi.useFakeTimers()
    const notify = vi.fn()
    const retry = new LaunchNotificationRetry(250)

    retry.notifyUntil(() => true, notify)
    retry.notifyUntil(() => true, notify)
    expect(notify).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(250)
    expect(notify).toHaveBeenCalledTimes(3)

    retry.cancel()
    vi.advanceTimersByTime(500)
    expect(notify).toHaveBeenCalledTimes(3)
  })
})
