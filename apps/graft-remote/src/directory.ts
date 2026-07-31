import { DurableObject } from "cloudflare:workers"

interface RepositoryRow {
  [key: string]: SqlStorageValue
  name: string
  repository_id: string
  display_name: string | null
  created_at: number
  owner_user_id: string
}

interface TableColumnRow {
  [key: string]: SqlStorageValue
  name: string
}

interface ChangeRow {
  [key: string]: SqlStorageValue
  changed: number
}

export interface RepositoryRecord {
  name: string
  id: string
  displayName: string
  createdAt: number
}

export type RepositoryCreateResult =
  | {
      ok: true
      created: boolean
      repository: RepositoryRecord
    }
  | {
      ok: false
      reason: "owner_mismatch"
    }

export type RepositoryRenameResult =
  | {
      ok: true
      repository: RepositoryRecord
    }
  | {
      ok: false
      reason: "not_found" | "owner_mismatch"
    }

export class RepositoryDirectoryDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS repositories (" +
        "name TEXT PRIMARY KEY, " +
        "repository_id TEXT NOT NULL UNIQUE, " +
        "owner_user_id TEXT NOT NULL, " +
        "display_name TEXT NOT NULL, " +
        "created_at INTEGER NOT NULL)"
    )
    const columns = this.ctx.storage.sql
      .exec<TableColumnRow>("PRAGMA table_info(repositories)")
      .toArray()
    if (!columns.some((column) => column.name === "display_name")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE repositories ADD COLUMN display_name TEXT"
      )
    }
    this.ctx.storage.sql.exec(
      "UPDATE repositories SET display_name = name WHERE display_name IS NULL"
    )
  }

  async createRepository(
    namespace: string,
    name: string,
    displayName: string,
    ownerUserId: string
  ): Promise<RepositoryCreateResult> {
    const existing = this.readRepository(name)
    if (existing !== undefined) {
      return existing.owner_user_id === ownerUserId
        ? {
            ok: true,
            created: false,
            repository: repositoryRecord(existing),
          }
        : { ok: false, reason: "owner_mismatch" }
    }

    const repositoryId = [namespace, name].join("/")
    const createdAt = Date.now()
    const inserted =
      this.ctx.storage.sql
        .exec<ChangeRow>(
          "INSERT OR IGNORE INTO repositories(" +
            "name, repository_id, owner_user_id, display_name, created_at" +
            ") VALUES (?, ?, ?, ?, ?) RETURNING 1 AS changed",
          name,
          repositoryId,
          ownerUserId,
          displayName,
          createdAt
        )
        .toArray().length === 1
    const stored = this.readRepository(name)
    if (stored === undefined || stored.owner_user_id !== ownerUserId) {
      return { ok: false, reason: "owner_mismatch" }
    }
    return {
      ok: true,
      created: inserted,
      repository: repositoryRecord(stored),
    }
  }

  async findRepository(
    name: string,
    ownerUserId: string
  ): Promise<RepositoryRecord | null> {
    const row = this.readRepository(name)
    return row === undefined || row.owner_user_id !== ownerUserId
      ? null
      : repositoryRecord(row)
  }

  async renameRepository(
    name: string,
    displayName: string,
    ownerUserId: string
  ): Promise<RepositoryRenameResult> {
    const existing = this.readRepository(name)
    if (existing === undefined) {
      return { ok: false, reason: "not_found" }
    }
    if (existing.owner_user_id !== ownerUserId) {
      return { ok: false, reason: "owner_mismatch" }
    }

    this.ctx.storage.sql.exec(
      "UPDATE repositories SET display_name = ? " +
        "WHERE name = ? AND owner_user_id = ?",
      displayName,
      name,
      ownerUserId
    )
    const stored = this.readRepository(name)
    if (stored === undefined || stored.owner_user_id !== ownerUserId) {
      return { ok: false, reason: "owner_mismatch" }
    }
    return { ok: true, repository: repositoryRecord(stored) }
  }

  async listRepositories(ownerUserId: string): Promise<RepositoryRecord[]> {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT name, repository_id, owner_user_id, display_name, created_at " +
          "FROM repositories WHERE owner_user_id = ? " +
          "ORDER BY created_at DESC, name COLLATE BINARY",
        ownerUserId
      )
      .toArray()
      .map(repositoryRecord)
  }

  private readRepository(name: string): RepositoryRow | undefined {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT name, repository_id, owner_user_id, display_name, created_at " +
          "FROM repositories WHERE name = ?",
        name
      )
      .toArray()[0]
  }
}

function repositoryRecord(row: RepositoryRow): RepositoryRecord {
  return {
    name: row.name,
    id: row.repository_id,
    displayName: row.display_name ?? row.name,
    createdAt: row.created_at,
  }
}
