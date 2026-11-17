import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

const MAGIC = "eidos-file-clipboard-export-v1"
const GRACE_MS = 24 * 60 * 60 * 1000
const CACHE_LIMIT = 2 * 1024 ** 3
export const CLIPBOARD_EXPORT_LIMIT = 1024 ** 3
export interface ClipboardExportLease {
  root: string
  byteLimit: number
  /** Called before publication; incomplete/ambiguous publications stay retained. */
  retain(bytes: number): Promise<void>
  owned(changeCount: number): Promise<void>
  discard(): Promise<void>
}
export type ClipboardExportRequest = <T>(
  lease: ClipboardExportLease,
  signal: AbortSignal,
  publish: (paths: string[], bytes: number) => Promise<T>
) => Promise<T>
interface RecordData {
  magic: typeof MAGIC
  createdAt: number
  bytes: number
  retained: boolean
  changeCount?: number
  retiredAt?: number
}

/** Only generated cache directories with our manifest can be reclaimed. */
export class ClipboardExportStore {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly root: string,
    private readonly now = Date.now
  ) {}

  reclaim(ownership: number | (() => Promise<number>)): Promise<number> {
    const task = this.pending
      .catch(() => undefined)
      .then(async () =>
        this.reclaimNow(
          typeof ownership === "number" ? ownership : await ownership()
        )
      )
    this.pending = task
    return task
  }

  private async reclaimNow(changeCount: number): Promise<number> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 })
    if ((await fs.realpath(this.root)) !== this.root)
      throw new Error("The file clipboard cache cannot be a symlink")
    let bytes = 0
    const names = await fs.readdir(this.root)
    if (names.length > 1000) throw new Error("The file clipboard cache is full")
    for (const name of names) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue
      const directory = path.join(this.root, name)
      const info = await fs.lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) continue
      let record: RecordData
      try {
        const manifest = await fs.lstat(path.join(directory, "export.json"))
        if (
          !manifest.isFile() ||
          manifest.isSymbolicLink() ||
          manifest.size > 1024
        )
          continue
        record = JSON.parse(
          await fs.readFile(path.join(directory, "export.json"), "utf8")
        ) as RecordData
        if (
          record.magic !== MAGIC ||
          !Number.isFinite(record.createdAt) ||
          !Number.isFinite(record.bytes) ||
          record.bytes < 0
        )
          continue
      } catch {
        continue
      }
      if (!record.retained) {
        await fs.rm(directory, { recursive: true, force: true })
        continue
      }
      if (record.changeCount === changeCount) {
        bytes += record.bytes
        continue
      }
      // A lost write response must never make an active file URL disappear.
      if (record.retained && record.changeCount === undefined) {
        bytes += record.bytes
        continue
      }
      if (record.retiredAt === undefined) {
        record.retiredAt = this.now()
        await fs.writeFile(
          path.join(directory, "export.json"),
          JSON.stringify(record)
        )
      }
      if (this.now() - record.retiredAt >= GRACE_MS)
        await fs.rm(directory, { recursive: true, force: true })
      else bytes += record.bytes
    }
    return bytes
  }

  withExport<T>(
    changeCount: number,
    operation: (lease: ClipboardExportLease) => Promise<T>
  ): Promise<T> {
    const task = this.pending
      .catch(() => undefined)
      .then(async () => {
        const used = await this.reclaimNow(changeCount)
        const byteLimit = Math.min(CLIPBOARD_EXPORT_LIMIT, CACHE_LIMIT - used)
        if (byteLimit <= 0) throw new Error("The file clipboard cache is full")
        const root = path.join(this.root, randomUUID())
        await fs.mkdir(root, { mode: 0o700 })
        const record: RecordData = {
          magic: MAGIC,
          createdAt: this.now(),
          bytes: 0,
          retained: false,
        }
        const save = () =>
          fs.writeFile(path.join(root, "export.json"), JSON.stringify(record), {
            mode: 0o600,
          })
        await save()
        try {
          return await operation({
            root,
            byteLimit,
            retain: async (bytes) => {
              if (
                !Number.isSafeInteger(bytes) ||
                bytes < 0 ||
                bytes > byteLimit
              )
                throw new Error(
                  "This selection exceeds the system copy size limit"
                )
              record.bytes = bytes
              record.retained = true
              await save()
            },
            owned: async (count) => {
              record.changeCount = count
              await save()
            },
            discard: async () => {
              record.retained = false
              await save()
            },
          })
        } finally {
          if (!record.retained)
            await fs.rm(root, { recursive: true, force: true })
        }
      })
    this.pending = task
    return task
  }
}
