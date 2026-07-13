import type { SpaceBinaryFile } from "@eidos.space/file-space"
import { describe, expect, it, vi } from "vitest"

import { createBaseCoverReader } from "./use-base-cover-reader"

function binary(path: string, size = 1): SpaceBinaryFile {
  return {
    path,
    content: new Uint8Array(size),
    size,
    mtimeMs: 1,
  }
}

describe("createBaseCoverReader", () => {
  it("deduplicates in-flight and recently resolved reads", async () => {
    let resolveRead: ((file: SpaceBinaryFile) => void) | undefined
    const readBinary = vi.fn(
      (path: string) =>
        new Promise<SpaceBinaryFile>((resolve) => {
          resolveRead = resolve
        })
    )
    const reader = createBaseCoverReader(readBinary)

    const first = reader.read("assets/cover.png")
    const second = reader.read("assets/cover.png")
    await Promise.resolve()

    expect(readBinary).toHaveBeenCalledTimes(1)
    resolveRead?.(binary("assets/cover.png", 3))
    await expect(first).resolves.toMatchObject({ size: 3 })
    await expect(second).resolves.toMatchObject({ size: 3 })
    await expect(reader.read("assets/cover.png")).resolves.toMatchObject({
      size: 3,
    })
    expect(readBinary).toHaveBeenCalledTimes(1)
  })

  it("evicts the least recently used cover when the entry limit is reached", async () => {
    const readBinary = vi.fn(async (path: string) => binary(path))
    const reader = createBaseCoverReader(readBinary, { maxEntries: 2 })

    await reader.read("assets/a.png")
    await reader.read("assets/b.png")
    await reader.read("assets/a.png")
    await reader.read("assets/c.png")
    await reader.read("assets/b.png")

    expect(readBinary.mock.calls.map(([path]) => path)).toEqual([
      "assets/a.png",
      "assets/b.png",
      "assets/c.png",
      "assets/b.png",
    ])
  })

  it("bounds cached bytes and refreshes expired covers", async () => {
    let currentTime = 1_000
    const readBinary = vi.fn(async (path: string) => binary(path, 3))
    const reader = createBaseCoverReader(readBinary, {
      maxBytes: 4,
      maxEntries: 10,
      now: () => currentTime,
      ttlMs: 100,
    })

    await reader.read("assets/a.png")
    await reader.read("assets/b.png")
    await reader.read("assets/a.png")
    expect(readBinary).toHaveBeenCalledTimes(3)

    currentTime += 101
    await reader.read("assets/a.png")
    expect(readBinary).toHaveBeenCalledTimes(4)
  })

  it("does not cache failed reads", async () => {
    const readBinary = vi
      .fn<(path: string) => Promise<SpaceBinaryFile>>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValue(binary("assets/cover.png"))
    const reader = createBaseCoverReader(readBinary)

    await expect(reader.read("assets/cover.png")).rejects.toThrow("read failed")
    await expect(reader.read("assets/cover.png")).resolves.toMatchObject({
      path: "assets/cover.png",
    })
    expect(readBinary).toHaveBeenCalledTimes(2)
  })
})
