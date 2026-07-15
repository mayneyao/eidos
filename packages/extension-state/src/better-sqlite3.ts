import { chmodSync, closeSync, lstatSync, mkdirSync, openSync } from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

import {
  assertLegacyExtensionMappingInput,
  assertExtensionPermissionGrant,
  assertExtensionSnapshotIdentity,
  EXTENSION_STATE_FORMAT_VERSION,
  extensionPermissionGrantKey,
  normalizeExtensionPermissionGrants,
  type ExtensionLocalState,
  type ExtensionMigrationStateStore,
  type ExtensionPermissionGrant,
  type ExtensionPermissionGrantKind,
  type ExtensionSnapshotIdentity,
  type ExtensionStateStore,
  type LegacyExtensionCandidateContribution,
  type LegacyExtensionMapping,
  type LegacyExtensionMappingConflict,
  type LegacyExtensionMappingInput,
} from "./index"

const APPLICATION_ID = 0x45455854 // EEXT

interface TrustRow {
  requested_grants_json: string
  trusted_at: number
}

interface EnablementRow {
  enabled: number
  updated_at: number
}

interface GrantRow {
  kind: ExtensionPermissionGrantKind
  value: string
}

interface LegacyMappingRow {
  legacy_extension_id: string
  legacy_slug: string | null
  canonical_package_id: string
  archive_digest: string
  candidate_contribution: LegacyExtensionCandidateContribution
  active: number
  created_at: number
  updated_at: number
  retired_at: number | null
}

function snapshotSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS trusted_snapshots (
      package_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      permission_hash TEXT NOT NULL,
      requested_grants_json TEXT NOT NULL,
      trusted_at INTEGER NOT NULL,
      PRIMARY KEY (package_id, content_digest, permission_hash)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS snapshot_enablements (
      package_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      permission_hash TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (package_id, content_digest, permission_hash),
      FOREIGN KEY (package_id, content_digest, permission_hash)
        REFERENCES trusted_snapshots(package_id, content_digest, permission_hash)
        ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS permission_grants (
      package_id TEXT NOT NULL,
      content_digest TEXT NOT NULL,
      permission_hash TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('files.read', 'files.write', 'network')),
      value TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (package_id, content_digest, permission_hash, kind, value),
      FOREIGN KEY (package_id, content_digest, permission_hash)
        REFERENCES trusted_snapshots(package_id, content_digest, permission_hash)
        ON DELETE CASCADE
    ) WITHOUT ROWID;
  `
}

function migrationSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS legacy_extension_mappings (
      legacy_extension_id TEXT NOT NULL,
      legacy_slug TEXT,
      canonical_package_id TEXT NOT NULL,
      archive_digest TEXT NOT NULL,
      candidate_contribution TEXT NOT NULL
        CHECK (candidate_contribution IN ('command', 'file-editor')),
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      retired_at INTEGER,
      CHECK (
        (active = 1 AND retired_at IS NULL) OR
        (active = 0 AND retired_at IS NOT NULL)
      ),
      PRIMARY KEY (legacy_extension_id, canonical_package_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS legacy_extension_mappings_by_source
      ON legacy_extension_mappings (legacy_extension_id, active);
    CREATE INDEX IF NOT EXISTS legacy_extension_mappings_by_package
      ON legacy_extension_mappings (canonical_package_id, active);
  `
}

function canonicalGrantsJson(
  grants: readonly ExtensionPermissionGrant[]
): string {
  return JSON.stringify(normalizeExtensionPermissionGrants(grants))
}

function parseGrantsJson(value: string): ExtensionPermissionGrant[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) {
    throw new Error("Extension trust state contains invalid requested grants")
  }
  return normalizeExtensionPermissionGrants(
    parsed.map((grant) => {
      if (!grant || typeof grant !== "object") {
        throw new Error("Extension trust state contains an invalid grant")
      }
      const candidate = grant as { kind?: unknown; value?: unknown }
      const normalized = {
        kind: candidate.kind as ExtensionPermissionGrantKind,
        value: candidate.value as string,
      }
      assertExtensionPermissionGrant(normalized)
      return normalized
    })
  )
}

function ensurePrivateDatabaseFile(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  try {
    const descriptor = openSync(filePath, "wx", 0o600)
    closeSync(descriptor)
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EEXIST"
      )
    ) {
      throw error
    }
  }
  const stats = lstatSync(filePath)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("Extension state path must be a regular file")
  }
  chmodSync(filePath, 0o600)
}

