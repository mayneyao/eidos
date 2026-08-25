import { randomUUID } from "node:crypto"
import { chmodSync, mkdirSync, statSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import type {
  EidosPublicationBinding,
  EidosPublicationCollectorState,
  EidosPublicationSourceKind,
  EidosPublishCollectResult,
  EidosPublishRequest,
  EidosPublishResult,
} from "../../shared/contracts"

interface PublicationBindingRow {
  binding_id: string
  service_origin: string
  account_id: string
  space_id: string
  relative_path: string
  source_kind: EidosPublicationSourceKind
  form_view_id: string | null
  publication_id: string
  slug: string
  driver_id: EidosPublishResult["driverId"]
  current_version_id: string
  url: string
  access_mode: EidosPublishResult["accessMode"]
  source_sha256: string
  fingerprint_spec: EidosPublishResult["fingerprintSpec"] | null
  publish_fingerprint: string | null
  local_observation_json: string | null
  last_result_json: string | null
  published_at: string
  updated_at: string
  collector_id: string | null
  collector_generation: number | null
  last_attempted_at: string | null
  last_succeeded_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  imported_submissions: number | null
  replayed_submissions: number | null
}

export interface PublicationRegistryScope {
  serviceOrigin: string
  accountId: string
  spaceId: string
}

export interface PublicationFileObservation {
  bytes: string
  modifiedNs: string
  changedNs: string
  device: string
  inode: string
}

export interface PublicationAttachmentObservation extends PublicationFileObservation {
  path: string
}

export interface PublicationSourceObservation {
  spec: "eidos.publish/local-observation@1"
  source: PublicationFileObservation
  attachments: PublicationAttachmentObservation[]
  graftSnapshot?: {
    token: string
    contentFingerprint: string
  }
}

export interface StoredPublicationBinding extends EidosPublicationBinding {
  localObservation: PublicationSourceObservation | null
  lastResult: EidosPublishResult | null
}

const BINDING_SELECT = `
  SELECT binding.binding_id, binding.service_origin, binding.account_id,
         binding.space_id, binding.relative_path, binding.source_kind,
         binding.form_view_id, binding.publication_id, binding.slug,
         binding.driver_id, binding.current_version_id, binding.url,
         binding.access_mode, binding.source_sha256, binding.fingerprint_spec,
         binding.publish_fingerprint, binding.local_observation_json,
         binding.last_result_json, binding.published_at, binding.updated_at,
         collector.collector_id,
         collector.collector_generation, collector.last_attempted_at,
         collector.last_succeeded_at, collector.last_error_code,
         collector.last_error_message, collector.imported_submissions,
         collector.replayed_submissions
    FROM publication_binding AS binding
    LEFT JOIN publication_collector AS collector
      ON collector.binding_id = binding.binding_id`

function sourceKind(result: EidosPublishResult): EidosPublicationSourceKind {
  if (result.driverId === "org.eidos.driver.form") return "form"
  if (result.driverId === "org.eidos.driver.markdown") return "markdown"
  return "eidos-file"
}

function collectorState(
  row: PublicationBindingRow
): EidosPublicationCollectorState | null {
  if (
    row.collector_id === null &&
    row.last_attempted_at === null &&
    row.last_succeeded_at === null &&
    row.last_error_code === null
  ) {
    return null
  }
  return {
    collectorId: row.collector_id,
    collectorGeneration: row.collector_generation,
    lastAttemptedAt: row.last_attempted_at,
    lastSucceededAt: row.last_succeeded_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    importedSubmissions: row.imported_submissions ?? 0,
    replayedSubmissions: row.replayed_submissions ?? 0,
  }
}

function parsedJson<T>(value: string | null): T | null {
  if (value === null) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function bindingRecord(row: PublicationBindingRow): StoredPublicationBinding {
  const lastResult = parsedJson<EidosPublishResult>(row.last_result_json)
  return {
    bindingId: row.binding_id,
    serviceOrigin: row.service_origin,
    accountId: row.account_id,
    spaceId: row.space_id,
    relativePath: row.relative_path,
    sourceKind: row.source_kind,
    formViewId: row.form_view_id,
    publicationId: row.publication_id,
    slug: row.slug,
    driverId: row.driver_id,
    currentVersionId: row.current_version_id,
    url: row.url,
    accessMode: row.access_mode,
    showBranding: lastResult?.showBranding ?? true,
    formPolicy: lastResult?.formPolicy ?? null,
    sourceSha256: row.source_sha256,
    fingerprintSpec: row.fingerprint_spec,
    publishFingerprint: row.publish_fingerprint,
    contentStatus: "unknown",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    collector: collectorState(row),
    localObservation: parsedJson<PublicationSourceObservation>(
      row.local_observation_json
    ),
    lastResult,
  }
}

export class PublicationRegistry {
  private readonly database: DatabaseSync

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
    this.database = new DatabaseSync(filePath, {
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    })
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS publish_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS publication_binding (
        binding_id TEXT PRIMARY KEY,
        service_origin TEXT NOT NULL,
        account_id TEXT NOT NULL,
        space_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (
          source_kind IN ('eidos-file', 'markdown', 'form')
        ),
        form_view_id TEXT,
        publication_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        current_version_id TEXT NOT NULL,
        url TEXT NOT NULL,
        access_mode TEXT NOT NULL CHECK (
          access_mode IN ('public', 'password', 'private')
        ),
        source_sha256 TEXT NOT NULL,
        published_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (service_origin, account_id, publication_id)
      );
      CREATE INDEX IF NOT EXISTS idx_publication_binding_source
        ON publication_binding (
          service_origin, account_id, relative_path, source_kind, form_view_id
        );
      CREATE TABLE IF NOT EXISTS publication_collector (
        binding_id TEXT PRIMARY KEY REFERENCES publication_binding(binding_id)
          ON DELETE CASCADE,
        collector_id TEXT,
        collector_generation INTEGER CHECK (
          collector_generation IS NULL OR collector_generation >= 0
        ),
        last_attempted_at TEXT,
        last_succeeded_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        imported_submissions INTEGER NOT NULL DEFAULT 0 CHECK (
          imported_submissions >= 0
        ),
        replayed_submissions INTEGER NOT NULL DEFAULT 0 CHECK (
          replayed_submissions >= 0
        )
      );
      INSERT OR IGNORE INTO publish_schema_migrations (version, applied_at)
        VALUES (1, CURRENT_TIMESTAMP);
    `)
    const migration2 = this.database
      .prepare(
        "SELECT version FROM publish_schema_migrations WHERE version = 2"
      )
      .get()
    if (!migration2) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE publication_binding ADD COLUMN fingerprint_spec TEXT;
        ALTER TABLE publication_binding ADD COLUMN publish_fingerprint TEXT;
        ALTER TABLE publication_binding ADD COLUMN local_observation_json TEXT;
        ALTER TABLE publication_binding ADD COLUMN last_result_json TEXT;
        INSERT INTO publish_schema_migrations (version, applied_at)
          VALUES (2, CURRENT_TIMESTAMP);
        COMMIT;
      `)
    }
    try {
      if ((statSync(filePath).mode & 0o777) !== 0o600)
        chmodSync(filePath, 0o600)
    } catch {
      // Windows and some packaged filesystems do not expose POSIX modes.
    }
  }

  upsertPublished(
    scope: PublicationRegistryScope,
    request: EidosPublishRequest,
    result: EidosPublishResult,
    localObservation: PublicationSourceObservation | null = null
  ): StoredPublicationBinding {
    const now = new Date().toISOString()
    this.database
      .prepare(
        `INSERT INTO publication_binding (
           binding_id, service_origin, account_id, space_id, relative_path,
           source_kind, form_view_id, publication_id, slug, driver_id,
           current_version_id, url, access_mode, source_sha256,
           fingerprint_spec, publish_fingerprint, local_observation_json,
           last_result_json, published_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (service_origin, account_id, publication_id) DO UPDATE SET
           space_id = excluded.space_id,
           relative_path = excluded.relative_path,
           source_kind = excluded.source_kind,
           form_view_id = excluded.form_view_id,
           slug = excluded.slug,
           driver_id = excluded.driver_id,
           current_version_id = excluded.current_version_id,
           url = excluded.url,
           access_mode = excluded.access_mode,
           source_sha256 = excluded.source_sha256,
           fingerprint_spec = excluded.fingerprint_spec,
           publish_fingerprint = excluded.publish_fingerprint,
           local_observation_json = excluded.local_observation_json,
           last_result_json = excluded.last_result_json,
           updated_at = excluded.updated_at`
      )
      .run(
        randomUUID(),
        scope.serviceOrigin,
        scope.accountId,
        scope.spaceId,
        request.relativePath,
        sourceKind(result),
        request.formView ?? null,
        result.publicationId,
        result.publicationSlug,
        result.driverId,
        result.versionId,
        result.url,
        result.accessMode,
        result.sourceSha256,
        result.fingerprintSpec,
        result.publishFingerprint,
        localObservation === null ? null : JSON.stringify(localObservation),
        JSON.stringify(result),
        now,
        now
      )
    const binding = this.get(scope, result.publicationId)
    if (!binding) throw new Error("Published resource was not persisted")
    return binding
  }

  list(
    scope: PublicationRegistryScope,
    relativePath?: string
  ): StoredPublicationBinding[] {
    const where =
      relativePath === undefined
        ? " WHERE binding.service_origin = ? AND binding.account_id = ? AND binding.space_id = ?"
        : " WHERE binding.service_origin = ? AND binding.account_id = ? AND binding.space_id = ? AND binding.relative_path = ?"
    const order = " ORDER BY binding.updated_at DESC, binding.binding_id DESC"
    const statement = this.database.prepare(BINDING_SELECT + where + order)
    const rows = (relativePath === undefined
      ? statement.all(scope.serviceOrigin, scope.accountId, scope.spaceId)
      : statement.all(
          scope.serviceOrigin,
          scope.accountId,
          scope.spaceId,
          relativePath
        )) as unknown as PublicationBindingRow[]
    return rows.map(bindingRecord)
  }

  recordCollectionAttempt(
    scope: PublicationRegistryScope,
    publicationId: string
  ): void {
    const binding = this.requireBinding(scope, publicationId)
    this.database
      .prepare(
        `INSERT INTO publication_collector (binding_id, last_attempted_at)
         VALUES (?, ?)
         ON CONFLICT (binding_id) DO UPDATE SET
           last_attempted_at = excluded.last_attempted_at,
           last_error_code = NULL,
           last_error_message = NULL`
      )
      .run(binding.bindingId, new Date().toISOString())
  }

  recordCollectorOwnership(
    scope: PublicationRegistryScope,
    publicationId: string,
    collectorId: string,
    collectorGeneration: number
  ): void {
    const binding = this.requireBinding(scope, publicationId)
    this.database
      .prepare(
        `INSERT INTO publication_collector (
           binding_id, collector_id, collector_generation
         ) VALUES (?, ?, ?)
         ON CONFLICT (binding_id) DO UPDATE SET
           collector_id = excluded.collector_id,
           collector_generation = excluded.collector_generation,
           last_error_code = NULL,
           last_error_message = NULL`
      )
      .run(binding.bindingId, collectorId, collectorGeneration)
  }

  recordCollectionSuccess(
    scope: PublicationRegistryScope,
    result: EidosPublishCollectResult
  ): void {
    const binding = this.requireBinding(scope, result.publicationId)
    const now = new Date().toISOString()
    this.database
      .prepare(
        `INSERT INTO publication_collector (
           binding_id, collector_id, collector_generation, last_attempted_at,
           last_succeeded_at, imported_submissions, replayed_submissions
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (binding_id) DO UPDATE SET
           collector_id = excluded.collector_id,
           collector_generation = excluded.collector_generation,
           last_attempted_at = excluded.last_attempted_at,
           last_succeeded_at = excluded.last_succeeded_at,
           last_error_code = NULL,
           last_error_message = NULL,
           imported_submissions = publication_collector.imported_submissions + excluded.imported_submissions,
           replayed_submissions = publication_collector.replayed_submissions + excluded.replayed_submissions`
      )
      .run(
        binding.bindingId,
        result.collectorId,
        result.collectorGeneration,
        now,
        now,
        result.importedSubmissions,
        result.replayedSubmissions
      )
  }

  recordCollectionFailure(
    scope: PublicationRegistryScope,
    publicationId: string,
    code: string,
    message: string
  ): void {
    const binding = this.requireBinding(scope, publicationId)
    this.database
      .prepare(
        `INSERT INTO publication_collector (
           binding_id, last_attempted_at, last_error_code, last_error_message
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT (binding_id) DO UPDATE SET
           last_attempted_at = excluded.last_attempted_at,
           last_error_code = excluded.last_error_code,
           last_error_message = excluded.last_error_message`
      )
      .run(
        binding.bindingId,
        new Date().toISOString(),
        code.slice(0, 128),
        message.slice(0, 2_048)
      )
  }

  remapSourcePaths(spaceId: string, source: string, target: string): void {
    const sourcePrefix = `${source}/`
    const rows = this.database
      .prepare(
        `SELECT binding_id, relative_path
           FROM publication_binding
          WHERE space_id = ?
            AND (relative_path = ? OR substr(relative_path, 1, length(?)) = ?)`
      )
      .all(spaceId, source, sourcePrefix, sourcePrefix) as unknown as Array<{
      binding_id: string
      relative_path: string
    }>
    if (rows.length === 0) return
    const update = this.database.prepare(
      `UPDATE publication_binding
          SET relative_path = ?, updated_at = ?
        WHERE binding_id = ?`
    )
    this.database.exec("BEGIN IMMEDIATE")
    try {
      const now = new Date().toISOString()
      for (const row of rows) {
        const suffix = row.relative_path.slice(source.length)
        update.run(`${target}${suffix}`, now, row.binding_id)
      }
      this.database.exec("COMMIT")
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  close(): void {
    this.database.close()
  }

  private get(
    scope: PublicationRegistryScope,
    publicationId: string
  ): StoredPublicationBinding | null {
    const row = this.database
      .prepare(
        BINDING_SELECT +
          ` WHERE binding.service_origin = ? AND binding.account_id = ?
              AND binding.space_id = ? AND binding.publication_id = ?`
      )
      .get(
        scope.serviceOrigin,
        scope.accountId,
        scope.spaceId,
        publicationId
      ) as unknown as PublicationBindingRow | undefined
    return row ? bindingRecord(row) : null
  }

  private requireBinding(
    scope: PublicationRegistryScope,
    publicationId: string
  ): StoredPublicationBinding {
    const binding = this.get(scope, publicationId)
    if (!binding)
      throw new Error("Published resource is not bound to this Space")
    return binding
  }
}
