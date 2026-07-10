// @vitest-environment node

import {
  flushCurrentSpaceFile,
  navigateAfterFlushingSpaceFile,
} from "./file-navigation"
import { registerPendingWriteFlusher } from "./pending-writes"

describe("file Space navigation", () => {
  it("navigates only after the current file is saved", async () => {
    const order: string[] = []
    const unregister = registerPendingWriteFlusher(
      "navigation-save",
      async () => {
        order.push("save")
        return true
      },
      { spaceId: "space-a", filePath: "notes/a.md" }
    )
    const navigate = vi.fn(() => order.push("navigate"))

    await expect(
      navigateAfterFlushingSpaceFile({
        spaceId: "space-a",
        currentFilePath: "notes/a.md",
        destination: "/space-file#notes%2Fb.md",
        navigate,
      })
    ).resolves.toBe(true)
    expect(order).toEqual(["save", "navigate"])
    unregister()
  })

  it("keeps the current route when saving fails", async () => {
    const unregister = registerPendingWriteFlusher(
      "navigation-failure",
      async () => false,
      { spaceId: "space-a", filePath: "notes/a.md" }
    )
    const navigate = vi.fn()

    await expect(
      navigateAfterFlushingSpaceFile({
        spaceId: "space-a",
        currentFilePath: "notes/a.md",
        destination: "/space-file#notes%2Fb.md",
        navigate,
      })
    ).resolves.toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    unregister()
  })

  it("does not let another file block the current navigation", async () => {
    const otherFile = vi.fn(async () => false)
    const unregister = registerPendingWriteFlusher("other-file", otherFile, {
      spaceId: "space-a",
      filePath: "notes/other.md",
    })

    await expect(
      flushCurrentSpaceFile("space-a", "notes/current.md")
    ).resolves.toBe(true)
    expect(otherFile).not.toHaveBeenCalled()
    unregister()
  })
})
