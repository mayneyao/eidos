import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

import {
  FILE_SPACE_INDEX_FORMAT_VERSION,
  type FileSpaceIndexRecord,
  type FileSpaceIndexSnapshot,
  type FileSpaceIndexStorage,
} from "./index-storage"
import type { FileSpaceMarkdownMetadata } from "./markdown-metadata"

const APPLICATION_ID = 0x45494458 // EIDX

interface StoredIndexRow {
  path: string
  name: string
  size: number
  mtime_ms: number
  content: string | null
  metadata_json: string | null
}

function schemaSql(): string {
  return `
    PRAGMA application_id = ${APPLICATION_ID};
    PRAGMA user_version = ${FILE_SPACE_INDEX_FORMAT_VERSION};
    CREATE TABLE IF NOT EXISTS index_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS indexed_files (
      path TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      content TEXT,
      metadata_json TEXT
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS indexed_directories (
      path TEXT PRIMARY KEY NOT NULL
    ) WITHOUT ROWID;
  `
}

function toRecord(row: StoredIndexRow): FileSpaceIndexRecord {
  let metadata: FileSpaceMarkdownMetadata | undefined
  if (row.metadata_json) {
    metadata = JSON.parse(row.metadata_json) as FileSpaceMarkdownMetadata
  }
  return {
    path: row.path,
    name: row.name,
    size: row.size,
    mtimeMs: row.mtime_ms,
    content: row.content ?? undefined,
    metadata,
  }
}

export class BetterSqlite3FileSpaceIndexStorage implements FileSpaceIndexStorage {
  private readonly database: Database.Database
  private readonly upsertStatement: Database.Statement

  constructor(readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true })
    this.database = this.openOrRecover(filePath)
    this.upsertStatement = this.database.prepare(`
      INSERT INTO indexed_files (
        path, name, size, mtime_ms, content, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        size = excluded.size,
        mtime_ms = excluded.mtime_ms,
        content = excluded.content,
        metadata_json = excluded.metadata_json
    `)
  }

  load(): FileSpaceIndexSnapshot | null {
    try {
      const applicationId = this.database.pragma("application_id", {
        simple: true,
      }) as number
      const userVersion = this.database.pragma("user_version", {
        simple: true,
      }) as number
      if (
        applicationId !== APPLICATION_ID ||
        userVersion !== FILE_SPACE_INDEX_FORMAT_VERSION
      ) {
        return null
      }
      const meta = new Map(
        this.database
          .prepare("SELECT key, value FROM index_meta")
          .all()
          .map((row) => {
            const value = row as { key: string; value: string }
            return [value.key, value.value] as const
          })
      )
      const optionsKey = meta.get("options_key")
      const indexedAt = Number(meta.get("indexed_at"))
      if (!optionsKey || !Number.isFinite(indexedAt)) return null

      return {
        formatVersion: FILE_SPACE_INDEX_FORMAT_VERSION,
        optionsKey,
        indexedAt,
        directories: this.database
          .prepare("SELECT path FROM indexed_directories ORDER BY path")
          .all()
          .map((row) => (row as { path: string }).path),
        entries: this.database
          .prepare(
            `SELECT path, name, size, mtime_ms, content, metadata_json
             FROM indexed_files ORDER BY path`
          )
          .all()
          .map((row) => toRecord(row as StoredIndexRow)),
      }
    } catch {
      return null
    }
  }

  replace(snapshot: FileSpaceIndexSnapshot): void {
    this.database.transaction(() => {
      this.database.exec(
        "DELETE FROM indexed_files; DELETE FROM indexed_directories; DELETE FROM index_meta;"
      )
      const insertDirectory = this.database.prepare(
        "INSERT INTO indexed_directories(path) VALUES (?)"
      )
      for (const directory of snapshot.directories) {
        insertDirectory.run(directory)
      }
      for (const entry of snapshot.entries) this.upsertRecord(entry)
      const insertMeta = this.database.prepare(
        "INSERT INTO index_meta(key, value) VALUES (?, ?)"
      )
      insertMeta.run("options_key", snapshot.optionsKey)
      insertMeta.run("indexed_at", String(snapshot.indexedAt))
    })()
  }

  upsert(record: FileSpaceIndexRecord): void {
    this.upsertRecord(record)
  }

  removePath(relativePath: string): void {
    const descendantPrefix = `${relativePath}/`
    this.database
      .prepare(
        `DELETE FROM indexed_files
         WHERE path = ? OR substr(path, 1, ?) = ?`
      )
      .run(relativePath, descendantPrefix.length, descendantPrefix)
    this.database
      .prepare(
        `DELETE FROM indexed_directories
         WHERE path = ? OR substr(path, 1, ?) = ?`
      )
      .run(relativePath, descendantPrefix.length, descendantPrefix)
  }

  clear(): void {
    this.database.exec(
      "DELETE FROM indexed_files; DELETE FROM indexed_directories; DELETE FROM index_meta;"
    )
  }

  close(): void {
    this.database.close()
  }

  private openOrRecover(filePath: string): Database.Database {
    let database: Database.Database | undefined
    try {
      database = new Database(filePath)
      const applicationId = database.pragma("application_id", {
        simple: true,
      }) as number
      const userVersion = database.pragma("user_version", {
        simple: true,
      }) as number
      if (applicationId !== 0 && applicationId !== APPLICATION_ID) {
        throw new Error("The index path contains an unrelated SQLite file")
      }
      if (
        applicationId === APPLICATION_ID &&
        userVersion !== 0 &&
        userVersion !== FILE_SPACE_INDEX_FORMAT_VERSION
      ) {
        throw new Error("The derived index schema is incompatible")
      }
      database.exec(
        "PRAGMA journal_mode = DELETE; PRAGMA synchronous = NORMAL;"
      )
      database.exec(schemaSql())
      return database
    } catch {
      database?.close()
      rmSync(filePath, { force: true })
      const recovered = new Database(filePath)
      recovered.exec(
        "PRAGMA journal_mode = DELETE; PRAGMA synchronous = NORMAL;"
      )
      recovered.exec(schemaSql())
      return recovered
    }
  }

  private upsertRecord(record: FileSpaceIndexRecord): void {
    this.upsertStatement.run(
      record.path,
      record.name,
      record.size,
      record.mtimeMs,
      record.content ?? null,
      record.metadata ? JSON.stringify(record.metadata) : null
    )
  }
}

export function openFileSpaceIndexStorage(
  spaceRoot: string
): BetterSqlite3FileSpaceIndexStorage {
  return new BetterSqlite3FileSpaceIndexStorage(
    path.join(spaceRoot, ".eidos", "indexes", "markdown.sqlite3")
  )
}
