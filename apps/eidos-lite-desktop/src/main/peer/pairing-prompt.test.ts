import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
const mocks = vi.hoisted(() => ({
  window: {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  },
  focused: vi.fn(),
  all: vi.fn(),
  dialog: vi.fn(),
  supported: vi.fn(() => true),
  notifications: [] as {
    options: { silent: boolean }
    show: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    click?: () => void
  }[],
}))
vi.mock("electron", () => ({
  BrowserWindow: { getFocusedWindow: mocks.focused, getAllWindows: mocks.all },
  dialog: { showMessageBox: mocks.dialog },
  Notification: class {
    static isSupported = mocks.supported
    show = vi.fn()
    close = vi.fn()
    click?: () => void
    constructor(public options: { silent: boolean }) {
      mocks.notifications.push(this)
    }
    on(_event: string, handler: () => void) {
      this.click = handler
    }
  },
}))
import { PairingPrompt } from "./pairing-prompt"
describe("native pairing prompt", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.notifications.length = 0
    mocks.focused.mockReturnValue(null)
    mocks.all.mockReturnValue([mocks.window])
    mocks.dialog.mockImplementation(() => new Promise(() => {}))
  })
  afterEach(() => vi.useRealTimers())
  const request = () => ({
    id: "request-1",
    name: "My Phone",
    expires: Date.now() + 300_000,
  })
  it("alerts once while minimized, without taking focus; notification click restores", () => {
    const prompt = new PairingPrompt(vi.fn())
    const value = request()
    prompt.update(value)
    prompt.update(value)
    expect(mocks.dialog).toHaveBeenCalledTimes(1)
    expect(mocks.dialog.mock.calls[0][0]).toBe(mocks.window)
    expect(mocks.notifications).toHaveLength(1)
    expect(mocks.notifications[0].options.silent).toBe(false)
    expect(mocks.window.focus).not.toHaveBeenCalled()
    mocks.notifications[0].click?.()
    expect(mocks.window.restore).toHaveBeenCalledOnce()
    expect(mocks.dialog).toHaveBeenCalledTimes(1)
    prompt.update(null)
  })
  it.each([0, 1])(
    "routes native decision %s to the exact request",
    async (response) => {
      mocks.dialog.mockResolvedValue({ response })
      const decide = vi.fn().mockResolvedValue({})
      const prompt = new PairingPrompt(decide)
      const value = request()
      prompt.update(value)
      await Promise.resolve()
      await Promise.resolve()
      expect(decide).toHaveBeenCalledWith(response === 1, value.id)
      prompt.update(value)
      expect(mocks.dialog).toHaveBeenCalledOnce()
    }
  )
  it.each(["cancel", "timeout", "replace"])(
    "ignores a stale accept after %s",
    async (reason) => {
      let resolve!: (value: { response: number }) => void
      mocks.dialog.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      const decide = vi.fn()
      const prompt = new PairingPrompt(decide)
      prompt.update(request())
      const signal = mocks.dialog.mock.calls[0][1].signal as AbortSignal
      const oldResolve = resolve
      if (reason === "timeout") vi.advanceTimersByTime(300_000)
      else if (reason === "replace")
        prompt.update({ ...request(), id: "request-2" })
      else prompt.update(null)
      expect(signal.aborted).toBe(true)
      oldResolve({ response: 1 })
      await Promise.resolve()
      expect(decide).not.toHaveBeenCalled()
      expect(mocks.notifications[0].close).toHaveBeenCalledOnce()
      prompt.update(null)
    }
  )
  it("keeps authorization usable if system notifications are unavailable", () => {
    mocks.supported.mockReturnValueOnce(false)
    const prompt = new PairingPrompt(vi.fn())
    prompt.update(request())
    expect(mocks.notifications).toHaveLength(0)
    expect(mocks.dialog).toHaveBeenCalledOnce()
    prompt.update(null)
  })
  it("uses the focused window for a foreground request", () => {
    mocks.focused.mockReturnValue(mocks.window)
    const prompt = new PairingPrompt(vi.fn())
    prompt.update(request())
    expect(mocks.dialog.mock.calls[0][0]).toBe(mocks.window)
    expect(mocks.window.restore).not.toHaveBeenCalled()
    prompt.update(null)
  })
  it("opens Settings on a notification click when all windows were closed", () => {
    mocks.all.mockReturnValue([])
    const open = vi.fn(() => mocks.window)
    const prompt = new PairingPrompt(vi.fn(), open as never)
    prompt.update(request())
    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    mocks.notifications[0].click?.()
    expect(open).toHaveBeenCalledOnce()
    expect(mocks.dialog).toHaveBeenCalledOnce()
    prompt.update(null)
  })
})
