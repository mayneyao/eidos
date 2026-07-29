import { DurableObject } from "cloudflare:workers"

const RESERVATION_TTL_MS = 15 * 60 * 1000

interface BytesRow {
  [key: string]: SqlStorageValue
  bytes: number
}

interface ReservationRow {
  [key: string]: SqlStorageValue
  id: string
  repository_id: string
  path: string
  bytes: number
}

export interface SyncUsageSummary {
  usedBytes: number
  reservedBytes: number
  quotaBytes: number
  remainingBytes: number
}

export type SyncUsageReservationResult =
  | {
      ok: true
      reservationId: string | null
      alreadyTracked: boolean
      wouldExceed: boolean
      summary: SyncUsageSummary
    }
  | {
      ok: false
      reason: "quota_exceeded"
      summary: SyncUsageSummary
    }

export class SyncUsageDurableObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS immutable_objects (" +
        "repository_id TEXT NOT NULL, " +
        "path TEXT NOT NULL, " +
        "bytes INTEGER NOT NULL CHECK (bytes >= 0), " +
        "created_at INTEGER NOT NULL, " +
        "PRIMARY KEY (repository_id, path))"
    )
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS byte_reservations (" +
        "id TEXT PRIMARY KEY, " +
        "repository_id TEXT NOT NULL, " +
        "path TEXT NOT NULL, " +
        "bytes INTEGER NOT NULL CHECK (bytes >= 0), " +
        "expires_at INTEGER NOT NULL, " +
        "created_at INTEGER NOT NULL)"
    )
    this.ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_byte_reservations_expiry " +
        "ON byte_reservations(expires_at)"
    )
  }

  reserve(input: {
    reservationId: string
    repositoryId: string
    path: string
    bytes: number
    quotaBytes: number
    enforce: boolean
  }): SyncUsageReservationResult {
    validateInput(input)
    const now = Date.now()
    this.removeExpired(now)
    if (this.objectExists(input.repositoryId, input.path)) {
      return {
        ok: true,
        reservationId: null,
        alreadyTracked: true,
        wouldExceed: false,
        summary: this.readSummary(input.quotaBytes),
      }
    }

    const before = this.readSummary(input.quotaBytes)
    const wouldExceed =
      before.usedBytes + before.reservedBytes + input.bytes > input.quotaBytes
    if (wouldExceed && input.enforce) {
      return { ok: false, reason: "quota_exceeded", summary: before }
    }
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO byte_reservations(" +
        "id, repository_id, path, bytes, expires_at, created_at" +
        ") VALUES (?, ?, ?, ?, ?, ?)",
      input.reservationId,
      input.repositoryId,
      input.path,
      input.bytes,
      now + RESERVATION_TTL_MS,
      now
    )
    return {
      ok: true,
      reservationId: input.reservationId,
      alreadyTracked: false,
      wouldExceed,
      summary: this.readSummary(input.quotaBytes),
    }
  }

  commit(input: {
    reservationId: string
    actualBytes: number
    quotaBytes: number
  }): SyncUsageSummary {
    validateBytes(input.actualBytes, "actualBytes")
    validateBytes(input.quotaBytes, "quotaBytes")
    this.removeExpired(Date.now())
    const reservation = this.ctx.storage.sql
      .exec<ReservationRow>(
        "SELECT repository_id, path, bytes FROM byte_reservations WHERE id = ?",
        input.reservationId
      )
      .toArray()[0]
    if (reservation === undefined) return this.readSummary(input.quotaBytes)
    this.recordObject(
      reservation.repository_id,
      reservation.path,
      input.actualBytes
    )
    this.removePathReservations(reservation.repository_id, reservation.path)
    return this.readSummary(input.quotaBytes)
  }

  observeExisting(input: {
    repositoryId: string
    path: string
    actualBytes: number
    quotaBytes: number
  }): SyncUsageSummary {
    validateObjectIdentity(input.repositoryId, input.path)
    validateBytes(input.actualBytes, "actualBytes")
    validateBytes(input.quotaBytes, "quotaBytes")
    this.removeExpired(Date.now())
    this.recordObject(input.repositoryId, input.path, input.actualBytes)
    this.removePathReservations(input.repositoryId, input.path)
    return this.readSummary(input.quotaBytes)
  }

  release(reservationId: string, quotaBytes: number): SyncUsageSummary {
    validateIdentifier(reservationId, "reservationId")
    validateBytes(quotaBytes, "quotaBytes")
    this.ctx.storage.sql.exec(
      "DELETE FROM byte_reservations WHERE id = ?",
      reservationId
    )
    this.removeExpired(Date.now())
    return this.readSummary(quotaBytes)
  }

  summary(quotaBytes: number): SyncUsageSummary {
    validateBytes(quotaBytes, "quotaBytes")
    this.removeExpired(Date.now())
    return this.readSummary(quotaBytes)
  }

  private recordObject(
    repositoryId: string,
    path: string,
    actualBytes: number
  ): void {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO immutable_objects(" +
        "repository_id, path, bytes, created_at" +
        ") VALUES (?, ?, ?, ?)",
      repositoryId,
      path,
      actualBytes,
      Date.now()
    )
  }

  private removePathReservations(repositoryId: string, path: string): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM byte_reservations WHERE repository_id = ? AND path = ?",
      repositoryId,
      path
    )
  }

  private removeExpired(now: number): void {
    const expired = this.ctx.storage.sql
      .exec<ReservationRow>(
        "SELECT id, repository_id, path, bytes " +
          "FROM byte_reservations WHERE expires_at <= ?",
        now
      )
      .toArray()
    for (const reservation of expired) {
      // An expired reservation may represent an R2 write that completed just
      // before the Worker lost its usage-commit response. Converting it to
      // measured usage is deliberately fail-closed; reconciliation can remove
      // a false positive, while silently releasing it could oversell storage.
      this.recordObject(
        reservation.repository_id,
        reservation.path,
        reservation.bytes
      )
      this.ctx.storage.sql.exec(
        "DELETE FROM byte_reservations WHERE id = ?",
        reservation.id
      )
    }
  }

  private objectExists(repositoryId: string, path: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<BytesRow>(
          "SELECT bytes FROM immutable_objects " +
            "WHERE repository_id = ? AND path = ?",
          repositoryId,
          path
        )
        .toArray().length === 1
    )
  }

  private readSummary(quotaBytes: number): SyncUsageSummary {
    const usedBytes = this.ctx.storage.sql
      .exec<BytesRow>(
        "SELECT COALESCE(SUM(bytes), 0) AS bytes FROM immutable_objects"
      )
      .one().bytes
    const reservedBytes = this.ctx.storage.sql
      .exec<BytesRow>(
        "SELECT COALESCE(SUM(bytes), 0) AS bytes FROM byte_reservations"
      )
      .one().bytes
    validateBytes(usedBytes, "usedBytes")
    validateBytes(reservedBytes, "reservedBytes")
    return {
      usedBytes,
      reservedBytes,
      quotaBytes,
      remainingBytes: Math.max(0, quotaBytes - usedBytes - reservedBytes),
    }
  }
}

function validateInput(input: {
  reservationId: string
  repositoryId: string
  path: string
  bytes: number
  quotaBytes: number
}): void {
  validateIdentifier(input.reservationId, "reservationId")
  validateObjectIdentity(input.repositoryId, input.path)
  validateBytes(input.bytes, "bytes")
  validateBytes(input.quotaBytes, "quotaBytes")
}

function validateObjectIdentity(repositoryId: string, path: string): void {
  validateIdentifier(repositoryId, "repositoryId")
  validateIdentifier(path, "path")
}

function validateIdentifier(value: string, field: string): void {
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RangeError(`Invalid ${field}`)
  }
}

function validateBytes(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`)
  }
}
