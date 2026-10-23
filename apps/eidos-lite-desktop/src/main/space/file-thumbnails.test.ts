import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  FileThumbnailCache,
  generateSystemFileThumbnail,
} from "./file-thumbnails"

const native = vi.hoisted(() => ({
  createFromBuffer: vi.fn(),
  createThumbnailFromPath: vi.fn(),
}))
vi.mock("electron", () => ({ nativeImage: native }))

const identity = { device: 1, inode: 2, size: 1024, modifiedAtMs: 100 }

describe("file thumbnail image decoding", () => {
  it("decodes raster content before asking the system for an extension-based preview", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-raster-thumb-"))
    try {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
        "base64"
      )
      const filename = path.join(root, "photo.jpg")
      await fs.writeFile(filename, png)
      const output = new Uint8Array([1, 2, 3])
      const resize = vi.fn(() => ({ toPNG: () => output }))
      native.createFromBuffer.mockReturnValue({
        isEmpty: () => false,
        getSize: () => ({ width: 1500, height: 1000 }),
        resize,
        toPNG: () => png,
      })
      native.createThumbnailFromPath.mockClear()
      expect(await generateSystemFileThumbnail(filename, 512)).toEqual(output)
      expect(native.createFromBuffer).toHaveBeenLastCalledWith(png)
      expect(resize).toHaveBeenCalledWith({ width: 512 })
      expect(native.createThumbnailFromPath).not.toHaveBeenCalled()

      await fs.writeFile(filename, "%PDF-1.4")
      native.createThumbnailFromPath.mockResolvedValue({
        isEmpty: () => false,
        toPNG: () => png,
      })
      expect(await generateSystemFileThumbnail(filename, 512)).toEqual(output)
      expect(native.createThumbnailFromPath).toHaveBeenCalledWith(filename, {
        width: 512,
        height: 512,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe("system file thumbnail scheduling", () => {
  it("caches Grid, Gallery and preview sizes independently", async () => {
    const generate = vi.fn(
      async (_path: string, size: number) => new Uint8Array([size / 128])
    )
    const cache = new FileThumbnailCache(generate)
    await Promise.all([
      cache.get("/a.mp4", identity, 128),
      cache.get("/a.mp4", identity, 512),
      cache.get("/a.mp4", identity, 1024),
    ])
    await cache.get("/a.mp4", identity, 512)
    expect(generate.mock.calls.map((call) => call[1])).toEqual([128, 512, 1024])
  })
  it("deduplicates work, bounds concurrency and rejects excess queued work", async () => {
    const completions: ((bytes: Uint8Array) => void)[] = []
    const generate = vi.fn(
      () => new Promise<Uint8Array>((resolve) => completions.push(resolve))
    )
    const cache = new FileThumbnailCache(generate, {
      concurrency: 2,
      queueMax: 1,
      entriesMax: 8,
      bytesMax: 1024,
    })
    const first = cache.get("/a.mp4", identity)
    const duplicate = cache.get("/a.mp4", identity)
    const second = cache.get("/b.mp4", identity)
    const third = cache.get("/c.mp4", identity)
    expect(generate).toHaveBeenCalledTimes(2)
    await expect(cache.get("/d.mp4", identity)).rejects.toThrow("queue is full")
    completions[0]!(new Uint8Array([1]))
    expect(await first).toEqual(await duplicate)
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3))
    completions[1]!(new Uint8Array([2]))
    completions[2]!(new Uint8Array([3]))
    await Promise.all([second, third])
  })

  it("keys cached output by file identity and modification state, and evicts by bytes", async () => {
    const generate = vi.fn(async () => new Uint8Array(4))
    const cache = new FileThumbnailCache(generate, {
      concurrency: 2,
      queueMax: 64,
      entriesMax: 8,
      bytesMax: 8,
    })
    await cache.get("/a.mp4", identity)
    await cache.get("/a.mp4", identity)
    expect(generate).toHaveBeenCalledTimes(1)
    await cache.get("/a.mp4", { ...identity, modifiedAtMs: 101 })
    await cache.get("/a.mp4", { ...identity, inode: 3 })
    await cache.get("/a.mp4", identity)
    expect(generate).toHaveBeenCalledTimes(4)
  })

  it("negatively caches unsupported files without retrying on every cell render", async () => {
    const generate = vi.fn(async () => {
      throw new Error("unsupported")
    })
    const cache = new FileThumbnailCache(generate)
    await expect(cache.get("/a.mp4", identity)).rejects.toThrow(
      "could not be generated"
    )
    await expect(cache.get("/a.mp4", identity)).rejects.toThrow(
      "temporarily unavailable"
    )
    expect(generate).toHaveBeenCalledTimes(1)
    await expect(
      cache.get("/a.mp4", { ...identity, modifiedAtMs: 101 })
    ).rejects.toThrow()
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it("times out callers without exceeding native concurrency or starting expired queued work", async () => {
    vi.useFakeTimers()
    try {
      let complete: (bytes: Uint8Array) => void = () => undefined
      const generate = vi.fn(
        () =>
          new Promise<Uint8Array>((resolve) => {
            complete = resolve
          })
      )
      const cache = new FileThumbnailCache(generate, {
        concurrency: 1,
        queueMax: 2,
        entriesMax: 8,
        bytesMax: 1024,
      })
      const first = expect(cache.get("/slow.mp4", identity)).rejects.toThrow(
        "timed out"
      )
      const queued = expect(cache.get("/queued.mp4", identity)).rejects.toThrow(
        "timed out"
      )
      await vi.advanceTimersByTimeAsync(15_000)
      await Promise.all([first, queued])
      expect(generate).toHaveBeenCalledTimes(1)
      complete(new Uint8Array([1]))
      await vi.advanceTimersByTimeAsync(0)
      expect(generate).toHaveBeenCalledTimes(1)
      expect(await cache.get("/slow.mp4", identity)).toEqual(
        new Uint8Array([1])
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
