import { DurableObject } from "cloudflare:workers"

interface RepositoryRow {
  [key: string]: SqlStorageValue
  name: string
  repository_id: string
  created_at: number
  owner_user_id: string
}

interface ChangeRow {
  [key: string]: SqlStorageValue
  changed: number
}

export interface RepositoryRecord {
  name: string
  id: string
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

export class RepositoryDirectoryDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS repositories (" +
        "name TEXT PRIMARY KEY, " +
        "repository_id TEXT NOT NULL UNIQUE, " +
        "owner_user_id TEXT NOT NULL, " +
        "created_at INTEGER NOT NULL)"
    )
  }

  async createRepository(
    namespace: string,
    name: string,
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
            "name, repository_id, owner_user_id, created_at" +
            ") VALUES (?, ?, ?, ?) RETURNING 1 AS changed",
          name,
          repositoryId,
          ownerUserId,
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

  async listRepositories(ownerUserId: string): Promise<RepositoryRecord[]> {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT name, repository_id, owner_user_id, created_at " +
          "FROM repositories WHERE owner_user_id = ? " +
          "ORDER BY name COLLATE BINARY",
        ownerUserId
      )
      .toArray()
      .map(repositoryRecord)
  }

  private readRepository(name: string): RepositoryRow | undefined {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT name, repository_id, owner_user_id, created_at " +
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
    createdAt: row.created_at,
  }
}
