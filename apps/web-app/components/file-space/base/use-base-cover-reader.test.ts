import type { SpaceBinaryFile } from "@eidos.space/file-space"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  let createObjectUrl: ReturnType<typeof vi.fn>
  let revokeObjectUrl: ReturnType<typeof vi.fn>
  let originalCreateObjectUrl: typeof URL.createObjectURL | undefined
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined

  beforeEach(() => {
    originalCreateObjectUrl = URL.createObjectURL
    originalRevokeObjectUrl = URL.revokeObjectURL
    let source = 0
    createObjectUrl = vi.fn(() => `blob:base-cover-${++source}`)
    revokeObjectUrl = vi.fn()
    URL.createObjectURL = createObjectUrl
    URL.revokeObjectURL = revokeObjectUrl
  })

  afterEach(() => {
    if (originalCreateObjectUrl) {
      URL.createObjectURL = originalCreateObjectUrl
    } else {
      delete (URL as { createObjectURL?: typeof URL.createObjectURL })
        .createObjectURL
    }
    if (originalRevokeObjectUrl) {
      URL.revokeObjectURL = originalRevokeObjectUrl
    } else {
      delete (URL as { revokeObjectURL?: typeof URL.revokeObjectURL })
        .revokeObjectURL
    }
  })

  it("deduplicates binary reads and object URLs across active and recent leases", async () => {
    let resolveRead: ((file: SpaceBinaryFile) => void) | undefined
    const readBinary = vi.fn(
      () =>
        new Promise<SpaceBinaryFile>((resolve) => {
          resolveRead = resolve
        })
    )
    const reader = createBaseCoverReader(readBinary)

    const first = reader.acquire("assets/cover.png")
    const second = reader.acquire("assets/cover.png")
    await Promise.resolve()

    expect(readBinary).toHaveBeenCalledTimes(1)
    resolveRead?.(binary("assets/cover.png", 3))
    const [firstLease, secondLease] = await Promise.all([first, second])
    expect(firstLease.source).toBe("blob:base-cover-1")
    expect(secondLease.source).toBe(firstLease.source)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)

    firstLease.release()
    secondLease.release()
    const recentLease = await reader.acquire("assets/cover.png")
    expect(recentLease.source).toBe(firstLease.source)
    expect(readBinary).toHaveBeenCalledTimes(1)
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    recentLease.release()
  })

  it("evicts the least recently used inactive cover at the entry limit", async () => {
    const readBinary = vi.fn(async (path: string) => binary(path))
    const reader = createBaseCoverReader(readBinary, { maxEntries: 2 })

    const a = await reader.acquire("assets/a.png")
    a.release()
    const b = await reader.acquire("assets/b.png")
    b.release()
    const recentA = await reader.acquire("assets/a.png")
    recentA.release()
    const c = await reader.acquire("assets/c.png")
    c.release()
    const reloadedB = await reader.acquire("assets/b.png")
    reloadedB.release()

    expect(readBinary.mock.calls.map(([path]) => path)).toEqual([
      "assets/a.png",
      "assets/b.png",
      "assets/c.png",
      "assets/b.png",
    ])
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:base-cover-2")
  })

  it("bounds inactive bytes and refreshes expired covers", async () => {
    let currentTime = 1_000
    const readBinary = vi.fn(async (path: string) => binary(path, 3))
    const reader = createBaseCoverReader(readBinary, {
      maxBytes: 4,
      maxEntries: 10,
      now: () => currentTime,
      ttlMs: 100,
    })

    const a = await reader.acquire("assets/a.png")
    a.release()
    const b = await reader.acquire("assets/b.png")
    b.release()
    const reloadedA = await reader.acquire("assets/a.png")
    reloadedA.release()
    expect(readBinary).toHaveBeenCalledTimes(3)

    currentTime += 101
    const refreshedA = await reader.acquire("assets/a.png")
    refreshedA.release()
    expect(readBinary).toHaveBeenCalledTimes(4)
  })

  it("keeps active sources valid until their last lease is released", async () => {
    const reader = createBaseCoverReader(async (path) => binary(path, 3), {
      maxBytes: 1,
      maxEntries: 1,
    })
    const active = await reader.acquire("assets/active.png")

    reader.dispose()
    expect(revokeObjectUrl).not.toHaveBeenCalledWith(active.source)

    active.release()
    expect(revokeObjectUrl).toHaveBeenCalledWith(active.source)
  })

  it("bounds concurrent binary reads while queued covers wait", async () => {
    const pending = new Map<string, (file: SpaceBinaryFile) => void>()
    const readBinary = vi.fn(
      (path: string) =>
        new Promise<SpaceBinaryFile>((resolve) => {
          pending.set(path, resolve)
        })
    )
    const reader = createBaseCoverReader(readBinary, {
      maxConcurrentReads: 2,
    })
    const paths = ["assets/a.png", "assets/b.png", "assets/c.png"]
    const acquisitions = paths.map((path) => reader.acquire(path))

    await Promise.resolve()
    expect(readBinary.mock.calls.map(([path]) => path)).toEqual(
      paths.slice(0, 2)
    )

    pending.get(paths[0])?.(binary(paths[0]))
    const first = await acquisitions[0]
    first.release()
    await Promise.resolve()
    expect(readBinary.mock.calls.map(([path]) => path)).toEqual(paths)

    pending.get(paths[1])?.(binary(paths[1]))
    pending.get(paths[2])?.(binary(paths[2]))
    const remaining = await Promise.all(acquisitions.slice(1))
    remaining.forEach((lease) => lease.release())
  })

  it("drops an aborted queued cover before starting its binary read", async () => {
    let resolveActive: ((file: SpaceBinaryFile) => void) | undefined
    const readBinary = vi.fn(
      (path: string) =>
        new Promise<SpaceBinaryFile>((resolve) => {
          if (path === "assets/active.png") resolveActive = resolve
        })
    )
    const reader = createBaseCoverReader(readBinary, {
      maxConcurrentReads: 1,
    })
    const active = reader.acquire("assets/active.png")
    const controller = new AbortController()
    const queued = reader.acquire("assets/queued.png", controller.signal)

    await Promise.resolve()
    expect(readBinary).toHaveBeenCalledTimes(1)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ name: "AbortError" })

    resolveActive?.(binary("assets/active.png"))
    const lease = await active
    lease.release()
    await Promise.resolve()
    expect(readBinary).toHaveBeenCalledTimes(1)
  })

  it("does not cache failed reads", async () => {
    const readBinary = vi
      .fn<() => Promise<SpaceBinaryFile>>()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValue(binary("assets/cover.png"))
    const reader = createBaseCoverReader(readBinary)

    await expect(reader.acquire("assets/cover.png")).rejects.toThrow(
      "read failed"
    )
    const lease = await reader.acquire("assets/cover.png")
    expect(lease.source).toBe("blob:base-cover-1")
    lease.release()
    expect(readBinary).toHaveBeenCalledTimes(2)
  })
})
