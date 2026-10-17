import { DurableObject } from "cloudflare:workers"

interface RepositoryRow {
  [key: string]: SqlStorageValue
  name: string
  repository_id: string
  display_name: string | null
  created_at: number
  owner_user_id: string
  lifecycle: "active" | "deleting" | "deleted"
  metadata_purged: number
  cleanup_ready_at: number
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

export interface ManagedRepositoryRecord extends RepositoryRecord {
  status: "active" | "deleting"
}

const REQUEST_LEASE_MS = 5 * 60_000
const REPOSITORY_COLUMNS =
  "name, repository_id, owner_user_id, display_name, created_at, lifecycle, metadata_purged, cleanup_ready_at"

export type RepositoryCreateResult =
  | {
      ok: true
      created: boolean
      repository: RepositoryRecord
    }
  | {
      ok: false
      reason: "owner_mismatch" | "repository_deleted"
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
    if (!columns.some((column) => column.name === "lifecycle")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE repositories ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'active'"
      )
    }
    if (!columns.some((column) => column.name === "metadata_purged")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE repositories ADD COLUMN metadata_purged INTEGER NOT NULL DEFAULT 0"
      )
    }
    if (!columns.some((column) => column.name === "cleanup_ready_at")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE repositories ADD COLUMN cleanup_ready_at INTEGER NOT NULL DEFAULT 0"
      )
    }
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS repository_requests (" +
        "id TEXT PRIMARY KEY, name TEXT NOT NULL, expires_at INTEGER NOT NULL)"
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
      if (
        existing.owner_user_id === ownerUserId &&
        existing.lifecycle !== "active"
      )
        return { ok: false, reason: "repository_deleted" }
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
    return row === undefined ||
      row.owner_user_id !== ownerUserId ||
      row.lifecycle !== "active"
      ? null
      : repositoryRecord(row)
  }

  async renameRepository(
    name: string,
    displayName: string,
    ownerUserId: string
  ): Promise<RepositoryRenameResult> {
    const existing = this.readRepository(name)
    if (existing === undefined || existing.lifecycle !== "active") {
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
        "SELECT " +
          REPOSITORY_COLUMNS +
          " FROM repositories WHERE owner_user_id = ? AND lifecycle = 'active' " +
          "ORDER BY created_at DESC, name COLLATE BINARY",
        ownerUserId
      )
      .toArray()
      .map(repositoryRecord)
  }

  async listManagedRepositories(
    ownerUserId: string,
    afterName = ""
  ): Promise<ManagedRepositoryRecord[]> {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT " +
          REPOSITORY_COLUMNS +
          " FROM repositories WHERE owner_user_id = ? AND lifecycle != 'deleted' AND name COLLATE BINARY > ? COLLATE BINARY " +
          "ORDER BY name COLLATE BINARY LIMIT 101",
        ownerUserId,
        afterName
      )
      .toArray()
      .map((row) => ({
        ...repositoryRecord(row),
        status: row.lifecycle === "active" ? "active" : "deleting",
      }))
  }

  repositoryDeletionStatus(
    name: string,
    ownerUserId: string
  ): "active" | "deleting" | "deleted" | null {
    const row = this.readRepository(name)
    return row === undefined || row.owner_user_id !== ownerUserId
      ? null
      : row.lifecycle
  }

  acquireRequest(
    name: string,
    ownerUserId: string,
    requestId: string
  ): boolean {
    const row = this.readRepository(name)
    if (
      row === undefined ||
      row.owner_user_id !== ownerUserId ||
      row.lifecycle !== "active"
    )
      return false
    this.ctx.storage.sql.exec(
      "INSERT INTO repository_requests(id, name, expires_at) VALUES (?, ?, ?)",
      requestId,
      name,
      Date.now() + REQUEST_LEASE_MS
    )
    return true
  }

  renewRequest(requestId: string): void {
    this.ctx.storage.sql.exec(
      "UPDATE repository_requests SET expires_at = ? WHERE id = ?",
      Date.now() + REQUEST_LEASE_MS,
      requestId
    )
  }

  async finishRequest(requestId: string): Promise<void> {
    this.ctx.storage.sql.exec(
      "DELETE FROM repository_requests WHERE id = ?",
      requestId
    )
    if (this.pendingDeletion() !== undefined)
      await this.ctx.storage.setAlarm(Date.now() + 1)
  }

  async requestDeletion(
    name: string,
    ownerUserId: string
  ): Promise<"deleting" | "deleted" | null> {
    const row = this.readRepository(name)
    if (row === undefined || row.owner_user_id !== ownerUserId) return null
    if (row.lifecycle === "deleted") return "deleted"
    // The durable tombstone closes admission before any R2 or quota cleanup.
    // Names are never reused, so old clients cannot recreate deleted contents.
    this.ctx.storage.sql.exec(
      "UPDATE repositories SET lifecycle = 'deleting' WHERE name = ?",
      name
    )
    await this.ctx.storage.setAlarm(Date.now() + 1)
    return "deleting"
  }

  override async alarm(): Promise<void> {
    const row = this.pendingDeletion()
    if (row === undefined) return
    const expired =
      this.ctx.storage.sql
        .exec<ChangeRow>(
          "SELECT 1 AS changed FROM repository_requests WHERE name = ? AND expires_at <= ? LIMIT 1",
          row.name,
          Date.now()
        )
        .toArray().length > 0
    if (expired) {
      this.ctx.storage.sql.exec(
        "DELETE FROM repository_requests WHERE name = ? AND expires_at <= ?",
        row.name,
        Date.now()
      )
      const readyAt = Date.now() + REQUEST_LEASE_MS
      this.ctx.storage.sql.exec(
        "UPDATE repositories SET cleanup_ready_at = ? WHERE name = ?",
        readyAt,
        row.name
      )
      await this.ctx.storage.setAlarm(readyAt)
      return
    }
    if (row.cleanup_ready_at > Date.now()) {
      await this.ctx.storage.setAlarm(row.cleanup_ready_at)
      return
    }
    const active =
      this.ctx.storage.sql
        .exec<ChangeRow>(
          "SELECT 1 AS changed FROM repository_requests WHERE name = ? LIMIT 1",
          row.name
        )
        .toArray().length > 0
    if (active) {
      await this.ctx.storage.setAlarm(Date.now() + 10_000)
      return
    }
    try {
      if (row.metadata_purged === 0) {
        await this.env.GRAFT_REPOSITORIES.getByName(
          row.repository_id
        ).purgeForDeletion(row.repository_id)
        this.ctx.storage.sql.exec(
          "UPDATE repositories SET metadata_purged = 1 WHERE name = ?",
          row.name
        )
      }
      const objects = await this.env.GRAFT_OBJECTS.list({
        prefix: "repositories/" + row.repository_id + "/",
        limit: 256,
      })
      if (objects.objects.length > 0) {
        await this.env.GRAFT_OBJECTS.delete(
          objects.objects.map((object) => object.key)
        )
        await this.ctx.storage.setAlarm(Date.now() + 1)
        return
      }
      const namespace = row.repository_id.slice(
        0,
        row.repository_id.indexOf("/")
      )
      await this.env.GRAFT_USAGE.getByName(namespace).purgeRepository(
        row.repository_id
      )
      this.ctx.storage.sql.exec(
        "UPDATE repositories SET lifecycle = 'deleted', display_name = name WHERE name = ?",
        row.name
      )
      if (this.pendingDeletion() !== undefined)
        await this.ctx.storage.setAlarm(Date.now() + 1)
    } catch {
      console.error(
        JSON.stringify({ message: "Sync repository deletion will retry" })
      )
      await this.ctx.storage.setAlarm(Date.now() + 30_000)
    }
  }

  private pendingDeletion(): RepositoryRow | undefined {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT " +
          REPOSITORY_COLUMNS +
          " FROM repositories WHERE lifecycle = 'deleting' ORDER BY created_at LIMIT 1"
      )
      .toArray()[0]
  }

  private readRepository(name: string): RepositoryRow | undefined {
    return this.ctx.storage.sql
      .exec<RepositoryRow>(
        "SELECT " + REPOSITORY_COLUMNS + " FROM repositories WHERE name = ?",
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
