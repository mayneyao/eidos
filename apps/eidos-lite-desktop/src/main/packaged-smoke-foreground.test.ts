import { afterEach, expect, it, vi } from "vitest"

import { ensurePackagedSmokeForeground } from "./packaged-smoke-foreground"

function fakeWindow({
  grantNativeFocus = true,
  grantDocumentFocus = true,
  documentVisible = true,
  visible = false,
  minimized = false,
} = {}) {
  let focused = false
  let documentFocused = false
  const window = {
    isVisible: () => visible,
    isFocused: () => focused,
    isMinimized: () => minimized,
    restore: vi.fn(() => {
      minimized = false
    }),
    show: vi.fn(() => {
      visible = true
    }),
    focus: vi.fn(() => {
      focused = grantNativeFocus
    }),
    webContents: {
      getBackgroundThrottling: () => true,
      focus: vi.fn(() => {
        documentFocused = grantDocumentFocus
      }),
      executeJavaScript: vi.fn(async () => ({
        // Initially hidden Electron windows may still report visible.
        visibilityState: documentVisible ? "visible" : "hidden",
        hasFocus: documentFocused,
      })),
    },
  }
  return window
}

afterEach(() => {
  vi.useRealTimers()
})

it("records the untouched hidden state, then requires a visible focused window", async () => {
  const window = fakeWindow({ minimized: true })
  const activateApplication = vi.fn()
  const result = await ensurePackagedSmokeForeground(
    window,
    activateApplication
  )
  expect(result.before).toEqual({
    window: { isVisible: false, isFocused: false, isMinimized: true },
    webContents: { backgroundThrottling: true },
    document: { visibilityState: "visible", hasFocus: false },
  })
  expect(result.after).toEqual({
    window: { isVisible: true, isFocused: true, isMinimized: false },
    webContents: { backgroundThrottling: true },
    document: { visibilityState: "visible", hasFocus: true },
  })
  const captureOrder =
    window.webContents.executeJavaScript.mock.invocationCallOrder[0]!
  expect(captureOrder).toBeLessThan(window.restore.mock.invocationCallOrder[0]!)
  expect(captureOrder).toBeLessThan(
    activateApplication.mock.invocationCallOrder[0]!
  )
  expect(captureOrder).toBeLessThan(window.show.mock.invocationCallOrder[0]!)
  expect(captureOrder).toBeLessThan(window.focus.mock.invocationCallOrder[0]!)
  expect(captureOrder).toBeLessThan(
    window.webContents.focus.mock.invocationCallOrder[0]!
  )
})

it.each([
  { grantNativeFocus: false },
  { grantDocumentFocus: false },
  { documentVisible: false },
])(
  "rejects measurement without all foreground preconditions: %j",
  async (options) => {
    vi.useFakeTimers()
    const window = fakeWindow(options)
    const result = ensurePackagedSmokeForeground(window, vi.fn()).catch(
      (error: unknown) => error
    )
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await result).toBeInstanceOf(Error)
    expect(((await result) as Error).message).toContain(
      "Packaged smoke foreground precondition failed"
    )
  }
)

it("does not restore a window that is not minimized", async () => {
  const window = fakeWindow({ visible: true })
  await ensurePackagedSmokeForeground(window, vi.fn())
  expect(window.restore).not.toHaveBeenCalled()
  expect(window.show).toHaveBeenCalledOnce()
  expect(window.focus).toHaveBeenCalledOnce()
})
