import type { EidosFileAssetIdentity } from "./eidos-file-attachments"
import type { EidosLiteThumbnailSize } from "../../shared/contracts"

export type FileThumbnailProvider = (
  absolutePath: string,
  identity: EidosFileAssetIdentity,
  size?: EidosLiteThumbnailSize
) => Promise<Uint8Array>

const FAILURE_TTL_MS = 30_000
const REQUEST_TIMEOUT_MS = 15_000

interface CachedThumbnail {
  bytes?: Uint8Array
  failedUntil?: number
}

/** Process-local cache shared by tables, with authorization performed by callers
 * before every lookup. Native work keeps its slot until it really completes. */
export class FileThumbnailCache {
  private readonly cache = new Map<string, CachedThumbnail>()
  private readonly pending = new Map<string, Promise<Uint8Array>>()
  private readonly queue: (() => void)[] = []
  private active = 0
  private cachedBytes = 0

  constructor(
    private readonly generate: (
      absolutePath: string,
      size: EidosLiteThumbnailSize
    ) => Promise<Uint8Array>,
    private readonly options = {
      concurrency: 2,
      queueMax: 64,
      entriesMax: 128,
      bytesMax: 16 * 1024 * 1024,
    }
  ) {}

  readonly get: FileThumbnailProvider = async (
    absolutePath,
    identity,
    size = 128
  ) => {
    const key = JSON.stringify([
      "pixel-aspect-v2",
      absolutePath,
      identity.device,
      identity.inode,
      identity.size,
      identity.modifiedAtMs,
      size,
    ])
    const cached = this.cache.get(key)
    if (cached) {
      if (cached.bytes || (cached.failedUntil ?? 0) > Date.now()) {
        this.cache.delete(key)
        this.cache.set(key, cached)
        if (cached.bytes) return cached.bytes
        throw new Error("System thumbnail is temporarily unavailable")
      }
      this.cache.delete(key)
    }
    let work = this.pending.get(key)
    if (!work) {
      if (this.queue.length >= this.options.queueMax) {
        throw new Error("System thumbnail queue is full")
      }
      const queuedAt = Date.now()
      work = new Promise<Uint8Array>((resolve, reject) => {
        this.queue.push(() => {
          if (Date.now() - queuedAt >= REQUEST_TIMEOUT_MS) {
            this.pending.delete(key)
            reject(new Error("System thumbnail request timed out in queue"))
            return
          }
          this.active += 1
          void (async () => this.generate(absolutePath, size))()
            .then((bytes) => {
              if (
                bytes.byteLength === 0 ||
                bytes.byteLength > this.options.bytesMax
              )
                throw new Error("System thumbnail exceeds the output limit")
              this.remember(key, { bytes })
              resolve(bytes)
            })
            .catch(() => {
              this.remember(key, { failedUntil: Date.now() + FAILURE_TTL_MS })
              reject(new Error("System thumbnail could not be generated"))
            })
            .finally(() => {
              this.pending.delete(key)
              this.active -= 1
              this.drain()
            })
        })
      })
      this.pending.set(key, work)
      this.drain()
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("System thumbnail request timed out")),
            REQUEST_TIMEOUT_MS
          )
          timer.unref()
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private drain(): void {
    while (this.active < this.options.concurrency && this.queue.length > 0)
      this.queue.shift()!()
  }

  private remember(key: string, value: CachedThumbnail): void {
    this.cache.set(key, value)
    this.cachedBytes += value.bytes?.byteLength ?? 0
    while (
      this.cache.size > this.options.entriesMax ||
      this.cachedBytes > this.options.bytesMax
    ) {
      const oldest = this.cache.entries().next().value
      if (!oldest) break
      this.cache.delete(oldest[0])
      this.cachedBytes -= oldest[1].bytes?.byteLength ?? 0
    }
  }
}

export async function generateSystemFileThumbnail(
  absolutePath: string,
  targetSize: EidosLiteThumbnailSize
): Promise<Uint8Array> {
  const { nativeImage } = await import("electron")
  const image = await nativeImage.createThumbnailFromPath(absolutePath, {
    width: targetSize,
    height: targetSize,
  })
  if (image.isEmpty()) throw new Error("System returned an empty thumbnail")
  // Electron/macOS assigns the requested square logical size to the NSImage,
  // even when Quick Look's CGImage is rectangular. PNG preserves the actual
  // pixels; decode it before measuring or resizing to avoid stretching them.
  const bitmap = nativeImage.createFromBuffer(image.toPNG())
  if (bitmap.isEmpty())
    throw new Error("System thumbnail pixels are unavailable")
  const size = bitmap.getSize()
  if (Math.max(size.width, size.height) <= targetSize) return bitmap.toPNG()
  return bitmap
    .resize(
      size.width >= size.height ? { width: targetSize } : { height: targetSize }
    )
    .toPNG()
}

const systemThumbnails = new FileThumbnailCache(generateSystemFileThumbnail)

export const systemFileThumbnail: FileThumbnailProvider | undefined =
  process.platform === "darwin" || process.platform === "win32"
    ? systemThumbnails.get
    : undefined
