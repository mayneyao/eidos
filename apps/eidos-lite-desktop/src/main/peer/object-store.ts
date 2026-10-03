import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { Readable } from "node:stream"
import type {
  GraftRepositoryBackend,
  GraftWriteBody,
  GraftByteRange,
  GraftListQuery,
} from "@eidos.space/graft-remote"

/** A separate Remote object store, never a view onto the live Space or .graft. */
export class PeerObjectStore implements GraftRepositoryBackend {
  private readonly db: DatabaseSync
  private readonly blobs: string
  constructor(directory: string) {
    this.blobs = path.join(directory, "blobs")
    fs.mkdirSync(this.blobs, { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path.join(directory, "objects.sqlite"))
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS objects (path TEXT PRIMARY KEY, blob TEXT NOT NULL, size INTEGER NOT NULL)"
    )
  }
  close() {
    this.db.close()
  }
  private row(key: string) {
    return this.db
      .prepare("SELECT blob, size FROM objects WHERE path=?")
      .get(key) as { blob: string; size: number } | undefined
  }
  head(key: string) {
    const row = this.row(key)
    return row ? { size: row.size, etag: row.blob } : null
  }
  get(key: string, range?: GraftByteRange) {
    const row = this.row(key)
    if (!row) return null
    const body = Readable.toWeb(
      fs.createReadStream(
        path.join(this.blobs, row.blob),
        range ? { start: range.start, end: range.end } : {}
      )
    ) as ReadableStream<Uint8Array<ArrayBuffer>>
    return { body, size: row.size, etag: row.blob }
  }
  private async store(value: GraftWriteBody) {
    const temporary = path.join(this.blobs, `upload-${randomUUID()}`)
    const output = await fsp.open(temporary, "wx", 0o600)
    const hash = createHash("sha256")
    let size = 0
    try {
      async function* stream() {
        if (value instanceof Uint8Array) {
          yield value
          return
        }
        const reader = value.getReader()
        try {
          while (true) {
            const next = await reader.read()
            if (next.done) break
            yield next.value
          }
        } finally {
          reader.releaseLock()
        }
      }
      const chunks = stream()
      for await (const chunk of chunks) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > 256 * 1024 * 1024)
          throw new Error("Peer object exceeds 256 MiB")
        hash.update(bytes)
        await output.writeFile(bytes)
      }
      await output.sync()
      await output.close()
      const blob = hash.digest("hex")
      await fsp.rename(temporary, path.join(this.blobs, blob))
      return { blob, size }
    } finally {
      await output.close().catch(() => {})
      await fsp.rm(temporary, { force: true })
    }
  }
  async put(key: string, value: Uint8Array<ArrayBuffer>) {
    const row = await this.store(value)
    this.db
      .prepare(
        "INSERT INTO objects VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET blob=excluded.blob,size=excluded.size"
      )
      .run(key, row.blob, row.size)
  }
  delete(key: string) {
    this.db.prepare("DELETE FROM objects WHERE path=?").run(key)
  }
  async putIfAbsent(key: string, value: GraftWriteBody) {
    const row = await this.store(value)
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO objects VALUES(?,?,?)")
        .run(key, row.blob, row.size).changes === 1
    )
  }
  private matches(key: string, expected: Uint8Array<ArrayBuffer> | undefined) {
    const row = this.row(key)
    return expected === undefined
      ? !row
      : Boolean(
          row &&
          fs
            .readFileSync(path.join(this.blobs, row.blob))
            .equals(Buffer.from(expected))
        )
  }
  async compareAndSwap(
    key: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
    replacement: Uint8Array<ArrayBuffer>
  ) {
    const row = await this.store(replacement)
    // No await between comparison and update: all writers share this event loop.
    if (!this.matches(key, expected)) return false
    this.db
      .prepare(
        "INSERT INTO objects VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET blob=excluded.blob,size=excluded.size"
      )
      .run(key, row.blob, row.size)
    return true
  }
  compareAndDelete(key: string, expected: Uint8Array<ArrayBuffer> | undefined) {
    if (!this.matches(key, expected)) return false
    this.delete(key)
    return true
  }
  list(query: GraftListQuery) {
    const rows = this.db
      .prepare(
        "SELECT path,blob,size FROM objects WHERE path>=? AND path<? AND path>? ORDER BY path LIMIT ?"
      )
      .all(
        query.prefix,
        query.prefix + "\uffff",
        query.after ?? "",
        query.limit + 1
      ) as { path: string; blob: string; size: number }[]
    const entries = rows
      .slice(0, query.limit)
      .map((row) => ({ path: row.path, etag: row.blob, size: row.size }))
    return {
      paths: entries.map((row) => row.path),
      entries,
      hasMore: rows.length > query.limit,
    }
  }
}
