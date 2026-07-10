// @vitest-environment node

import {
  flushPendingFileWrites,
  registerPendingWriteFlusher,
} from "./pending-writes"

describe("pending file writes", () => {
  it("flushes every registered editor", async () => {
    const first = vi.fn(async () => true)
    const second = vi.fn(async () => true)
    const unregisterFirst = registerPendingWriteFlusher("first", first)
    const unregisterSecond = registerPendingWriteFlusher("second", second)

    await expect(flushPendingFileWrites()).resolves.toBe(true)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()

    unregisterFirst()
    unregisterSecond()
  })

  it("reports rejected or unsuccessful writes and unregisters safely", async () => {
    const unregisterFailed = registerPendingWriteFlusher(
      "failed",
      async () => false
    )
    const unregisterRejected = registerPendingWriteFlusher(
      "rejected",
      async () => {
        throw new Error("write failed")
      }
    )

    await expect(flushPendingFileWrites()).resolves.toBe(false)
    unregisterFailed()
    unregisterRejected()
    await expect(flushPendingFileWrites()).resolves.toBe(true)
  })

  it("flushes only editors within the requested Space path", async () => {
    const note = vi.fn(async () => true)
    const nestedNote = vi.fn(async () => true)
    const sibling = vi.fn(async () => true)
    const otherSpace = vi.fn(async () => true)
    const unscoped = vi.fn(async () => true)
    const unregister = [
      registerPendingWriteFlusher("note", note, {
        spaceId: "space-a",
        filePath: "Projects/Note.md",
      }),
      registerPendingWriteFlusher("nested", nestedNote, {
        spaceId: "space-a",
        filePath: "Projects/Nested/Note.md",
      }),
      registerPendingWriteFlusher("sibling", sibling, {
        spaceId: "space-a",
        filePath: "Archive/Note.md",
      }),
      registerPendingWriteFlusher("other-space", otherSpace, {
        spaceId: "space-b",
        filePath: "Projects/Note.md",
      }),
      registerPendingWriteFlusher("unscoped", unscoped),
    ]

    await expect(
      flushPendingFileWrites({ spaceId: "space-a", path: "Projects" })
    ).resolves.toBe(true)
    expect(note).toHaveBeenCalledOnce()
    expect(nestedNote).toHaveBeenCalledOnce()
    expect(sibling).not.toHaveBeenCalled()
    expect(otherSpace).not.toHaveBeenCalled()
    expect(unscoped).not.toHaveBeenCalled()

    unregister.forEach((remove) => remove())
  })

  it("does not unregister a replacement with the same key", async () => {
    const first = vi.fn(async () => true)
    const second = vi.fn(async () => true)
    const unregisterFirst = registerPendingWriteFlusher("same", first)
    const unregisterSecond = registerPendingWriteFlusher("same", second)

    unregisterFirst()
    await flushPendingFileWrites()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()

    unregisterSecond()
  })
})
