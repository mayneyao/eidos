import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"
import { Readable } from "node:stream"
import type {
  GraftRepositoryBackend,
  GraftWriteBody,
  GraftByteRange,
  GraftListQuery,
  GraftListResult,
} from "@eidos.space/graft-remote"

export interface PeerObjectStoreOptions {
  /** Use FULL synchronous mode and fsync every blob file. Default false (WAL + NORMAL, fsync transactional refs only). */
  durable?: boolean
}

function isTransactionalKey(key: string) {
  return key === "HEAD" || key.startsWith("refs/")
}

/** A separate Remote object store, never a view onto the live Space or .graft. */
export class PeerObjectStore implements GraftRepositoryBackend {
  private readonly db: DatabaseSync
  private readonly blobs: string
  private readonly durable: boolean
  private readonly stmtSelect: StatementSync
  private readonly stmtUpsert: StatementSync
  private readonly stmtInsertIgnore: StatementSync
  private readonly stmtDelete: StatementSync
  private readonly stmtList: StatementSync
  constructor(
    directory: string,
    private readonly reviewed?: PeerObjectStore,
    options: PeerObjectStoreOptions = {}
  ) {
    this.durable = options.durable === true
    this.blobs = path.join(directory, "blobs")
    fs.mkdirSync(this.blobs, { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path.join(directory, "objects.sqlite"))
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA synchronous=${this.durable ? "FULL" : "NORMAL"}; CREATE TABLE IF NOT EXISTS objects (path TEXT PRIMARY KEY, blob TEXT NOT NULL, size INTEGER NOT NULL)`
    )
    this.stmtSelect = this.db.prepare(
      "SELECT blob, size FROM objects WHERE path=?"
    )
    this.stmtUpsert = this.db.prepare(
      "INSERT INTO objects VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET blob=excluded.blob,size=excluded.size"
    )
    this.stmtInsertIgnore = this.db.prepare(
      "INSERT OR IGNORE INTO objects VALUES(?,?,?)"
    )
    this.stmtDelete = this.db.prepare("DELETE FROM objects WHERE path=?")
    this.stmtList = this.db.prepare(
      "SELECT path,blob,size FROM objects WHERE path>=? AND path<? AND path>? ORDER BY path LIMIT ?"
    )
  }
  close() {
    this.db.close()
  }
  private row(key: string) {
    return this.stmtSelect.get(key) as
      | { blob: string; size: number }
      | undefined
  }
  head(key: string): { size: number; etag: string } | null {
    const row = this.row(key)
    return row
      ? { size: row.size, etag: row.blob }
      : this.isStorageKey(key)
        ? (this.reviewed?.head(key) ?? null)
        : null
  }
  readText(key: string): string | null {
    const row = this.row(key)
    if (!row) return null
    try {
      return fs.readFileSync(path.join(this.blobs, row.blob), "utf8")
    } catch {
      return null
    }
  }
  private isStorageKey(key: string) {
    // External file payloads, storage history, and immutable repository objects
    // are content-addressed and read-only. Reuse reviewed bytes when a phone
    // publishes incoming history so it does not miss or re-upload shared history;
    // HEAD, branch refs, and all writes remain private to each incoming store.
    return (
      key.startsWith("objects/") ||
      key.startsWith("segments/") ||
      key.startsWith("logs/") ||
      /^store\/files\/[a-f0-9]{2}\/[a-f0-9]{62}$/.test(key)
    )
  }
  private shouldListReviewed(prefix: string) {
    if (prefix === "") return true
    return (
      prefix.startsWith("objects") ||
      "objects/".startsWith(prefix) ||
      prefix.startsWith("segments") ||
      "segments/".startsWith(prefix) ||
      prefix.startsWith("logs") ||
      "logs/".startsWith(prefix) ||
      prefix.startsWith("store/files/") ||
      "store/files/".startsWith(prefix)
    )
  }
  get(
    key: string,
    range?: GraftByteRange
  ): {
    body: ReadableStream<Uint8Array<ArrayBuffer>>
    size: number
    etag: string
  } | null {
    const row = this.row(key)
    // Historical snapshots already downloaded from this Space can be lazy:
    // hydration during a push needs the original immutable segment bytes.
    if (!row)
      return this.isStorageKey(key)
        ? (this.reviewed?.get(key, range) ?? null)
        : null
    const body = Readable.toWeb(
      fs.createReadStream(
        path.join(this.blobs, row.blob),
        range ? { start: range.start, end: range.end } : {}
      )
    ) as ReadableStream<Uint8Array<ArrayBuffer>>
    return { body, size: row.size, etag: row.blob }
  }
  private async store(value: GraftWriteBody, syncFile = false) {
    if (value instanceof Uint8Array) {
      if (value.byteLength > 256 * 1024 * 1024)
        throw new Error("Peer object exceeds 256 MiB")
      const blob = createHash("sha256").update(value).digest("hex")
      const target = path.join(this.blobs, blob)
      const exists = await fsp.access(target).then(
        () => true,
        () => false
      )
      if (!exists) {
        const temporary = path.join(this.blobs, `upload-${randomUUID()}`)
        const output = await fsp.open(temporary, "wx", 0o600)
        try {
          await output.writeFile(value)
          if (syncFile) await output.sync()
          await output.close()
          await fsp.rename(temporary, target)
        } finally {
          await output.close().catch(() => {})
          await fsp.rm(temporary, { force: true })
        }
      }
      return { blob, size: value.byteLength }
    }
    const temporary = path.join(this.blobs, `upload-${randomUUID()}`)
    const output = await fsp.open(temporary, "wx", 0o600)
    const hash = createHash("sha256")
    let size = 0
    const reader = value.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        const chunk = next.value
        size += chunk.byteLength
        if (size > 256 * 1024 * 1024)
          throw new Error("Peer object exceeds 256 MiB")
        hash.update(chunk)
        await output.writeFile(chunk)
      }
      if (syncFile) await output.sync()
      await output.close()
      const blob = hash.digest("hex")
      await fsp.rename(temporary, path.join(this.blobs, blob))
      return { blob, size }
    } finally {
      reader.releaseLock()
      await output.close().catch(() => {})
      await fsp.rm(temporary, { force: true })
    }
  }
  async put(key: string, value: Uint8Array<ArrayBuffer>) {
    const row = await this.store(value, this.durable || isTransactionalKey(key))
    this.stmtUpsert.run(key, row.blob, row.size)
  }
  delete(key: string) {
    this.stmtDelete.run(key)
  }
  async putIfAbsent(key: string, value: GraftWriteBody) {
    if (this.row(key)) return false
    const row = await this.store(value, this.durable || isTransactionalKey(key))
    return this.stmtInsertIgnore.run(key, row.blob, row.size).changes === 1
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
    const row = await this.store(
      replacement,
      this.durable || isTransactionalKey(key)
    )
    // No await between comparison and update: all writers share this event loop.
    if (!this.matches(key, expected)) return false
    this.stmtUpsert.run(key, row.blob, row.size)
    return true
  }
  compareAndDelete(key: string, expected: Uint8Array<ArrayBuffer> | undefined) {
    if (!this.matches(key, expected)) return false
    this.delete(key)
    return true
  }
  list(query: GraftListQuery): GraftListResult {
    if (query.limit <= 0) {
      return { paths: [], entries: [], hasMore: false }
    }
    const rows = this.stmtList.all(
      query.prefix,
      query.prefix + "\uffff",
      query.after ?? "",
      query.limit + 1
    ) as { path: string; blob: string; size: number }[]
    const localEntries = rows.map((row) => ({
      path: row.path,
      etag: row.blob,
      size: row.size,
    }))
    if (!this.reviewed || !this.shouldListReviewed(query.prefix)) {
      const entries = localEntries.slice(0, query.limit)
      return {
        paths: entries.map((row) => row.path),
        entries,
        hasMore: rows.length > query.limit,
      }
    }
    const merged = new Map<
      string,
      { path: string; etag: string; size: number }
    >()
    const visibleReviewed: { path: string; etag: string; size: number }[] = []
    let after = query.after
    const batchLimit = Math.max(query.limit + 1, 64)
    while (visibleReviewed.length <= query.limit) {
      const page = this.reviewed.list({
        prefix: query.prefix,
        after,
        limit: batchLimit,
      })
      const pageEntries = page.entries ?? []
      for (const entry of pageEntries) {
        if (this.isStorageKey(entry.path)) {
          visibleReviewed.push({
            path: entry.path,
            etag: entry.etag ?? "",
            size: entry.size,
          })
        }
      }
      if (!page.hasMore || page.paths.length === 0) {
        break
      }
      const nextAfter = page.paths[page.paths.length - 1]
      if (nextAfter === after) {
        break
      }
      after = nextAfter
    }
    for (const entry of visibleReviewed) {
      merged.set(entry.path, entry)
    }
    for (const entry of localEntries) {
      merged.set(entry.path, entry)
    }
    const sorted = [...merged.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    )
    const entries = sorted.slice(0, query.limit)
    return {
      paths: entries.map((row) => row.path),
      entries,
      hasMore: sorted.length > query.limit,
    }
  }
}
