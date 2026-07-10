import { describe, expect, it, vi } from "vitest"

import { navigateToProtocolFile } from "./protocol-file-navigation"

describe("navigateToProtocolFile", () => {
  it("opens a file inside the active Space after pending writes are saved", async () => {
    const navigate = vi.fn()
    const flushPendingWrites = vi.fn(async () => true)

    await navigateToProtocolFile({
      spaceId: "space-a",
      systemPath: "/tmp/space-a/notes/today.md",
      getRelativeFilePath: vi.fn(async () => "notes/today.md"),
      flushPendingWrites,
      navigate,
    })

    expect(flushPendingWrites).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith("/space-file#notes%2Ftoday.md")
  })

  it("keeps the current editor open when a pending write fails", async () => {
    const navigate = vi.fn()

    await expect(
      navigateToProtocolFile({
        spaceId: "space-a",
        systemPath: "/tmp/space-a/notes/today.md",
        getRelativeFilePath: vi.fn(async () => "notes/today.md"),
        flushPendingWrites: vi.fn(async () => false),
        navigate,
      })
    ).rejects.toThrow("Resolve the error before opening another file")

    expect(navigate).not.toHaveBeenCalled()
  })

  it("rejects files outside the active Space before flushing the editor", async () => {
    const flushPendingWrites = vi.fn(async () => true)

    await expect(
      navigateToProtocolFile({
        spaceId: "space-a",
        systemPath: "/tmp/other/secret.md",
        getRelativeFilePath: vi.fn(async () => null),
        flushPendingWrites,
        navigate: vi.fn(),
      })
    ).rejects.toThrow("outside the current Space")

    expect(flushPendingWrites).not.toHaveBeenCalled()
  })
})