export class BetterSqlite3ExtensionStateStore
  implements ExtensionStateStore, ExtensionMigrationStateStore
{
  private readonly database: Database.Database

  constructor(readonly filePath: string) {
    ensurePrivateDatabaseFile(filePath)
    this.database = new Database(filePath)
    try {
      this.database.pragma("foreign_keys = ON")
      this.database.pragma("busy_timeout = 5000")
      const applicationId = this.database.pragma("application_id", {
        simple: true,
      }) as number
      const userVersion = this.database.pragma("user_version", {
        simple: true,
      }) as number
      const tableCount = (
        this.database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'"
          )
          .get() as { count: number }
      ).count
      if (applicationId !== 0 && applicationId !== APPLICATION_ID) {
        throw new Error(
          "The extension state path contains an unrelated database"
        )
      }
      if (applicationId === 0 && (tableCount > 0 || userVersion !== 0)) {
        throw new Error("The extension state path contains an unrelated schema")
      }
      if (
        applicationId === APPLICATION_ID &&
        userVersion !== 1 &&
        userVersion !== EXTENSION_STATE_FORMAT_VERSION
      ) {
        throw new Error(
          `Unsupported extension state schema version: ${userVersion}`
        )
      }
      this.database.pragma("journal_mode = DELETE")
      this.database.pragma("synchronous = FULL")
      this.database.transaction(() => {
        this.database.exec(snapshotSchemaSql())
        this.database.exec(migrationSchemaSql())
        this.database.pragma(`application_id = ${APPLICATION_ID}`)
        this.database.pragma(`user_version = ${EXTENSION_STATE_FORMAT_VERSION}`)
      })()
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  get(snapshot: ExtensionSnapshotIdentity): ExtensionLocalState {
    assertExtensionSnapshotIdentity(snapshot)
    const keys = this.snapshotKeys(snapshot)
    const trust = this.database
      .prepare(
        `SELECT requested_grants_json, trusted_at
         FROM trusted_snapshots
         WHERE package_id = ? AND content_digest = ? AND permission_hash = ?`
      )
      .get(...keys) as TrustRow | undefined
    if (!trust) return this.emptyState(snapshot)

    const enablement = this.database
      .prepare(
        `SELECT enabled, updated_at
         FROM snapshot_enablements
         WHERE package_id = ? AND content_digest = ? AND permission_hash = ?`
      )
      .get(...keys) as EnablementRow | undefined
    const granted = this.database
      .prepare(
        `SELECT kind, value
         FROM permission_grants
         WHERE package_id = ? AND content_digest = ? AND permission_hash = ?
         ORDER BY kind, value`
      )
      .all(...keys) as GrantRow[]

    return {
      snapshot: { ...snapshot },
      trusted: true,
      enabled: enablement?.enabled === 1,
      requestedGrants: parseGrantsJson(trust.requested_grants_json),
      granted: normalizeExtensionPermissionGrants(granted),
      trustedAt: trust.trusted_at,
      enablementUpdatedAt: enablement?.updated_at,
    }
  }

  trust(
    snapshot: ExtensionSnapshotIdentity,
    requestedGrants: readonly ExtensionPermissionGrant[],
    now = Date.now()
  ): ExtensionLocalState {
    assertExtensionSnapshotIdentity(snapshot)
    const requestedGrantsJson = canonicalGrantsJson(requestedGrants)
    const keys = this.snapshotKeys(snapshot)
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO trusted_snapshots (
             package_id, content_digest, permission_hash,
             requested_grants_json, trusted_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(package_id, content_digest, permission_hash) DO NOTHING`
        )
        .run(...keys, requestedGrantsJson, now)
      const stored = this.database
        .prepare(
          `SELECT requested_grants_json
           FROM trusted_snapshots
           WHERE package_id = ? AND content_digest = ? AND permission_hash = ?`
        )
        .get(...keys) as Pick<TrustRow, "requested_grants_json">
      if (stored.requested_grants_json !== requestedGrantsJson) {
        throw new Error("Requested grants do not match the trusted snapshot")
      }
      this.database
        .prepare(
          `INSERT INTO snapshot_enablements (
             package_id, content_digest, permission_hash, enabled, updated_at
           ) VALUES (?, ?, ?, 0, ?)
           ON CONFLICT(package_id, content_digest, permission_hash) DO NOTHING`
        )
        .run(...keys, now)
    })()
    return this.get(snapshot)
  }

  revokeTrust(snapshot: ExtensionSnapshotIdentity): ExtensionLocalState {
    assertExtensionSnapshotIdentity(snapshot)
    this.database
      .prepare(
        `DELETE FROM trusted_snapshots
         WHERE package_id = ? AND content_digest = ? AND permission_hash = ?`
      )
      .run(...this.snapshotKeys(snapshot))
    return this.emptyState(snapshot)
  }

  setEnabled(
    snapshot: ExtensionSnapshotIdentity,
    enabled: boolean,
    now = Date.now()
  ): ExtensionLocalState {
    assertExtensionSnapshotIdentity(snapshot)
    if (typeof enabled !== "boolean") {
      throw new Error("Extension enablement must be a boolean")
    }
    const result = this.database
      .prepare(
        `UPDATE snapshot_enablements
         SET enabled = ?, updated_at = ?
         WHERE package_id = ? AND content_digest = ? AND permission_hash = ?`
      )
      .run(enabled ? 1 : 0, now, ...this.snapshotKeys(snapshot))
    if (result.changes !== 1) {
      throw new Error("Extension snapshot must be trusted before enablement")
    }
    return this.get(snapshot)
  }

  setGrant(
    snapshot: ExtensionSnapshotIdentity,
    grant: ExtensionPermissionGrant,
    granted: boolean,
    now = Date.now()
  ): ExtensionLocalState {
    assertExtensionSnapshotIdentity(snapshot)
    assertExtensionPermissionGrant(grant)
    if (typeof granted !== "boolean") {
      throw new Error("Extension grant state must be a boolean")
    }
    const current = this.get(snapshot)
    if (!current.trusted) {
      throw new Error(
        "Extension snapshot must be trusted before granting access"
      )
    }
    const requested = new Set(
      current.requestedGrants.map(extensionPermissionGrantKey)
    )
    if (!requested.has(extensionPermissionGrantKey(grant))) {
      throw new Error("Cannot grant a capability the extension did not request")
    }
    const keys = this.snapshotKeys(snapshot)
    if (granted) {
      this.database
        .prepare(
          `INSERT INTO permission_grants (
             package_id, content_digest, permission_hash,
             kind, value, granted_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(package_id, content_digest, permission_hash, kind, value)
           DO UPDATE SET granted_at = excluded.granted_at`
        )
        .run(...keys, grant.kind, grant.value, now)
    } else {
      this.database
        .prepare(
          `DELETE FROM permission_grants
           WHERE package_id = ? AND content_digest = ? AND permission_hash = ?
             AND kind = ? AND value = ?`
        )
        .run(...keys, grant.kind, grant.value)
    }
    return this.get(snapshot)
  }

  recordLegacyExtensionMapping(
    mapping: LegacyExtensionMappingInput,
    now = Date.now()
  ): LegacyExtensionMapping {
    assertLegacyExtensionMappingInput(mapping)
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error("Legacy extension mapping time is invalid")
    }
    this.database
      .prepare(
        `INSERT INTO legacy_extension_mappings (
           legacy_extension_id, legacy_slug, canonical_package_id,
           archive_digest, candidate_contribution, active,
           created_at, updated_at, retired_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)
         ON CONFLICT(legacy_extension_id, canonical_package_id) DO UPDATE SET
           legacy_slug = excluded.legacy_slug,
           archive_digest = excluded.archive_digest,
           candidate_contribution = excluded.candidate_contribution,
           updated_at = excluded.updated_at`
      )
      .run(
        mapping.legacyExtensionId,
        mapping.legacySlug ?? null,
        mapping.canonicalPackageId,
        mapping.archiveDigest,
        mapping.candidateContribution,
        now,
        now
      )
    return this.requireLegacyExtensionMapping(
      mapping.legacyExtensionId,
      mapping.canonicalPackageId
    )
  }

  listLegacyExtensionMappings(
    options: { includeRetired?: boolean } = {}
  ): LegacyExtensionMapping[] {
    const rows = this.database
      .prepare(
        `SELECT legacy_extension_id, legacy_slug, canonical_package_id,
                archive_digest, candidate_contribution, active,
                created_at, updated_at, retired_at
         FROM legacy_extension_mappings
         ${options.includeRetired ? "" : "WHERE active = 1"}
         ORDER BY canonical_package_id, legacy_extension_id`
      )
      .all() as LegacyMappingRow[]
    const activeRows = this.database
      .prepare(
        `SELECT legacy_extension_id, legacy_slug, canonical_package_id,
                archive_digest, candidate_contribution, active,
                created_at, updated_at, retired_at
         FROM legacy_extension_mappings
         WHERE active = 1`
      )
      .all() as LegacyMappingRow[]
    return rows.map((row) => this.toLegacyExtensionMapping(row, activeRows))
  }

  setLegacyExtensionMappingActive(
    legacyExtensionId: string,
    canonicalPackageId: string,
    active: boolean,
    now = Date.now()
  ): LegacyExtensionMapping {
    if (typeof active !== "boolean") {
      throw new Error("Legacy extension mapping active state must be boolean")
    }
    const current = this.requireLegacyExtensionMapping(
      legacyExtensionId,
      canonicalPackageId
    )
    assertLegacyExtensionMappingInput(current)
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new Error("Legacy extension mapping time is invalid")
    }
    this.database
      .prepare(
        `UPDATE legacy_extension_mappings
         SET active = ?, updated_at = ?, retired_at = ?
         WHERE legacy_extension_id = ? AND canonical_package_id = ?`
      )
      .run(
        active ? 1 : 0,
        now,
        active ? null : now,
        legacyExtensionId,
        canonicalPackageId
      )
    return this.requireLegacyExtensionMapping(
      legacyExtensionId,
      canonicalPackageId
    )
  }

  close(): void {
    this.database.close()
  }

  private emptyState(snapshot: ExtensionSnapshotIdentity): ExtensionLocalState {
    return {
      snapshot: { ...snapshot },
      trusted: false,
      enabled: false,
      requestedGrants: [],
      granted: [],
    }
  }

  private requireLegacyExtensionMapping(
    legacyExtensionId: string,
    canonicalPackageId: string
  ): LegacyExtensionMapping {
    const row = this.database
      .prepare(
        `SELECT legacy_extension_id, legacy_slug, canonical_package_id,
                archive_digest, candidate_contribution, active,
                created_at, updated_at, retired_at
         FROM legacy_extension_mappings
         WHERE legacy_extension_id = ? AND canonical_package_id = ?`
      )
      .get(legacyExtensionId, canonicalPackageId) as
      | LegacyMappingRow
      | undefined
    if (!row) throw new Error("Legacy extension mapping does not exist")
    const activeRows = this.database
      .prepare(
        `SELECT legacy_extension_id, legacy_slug, canonical_package_id,
                archive_digest, candidate_contribution, active,
                created_at, updated_at, retired_at
         FROM legacy_extension_mappings
         WHERE active = 1`
      )
      .all() as LegacyMappingRow[]
    return this.toLegacyExtensionMapping(row, activeRows)
  }

  private toLegacyExtensionMapping(
    row: LegacyMappingRow,
    activeRows: readonly LegacyMappingRow[]
  ): LegacyExtensionMapping {
    const conflictingCanonicalPackageIds = row.active
      ? [
          ...new Set(
            activeRows
              .filter(
                (candidate) =>
                  candidate.legacy_extension_id === row.legacy_extension_id &&
                  candidate.canonical_package_id !== row.canonical_package_id
              )
              .map((candidate) => candidate.canonical_package_id)
          ),
        ].sort()
      : []
    const conflictingLegacyExtensionIds = row.active
      ? [
          ...new Set(
            activeRows
              .filter(
                (candidate) =>
                  candidate.canonical_package_id === row.canonical_package_id &&
                  candidate.legacy_extension_id !== row.legacy_extension_id
              )
              .map((candidate) => candidate.legacy_extension_id)
          ),
        ].sort()
      : []
    const sourceConflict = conflictingCanonicalPackageIds.length > 0
    const packageConflict = conflictingLegacyExtensionIds.length > 0
    const conflict: LegacyExtensionMappingConflict =
      sourceConflict && packageConflict
        ? "legacy-source-and-canonical-package"
        : sourceConflict
          ? "legacy-source"
          : packageConflict
            ? "canonical-package"
            : "none"
    return {
      legacyExtensionId: row.legacy_extension_id,
      legacySlug: row.legacy_slug ?? undefined,
      canonicalPackageId: row.canonical_package_id,
      archiveDigest: row.archive_digest,
      candidateContribution: row.candidate_contribution,
      active: row.active === 1,
      conflict,
      conflictingLegacyExtensionIds,
      conflictingCanonicalPackageIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      retiredAt: row.retired_at ?? undefined,
    }
  }

  private snapshotKeys(
    snapshot: ExtensionSnapshotIdentity
  ): [string, string, string] {
    return [snapshot.packageId, snapshot.contentDigest, snapshot.permissionHash]
  }
}
