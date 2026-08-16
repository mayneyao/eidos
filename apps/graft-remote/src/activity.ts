import { DurableObject } from "cloudflare:workers"

export const SYNC_ACTIVITY_LIMIT_MAX = 200
const SYNC_ACTIVITY_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000

export type SyncActivityKind = "read" | "write" | "manage"

interface SyncActivityRow {
  [key: string]: SqlStorageValue
  user_id: string
  last_activity_at: number
  last_kind: SyncActivityKind
  last_read_at: number | null
  last_write_at: number | null
  last_manage_at: number | null
}

export interface SyncActivityEvent {
  userId: string
  kind: SyncActivityKind
  occurredAt: number
}

export interface SyncActivitySummary {
  userId: string
  lastActivityAt: number
  lastKind: SyncActivityKind
  lastReadAt: number | null
  lastWriteAt: number | null
  lastManageAt: number | null
}

export class SyncActivityDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sync_activity (" +
        "user_id TEXT PRIMARY KEY, " +
        "last_activity_at INTEGER NOT NULL, " +
        "last_kind TEXT NOT NULL CHECK (last_kind IN ('read', 'write', 'manage')), " +
        "last_read_at INTEGER, " +
        "last_write_at INTEGER, " +
        "last_manage_at INTEGER)"
    )
    this.ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_sync_activity_recent " +
        "ON sync_activity(last_activity_at DESC, user_id)"
    )
  }

  async record(event: SyncActivityEvent): Promise<void> {
    const userId = validateUserId(event.userId)
    const kind = validateKind(event.kind)
    const occurredAt = validateOccurredAt(event.occurredAt)
    const readAt = kind === "read" ? occurredAt : null
    const writeAt = kind === "write" ? occurredAt : null
    const manageAt = kind === "manage" ? occurredAt : null

    this.removeExpired(occurredAt)

    this.ctx.storage.sql.exec(
      `INSERT INTO sync_activity (
         user_id, last_activity_at, last_kind,
         last_read_at, last_write_at, last_manage_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         last_kind = CASE
           WHEN excluded.last_activity_at >= sync_activity.last_activity_at
             THEN excluded.last_kind
           ELSE sync_activity.last_kind
         END,
         last_activity_at = MAX(
           sync_activity.last_activity_at,
           excluded.last_activity_at
         ),
         last_read_at = CASE
           WHEN excluded.last_read_at IS NULL THEN sync_activity.last_read_at
           WHEN sync_activity.last_read_at IS NULL THEN excluded.last_read_at
           ELSE MAX(sync_activity.last_read_at, excluded.last_read_at)
         END,
         last_write_at = CASE
           WHEN excluded.last_write_at IS NULL THEN sync_activity.last_write_at
           WHEN sync_activity.last_write_at IS NULL THEN excluded.last_write_at
           ELSE MAX(sync_activity.last_write_at, excluded.last_write_at)
         END,
         last_manage_at = CASE
           WHEN excluded.last_manage_at IS NULL THEN sync_activity.last_manage_at
           WHEN sync_activity.last_manage_at IS NULL THEN excluded.last_manage_at
           ELSE MAX(sync_activity.last_manage_at, excluded.last_manage_at)
         END`,
      userId,
      occurredAt,
      kind,
      readAt,
      writeAt,
      manageAt
    )
  }

  async listRecent(limit: number): Promise<SyncActivitySummary[]> {
    const boundedLimit = validateLimit(limit)
    this.removeExpired(Date.now())
    return this.ctx.storage.sql
      .exec<SyncActivityRow>(
        `SELECT user_id, last_activity_at, last_kind,
                last_read_at, last_write_at, last_manage_at
           FROM sync_activity
          ORDER BY last_activity_at DESC, user_id
          LIMIT ?`,
        boundedLimit
      )
      .toArray()
      .map((row) => ({
        userId: row.user_id,
        lastActivityAt: row.last_activity_at,
        lastKind: row.last_kind,
        lastReadAt: row.last_read_at,
        lastWriteAt: row.last_write_at,
        lastManageAt: row.last_manage_at,
      }))
  }

  private removeExpired(now: number): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM sync_activity WHERE last_activity_at < ?",
      now - SYNC_ACTIVITY_RETENTION_MS
    )
  }
}

function validateUserId(value: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError("Invalid Sync activity user id")
  }
  return value
}

function validateKind(value: SyncActivityKind): SyncActivityKind {
  if (value !== "read" && value !== "write" && value !== "manage") {
    throw new TypeError("Invalid Sync activity kind")
  }
  return value
}

function validateOccurredAt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Invalid Sync activity timestamp")
  }
  return value
}

function validateLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Invalid Sync activity limit")
  }
  return Math.min(value, SYNC_ACTIVITY_LIMIT_MAX)
}
