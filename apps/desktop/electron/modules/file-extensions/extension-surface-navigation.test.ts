import { describe, expect, it } from "vitest"

import { shouldBlockExtensionSurfaceFrameNavigation } from "./extension-surface-navigation"

describe("extension surface navigation policy", () => {
  it("blocks every navigation initiated by an initialized srcdoc surface", () => {
    expect(
      shouldBlockExtensionSurfaceFrameNavigation({
        isMainFrame: false,
        currentFrameUrl: "about:srcdoc",
      })
    ).toBe(true)
  })

  it("does not interfere with the main frame or unrelated subframes", () => {
    expect(
      shouldBlockExtensionSurfaceFrameNavigation({
        isMainFrame: true,
        currentFrameUrl: "about:srcdoc",
      })
    ).toBe(false)
    expect(
      shouldBlockExtensionSurfaceFrameNavigation({
        isMainFrame: false,
        currentFrameUrl: "https://www.youtube.com/embed/example",
      })
    ).toBe(false)
    expect(
      shouldBlockExtensionSurfaceFrameNavigation({
        isMainFrame: false,
        currentFrameUrl: "about:blank",
      })
    ).toBe(false)
  })
})
