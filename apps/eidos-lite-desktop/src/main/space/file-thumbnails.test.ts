import fs from "node:fs/promises"
import fsSync from "node:fs"
import os from "node:os"
import path from "node:path"
import { RuntimeReadTrace, runtimeReadTrace } from "../../runtime/read-trace"
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
  it("correlates queued generation with its issuing asset, logs cache joins and stops without cancelling work", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-thumb-trace-")
    )
    const trace = new RuntimeReadTrace({
      directory,
      deadline: Date.now() + 30_000,
    })
    const spies = [
      vi
        .spyOn(runtimeReadTrace, "enabled", "get")
        .mockImplementation(() => trace.enabled),
      vi
        .spyOn(runtimeReadTrace, "point")
        .mockImplementation(trace.point.bind(trace)),
      vi
        .spyOn(runtimeReadTrace, "span")
        .mockImplementation(trace.span.bind(trace)),
      vi
        .spyOn(runtimeReadTrace, "bind")
        .mockImplementation(trace.bind.bind(trace)),
    ]
    const events = () =>
      fsSync.readdirSync(directory).flatMap((file) =>
        fsSync
          .readFileSync(path.join(directory, file), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as Record<string, unknown>)
      )
    try {
      const completions: ((bytes: Uint8Array) => void)[] = []
      const generate = vi.fn(
        () => new Promise<Uint8Array>((resolve) => completions.push(resolve))
      )
      const cache = new FileThumbnailCache(generate, {
        concurrency: 1,
        queueMax: 4,
        entriesMax: 8,
        bytesMax: 1024,
      })
      const first = trace.span("asset-ipc", { assetKey: "first" }, () =>
        cache.get("/PRIVATE-a", identity)
      )
      const second = trace.span("asset-ipc", { assetKey: "second" }, () =>
        cache.get("/PRIVATE-b", identity)
      )
      const duplicate = trace.span("asset-ipc", { assetKey: "duplicate" }, () =>
        cache.get("/PRIVATE-a", identity)
      )
      expect(generate).toHaveBeenCalledTimes(1)
      const bytes = new Uint8Array([1])
      completions[0]!(bytes)
      expect(await first).toBe(bytes)
      expect(await duplicate).toBe(bytes)
      await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
      completions[1]!(bytes)
      expect(await second).toBe(bytes)
      expect(await cache.get("/PRIVATE-a", identity)).toBe(bytes)
      const recorded = events()
      const secondSpan = recorded.find(
        (event) =>
          event.phase === "asset-ipc-start" && event.assetKey === "second"
      )
      const generated = recorded.filter(
        (event) => event.phase === "thumbnail-generate-start"
      )
      expect(generated).toHaveLength(2)
      expect(generated[1]?.parentSpanId).toBe(secondSpan?.spanId)
      expect(generated[1]).toMatchObject({ active: 1, queued: 0 })
      expect(typeof generated[1]?.queueMs).toBe("number")
      expect(
        recorded.filter((event) => event.phase === "thumbnail-generate-end")
      ).toHaveLength(2)
      expect(
        recorded.filter((event) => event.cacheState === "join")
      ).toHaveLength(1)
      expect(
        recorded.filter((event) => event.cacheState === "hit")
      ).toHaveLength(1)
      expect(JSON.stringify(recorded)).not.toContain("PRIVATE")
      const remaining = trace.span("asset-ipc", {}, () =>
        cache.get("/PRIVATE-c", identity)
      )
      trace.stop("stop-file")
      const count = events().length
      completions[2]!(bytes)
      expect(await remaining).toBe(bytes)
      expect(events()).toHaveLength(count)
      expect(events().at(-1)).toMatchObject({
        phase: "trace-stop",
        restoreFailures: 0,
      })
    } finally {
      trace.stop()
      for (const spy of spies.reverse()) spy.mockRestore()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
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
