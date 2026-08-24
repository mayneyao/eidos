import { DurableObject } from "cloudflare:workers"

import type {
  ActivationResult,
  ContentObjectRecord,
  DurableResult,
  FormPublicationPolicy,
  MultipartPartRecord,
  MultipartUploadSession,
  PublicationRecord,
  PublicationVersionRecord,
  PublishedAssetRecord,
  PublishedFileRecord,
  PublishAccessGrant,
  ReadyReceipt,
  ServingTarget,
  SourceBundleFile,
  SourceObjectUpload,
  StaticArtifactRecord,
  VersionUploadPlan,
  ValidatedSourceBundle,
  ValidationReceipt,
  VersionDeletionPlan,
  UsagePeriodRecord,
  VersionFailureEvent,
  VersionLifecycleEvent,
} from "./contracts"
import { contentObjectKey, sourceManifestObjectKey } from "./bundle"
import {
  createPublicationPasswordVerifier,
  verifyPublicationPassword,
  type PublicationPasswordVerifier,
} from "./passwords"

const PUBLIC_SITE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"

interface SiteClaimRow extends Record<string, SqlStorageValue> {
  owner_user_id: string
}

interface HandleClaimRow extends Record<string, SqlStorageValue> {
  handle_label: string
  owner_public_site_id: string
  status: "pending" | "active" | "tombstoned"
  claim_id: string
  expires_at: string
}

interface LocatorRow extends Record<string, SqlStorageValue> {
  owner_user_id: string
  public_site_id: string
}

interface TenantRow extends LocatorRow {
  plan: "free" | "pro"
  status: "active" | "blocked"
  active_handle: string | null
  access_json: string
  access_revision: number
  access_checked_at: string
}

interface PublicationRow extends Record<string, SqlStorageValue> {
  publication_id: string
  slug: string
  visibility: "public" | "private"
  current_version_id: string | null
  created_at: string
}

interface PublicationAccessRow extends Record<string, SqlStorageValue> {
  publication_id: string
  mode: "public" | "password" | "private"
  credential_revision: number
  password_algorithm: string | null
  password_iterations: number | null
  password_salt: string | null
  password_hash: string | null
  updated_at: string
}

interface PublicationFormPolicyRow extends Record<string, SqlStorageValue> {
  publication_id: string
  respondent_access: "anyone" | "signed_in"
  allow_multiple_responses: number
  policy_revision: number
  updated_at: string
}

interface PublicationBrandingRow extends Record<string, SqlStorageValue> {
  publication_id: string
  show_branding: number
  updated_at: string
}

interface PasswordAttemptRow extends Record<string, SqlStorageValue> {
  failure_count: number
}

interface VersionRow extends Record<string, SqlStorageValue> {
  version_id: string
  publication_id: string
  state: PublicationVersionRecord["state"]
  job_id: string
  activate_on_ready: number
  source_manifest_key: string
  source_manifest_sha256: string
  source_bytes: string
  entrypoint_json: string
  entrypoint_object_key: string
  driver_id: string
  driver_version: string
  serving_target_json: string | null
  serving_target_sha256: string | null
  validation_receipt_json: string | null
  ready_receipt_json: string | null
  target_health: "pending" | "healthy" | "unhealthy"
  target_health_reason: string | null
  failure_step: string | null
  failure_code: string | null
  created_at: string
}

interface VersionDeactivationRow extends Record<string, SqlStorageValue> {
  version_id: string
  deactivated_at: string
}

interface PreviousVersionRow extends Record<string, SqlStorageValue> {
  from_version_id: string | null
}

interface IdempotencyRow extends Record<string, SqlStorageValue> {
  operation: string
  input_sha256: string
  result_json: string
}

interface CountRow extends Record<string, SqlStorageValue> {
  count: number
}

interface ActivationRow extends Record<string, SqlStorageValue> {
  publication_id: string
  from_version_id: string | null
  to_version_id: string
  request_id: string
  activated_at: string
}

interface MultipartSessionRow extends Record<string, SqlStorageValue> {
  session_id: string
  version_id: string
  sha256: string
  object_key: string
  upload_id: string
  state: "uploading" | "completed" | "aborted"
}

interface ContentObjectRow extends Record<string, SqlStorageValue> {
  sha256: string
  bytes: string
  media_type: string
  object_key: string
  state: "pending" | "ready"
  reference_count: number
}

interface VersionFileRow extends Record<string, SqlStorageValue> {
  version_id: string
  path: string
  role: "entrypoint" | "attachment"
  media_type: string
  bytes: string
  sha256: string
}

interface PublishedFileRow extends Record<string, SqlStorageValue> {
  path: string
  sha256: string
  bytes: string
  media_type: string
  object_key: string
}

interface AssetReferenceRow extends Record<string, SqlStorageValue> {
  reference_kind: "eidos-file-entry" | "markdown-link"
  reference_key: string
  uri: string
  sha256: string
  bytes: string
  media_type: string
  object_key: string
}

interface VersionArtifactRow extends Record<string, SqlStorageValue> {
  version_id: string
  path: string
  bytes: string
  sha256: string
  media_type: string
  object_key: string
  state: "pending" | "ready"
}

interface MultipartPartRow extends Record<string, SqlStorageValue> {
  session_id: string
  part_number: number
  bytes: string
  sha256: string
  etag: string | null
}

interface UsagePeriodRow extends Record<string, SqlStorageValue> {
  period: string
  source_bytes: string
  artifact_bytes: string
  runtime_active_seconds: string
  runtime_starts: number
  builds: number
  requests: number
  reconciled_at: string
}

interface RateWindowRow extends Record<string, SqlStorageValue> {
  request_count: number
}

interface RuntimeLeaseRow extends Record<string, SqlStorageValue> {
  expires_at: string
}

interface RuntimeRequestLeaseRow extends Record<string, SqlStorageValue> {
  lease_id: string
}

interface CircuitRow extends Record<string, SqlStorageValue> {
  consecutive_failures: number
  first_failure_at: string
  opened_until: string | null
}

interface TenantHandleClaimRow extends Record<string, SqlStorageValue> {
  claim_id: string
  status: "pending" | "active"
  expires_at: string
}

interface FailureEventRow extends Record<string, SqlStorageValue> {
  job_id: string
  version_id: string
  attempt: number
  step: string
  code: string
  retryable: number
  failed_at: string
}

interface LifecycleEventRow extends Record<string, SqlStorageValue> {
  version_id: string
  event_type: "deletion_started" | "deletion_completed"
  actor: string
  request_id: string
  reason: "user" | "retention"
  occurred_at: string
}

export class PublicSiteClaimDurableObject extends DurableObject<Env> {
  private readonly ready: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS publish_schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public_site_claim (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner_user_id TEXT NOT NULL,
          claimed_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO publish_schema_migrations (version, applied_at)
        VALUES (1, datetime('now'));
      `)
    })
  }

  async claim(userId: string): Promise<boolean> {
    await this.ready
    const existing = this.ctx.storage.sql
      .exec<SiteClaimRow>(
        "SELECT owner_user_id FROM public_site_claim WHERE singleton = 1"
      )
      .toArray()[0]
    if (existing !== undefined) return existing.owner_user_id === userId
    this.ctx.storage.sql.exec(
      "INSERT INTO public_site_claim (singleton, owner_user_id, claimed_at) VALUES (1, ?, ?)",
      userId,
      new Date().toISOString()
    )
    return true
  }
}

export class PublishHandleDurableObject extends DurableObject<Env> {
  private readonly ready: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS publish_schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS handle_claim (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          handle_label TEXT NOT NULL,
          owner_public_site_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'tombstoned')),
          claim_id TEXT NOT NULL,
          claimed_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          activated_at TEXT
        );
        INSERT OR IGNORE INTO publish_schema_migrations (version, applied_at)
        VALUES (1, datetime('now'));
      `)
    })
  }

  async beginClaim(
    handle: string,
    publicSiteId: string,
    now = new Date().toISOString()
  ): Promise<{ claimId: string; expiresAt: string } | null> {
    await this.ready
    const existing = this.ctx.storage.sql
      .exec<HandleClaimRow>(
        `SELECT handle_label, owner_public_site_id, status, claim_id, expires_at
           FROM handle_claim WHERE singleton = 1`
      )
      .toArray()[0]
    if (existing !== undefined) {
      if (existing.status === "active" || existing.status === "tombstoned") {
        return existing.owner_public_site_id === publicSiteId
          ? { claimId: existing.claim_id, expiresAt: existing.expires_at }
          : null
      }
      if (
        existing.owner_public_site_id === publicSiteId &&
        existing.expires_at > now
      ) {
        return { claimId: existing.claim_id, expiresAt: existing.expires_at }
      }
      if (existing.expires_at > now) return null
    }
    const claimId = crypto.randomUUID()
    const expiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString()
    this.ctx.storage.sql.exec(
      `INSERT INTO handle_claim (
         singleton, handle_label, owner_public_site_id, status, claim_id,
         claimed_at, expires_at, activated_at
       ) VALUES (1, ?, ?, 'pending', ?, ?, ?, NULL)
       ON CONFLICT (singleton) DO UPDATE SET
         handle_label = excluded.handle_label,
         owner_public_site_id = excluded.owner_public_site_id,
         status = 'pending',
         claim_id = excluded.claim_id,
         claimed_at = excluded.claimed_at,
         expires_at = excluded.expires_at,
         activated_at = NULL`,
      handle,
      publicSiteId,
      claimId,
      now,
      expiresAt
    )
    return { claimId, expiresAt }
  }

  async activate(publicSiteId: string, claimId: string): Promise<boolean> {
    await this.ready
    const existing = this.ctx.storage.sql
      .exec<HandleClaimRow>(
        `SELECT handle_label, owner_public_site_id, status, claim_id, expires_at
           FROM handle_claim WHERE singleton = 1`
      )
      .toArray()[0]
    if (
      existing === undefined ||
      existing.owner_public_site_id !== publicSiteId ||
      existing.claim_id !== claimId ||
      existing.status === "tombstoned"
    ) {
      return false
    }
    if (existing.status === "active") return true
    if (existing.expires_at <= new Date().toISOString()) return false
    this.ctx.storage.sql.exec(
      "UPDATE handle_claim SET status = 'active', activated_at = ? WHERE singleton = 1",
      new Date().toISOString()
    )
    return true
  }

  async resolve(): Promise<string | null> {
    await this.ready
    const existing = this.ctx.storage.sql
      .exec<HandleClaimRow>(
        `SELECT handle_label, owner_public_site_id, status, claim_id, expires_at
           FROM handle_claim WHERE singleton = 1`
      )
      .toArray()[0]
    if (existing?.status !== "active") return null
    const tenant = this.env.PUBLISH_TENANTS.getByName(
      existing.owner_public_site_id
    )
    return (await tenant.hasActivatedHandleClaim(
      existing.handle_label,
      existing.claim_id
    ))
      ? existing.owner_public_site_id
      : null
  }
}

export class TenantLocatorDurableObject extends DurableObject<Env> {
  private readonly ready: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS publish_schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tenant_locator (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner_user_id TEXT NOT NULL,
          public_site_id TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO publish_schema_migrations (version, applied_at)
        VALUES (1, datetime('now'));
      `)
    })
  }

  async getOrCreate(userId: string): Promise<string> {
    await this.ready
    const existing = this.ctx.storage.sql
      .exec<LocatorRow>(
        "SELECT owner_user_id, public_site_id FROM tenant_locator WHERE singleton = 1"
      )
      .toArray()[0]
    if (existing !== undefined) {
      if (existing.owner_user_id !== userId)
        throw new Error("tenant locator owner mismatch")
      return existing.public_site_id
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = randomPublicSiteId()
      if (
        !(await this.env.PUBLIC_SITE_CLAIMS.getByName(candidate).claim(userId))
      )
        continue
      this.ctx.storage.sql.exec(
        `INSERT INTO tenant_locator (singleton, owner_user_id, public_site_id, created_at)
         VALUES (1, ?, ?, ?)`,
        userId,
        candidate,
        new Date().toISOString()
      )
      return candidate
    }
    throw new Error("could not allocate a unique Public Site ID")
  }
}

export class PublishTenant extends DurableObject<Env> {
  private readonly ready: Promise<void>
  private readonly bindings: Env

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.bindings = env
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS publish_schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tenant (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner_user_id TEXT NOT NULL,
          public_site_id TEXT NOT NULL UNIQUE,
          plan TEXT NOT NULL CHECK (plan IN ('free', 'pro')),
          status TEXT NOT NULL CHECK (status IN ('active', 'blocked')),
          active_handle TEXT,
          access_json TEXT NOT NULL,
          access_revision INTEGER NOT NULL,
          access_checked_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS publication (
          publication_id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
          current_version_id TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS publication_access (
          publication_id TEXT PRIMARY KEY REFERENCES publication(publication_id) ON DELETE RESTRICT,
          mode TEXT NOT NULL CHECK (mode IN ('public', 'password', 'private')),
          credential_revision INTEGER NOT NULL DEFAULT 0 CHECK (credential_revision >= 0),
          password_algorithm TEXT,
          password_iterations INTEGER,
          password_salt TEXT,
          password_hash TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS publication_password_attempt (
          publication_id TEXT NOT NULL REFERENCES publication(publication_id) ON DELETE RESTRICT,
          client_hash TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          failure_count INTEGER NOT NULL CHECK (failure_count >= 0),
          PRIMARY KEY (publication_id, client_hash, window_start)
        );
        CREATE INDEX IF NOT EXISTS idx_publication_password_attempt_window
          ON publication_password_attempt (window_start);
        CREATE TABLE IF NOT EXISTS publication_form_policy (
          publication_id TEXT PRIMARY KEY REFERENCES publication(publication_id) ON DELETE RESTRICT,
          respondent_access TEXT NOT NULL CHECK (respondent_access IN ('anyone', 'signed_in')),
          allow_multiple_responses INTEGER NOT NULL CHECK (allow_multiple_responses IN (0, 1)),
          policy_revision INTEGER NOT NULL DEFAULT 0 CHECK (policy_revision >= 0),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS publication_branding (
          publication_id TEXT PRIMARY KEY REFERENCES publication(publication_id) ON DELETE RESTRICT,
          show_branding INTEGER NOT NULL CHECK (show_branding IN (0, 1)),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tenant_handle_claim (
          handle_label TEXT PRIMARY KEY,
          claim_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
          expires_at TEXT NOT NULL,
          activated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS publication_version (
          version_id TEXT PRIMARY KEY,
          publication_id TEXT NOT NULL REFERENCES publication(publication_id) ON DELETE RESTRICT,
          state TEXT NOT NULL CHECK (state IN (
            'created', 'uploading', 'uploaded', 'validating', 'preparing',
            'ready', 'failed', 'deleting', 'deleted'
          )),
          job_id TEXT NOT NULL UNIQUE,
          activate_on_ready INTEGER NOT NULL CHECK (activate_on_ready IN (0, 1)),
          source_manifest_key TEXT NOT NULL UNIQUE,
          source_manifest_sha256 TEXT NOT NULL,
          source_bytes TEXT NOT NULL,
          entrypoint_json TEXT NOT NULL,
          entrypoint_object_key TEXT NOT NULL,
          driver_id TEXT NOT NULL,
          driver_version TEXT NOT NULL,
          serving_target_json TEXT,
          serving_target_sha256 TEXT,
          validation_receipt_json TEXT,
          ready_receipt_json TEXT,
          target_health TEXT NOT NULL DEFAULT 'pending'
            CHECK (target_health IN ('pending', 'healthy', 'unhealthy')),
          target_health_reason TEXT,
          failure_step TEXT,
          failure_code TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activation_event (
          event_id TEXT PRIMARY KEY,
          publication_id TEXT NOT NULL,
          from_version_id TEXT,
          to_version_id TEXT NOT NULL,
          actor TEXT NOT NULL,
          request_id TEXT NOT NULL,
          activated_at TEXT NOT NULL,
          UNIQUE (publication_id, request_id)
        );
        CREATE TABLE IF NOT EXISTS version_failure_event (
          failure_id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          version_id TEXT NOT NULL REFERENCES publication_version(version_id) ON DELETE RESTRICT,
          attempt INTEGER NOT NULL CHECK (attempt > 0),
          step TEXT NOT NULL,
          code TEXT NOT NULL,
          retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
          failed_at TEXT NOT NULL,
          UNIQUE (version_id, attempt)
        );
        CREATE TABLE IF NOT EXISTS version_lifecycle_event (
          event_id TEXT PRIMARY KEY,
          version_id TEXT NOT NULL REFERENCES publication_version(version_id) ON DELETE RESTRICT,
          event_type TEXT NOT NULL CHECK (event_type IN ('deletion_started', 'deletion_completed')),
          actor TEXT NOT NULL,
          request_id TEXT NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('user', 'retention')),
          occurred_at TEXT NOT NULL,
          UNIQUE (version_id, event_type, request_id)
        );
        CREATE TABLE IF NOT EXISTS idempotency_record (
          idempotency_key TEXT PRIMARY KEY,
          operation TEXT NOT NULL,
          input_sha256 TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS content_object (
          sha256 TEXT PRIMARY KEY,
          bytes TEXT NOT NULL,
          media_type TEXT NOT NULL,
          object_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL CHECK (state IN ('pending', 'ready')),
          reference_count INTEGER NOT NULL CHECK (reference_count > 0),
          created_at TEXT NOT NULL,
          ready_at TEXT
        );
        CREATE TABLE IF NOT EXISTS version_file (
          version_id TEXT NOT NULL REFERENCES publication_version(version_id) ON DELETE RESTRICT,
          path TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('entrypoint', 'attachment')),
          media_type TEXT NOT NULL,
          bytes TEXT NOT NULL,
          sha256 TEXT NOT NULL REFERENCES content_object(sha256) ON DELETE RESTRICT,
          PRIMARY KEY (version_id, path)
        );
        CREATE INDEX IF NOT EXISTS idx_version_file_digest
          ON version_file (sha256, version_id);
        CREATE TABLE IF NOT EXISTS version_asset_reference (
          version_id TEXT NOT NULL REFERENCES publication_version(version_id) ON DELETE RESTRICT,
          reference_kind TEXT NOT NULL CHECK (reference_kind IN ('eidos-file-entry', 'markdown-link')),
          reference_key TEXT NOT NULL,
          uri TEXT NOT NULL,
          sha256 TEXT NOT NULL REFERENCES content_object(sha256) ON DELETE RESTRICT,
          bytes TEXT NOT NULL,
          media_type TEXT NOT NULL,
          PRIMARY KEY (version_id, reference_kind, reference_key)
        );
        CREATE TABLE IF NOT EXISTS version_artifact (
          version_id TEXT NOT NULL REFERENCES publication_version(version_id) ON DELETE RESTRICT,
          path TEXT NOT NULL,
          bytes TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          media_type TEXT NOT NULL,
          object_key TEXT NOT NULL UNIQUE,
          state TEXT NOT NULL CHECK (state IN ('pending', 'ready')),
          PRIMARY KEY (version_id, path)
        );
        CREATE TABLE IF NOT EXISTS multipart_upload (
          session_id TEXT PRIMARY KEY,
          version_id TEXT NOT NULL REFERENCES publication_version(version_id) ON DELETE RESTRICT,
          sha256 TEXT NOT NULL REFERENCES content_object(sha256) ON DELETE RESTRICT,
          object_key TEXT NOT NULL,
          upload_id TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('uploading', 'completed', 'aborted')),
          created_at TEXT NOT NULL,
          UNIQUE (version_id, sha256)
        );
        CREATE TABLE IF NOT EXISTS multipart_part (
          session_id TEXT NOT NULL REFERENCES multipart_upload(session_id) ON DELETE RESTRICT,
          part_number INTEGER NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
          bytes TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          etag TEXT,
          PRIMARY KEY (session_id, part_number)
        );
        CREATE TABLE IF NOT EXISTS usage_period (
          period TEXT PRIMARY KEY,
          source_bytes TEXT NOT NULL DEFAULT '0',
          artifact_bytes TEXT NOT NULL DEFAULT '0',
          runtime_active_seconds TEXT NOT NULL DEFAULT '0',
          runtime_starts INTEGER NOT NULL DEFAULT 0,
          builds INTEGER NOT NULL DEFAULT 0,
          requests INTEGER NOT NULL DEFAULT 0,
          reconciled_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runtime_rate_window (
          publication_id TEXT NOT NULL,
          client_hash TEXT NOT NULL,
          window_start TEXT NOT NULL,
          request_count INTEGER NOT NULL CHECK (request_count >= 0),
          PRIMARY KEY (publication_id, client_hash, window_start)
        );
        CREATE TABLE IF NOT EXISTS runtime_start_lease (
          version_id TEXT PRIMARY KEY,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runtime_start_reservation (
          reservation_key TEXT PRIMARY KEY,
          period TEXT NOT NULL,
          reserved_seconds INTEGER NOT NULL CHECK (reserved_seconds > 0),
          reserved_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runtime_request_lease (
          lease_id TEXT PRIMARY KEY,
          version_id TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_runtime_request_lease_version_expiry
          ON runtime_request_lease (version_id, expires_at);
        CREATE TABLE IF NOT EXISTS runtime_circuit (
          version_id TEXT PRIMARY KEY,
          consecutive_failures INTEGER NOT NULL CHECK (consecutive_failures >= 0),
          first_failure_at TEXT NOT NULL,
          opened_until TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_publication_version_publication_created
          ON publication_version (publication_id, created_at DESC, version_id DESC);
      `)
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO publish_schema_migrations (version, applied_at)
         VALUES (10, datetime('now'))`
      )
    })
  }

  async initialize(
    userId: string,
    publicSiteId: string,
    access: PublishAccessGrant,
    _activeHandle: string | null
  ): Promise<void> {
    await this.ready
    const existing = this.tenant()
    if (existing !== null) {
      if (
        existing.owner_user_id !== userId ||
        existing.public_site_id !== publicSiteId
      ) {
        throw new Error("tenant identity mismatch")
      }
      if (access.revision >= existing.access_revision) {
        this.ctx.storage.sql.exec(
          `UPDATE tenant SET plan = ?, status = ?,
                             active_handle = CASE WHEN ? = 'pro' THEN active_handle ELSE NULL END,
                             access_json = ?, access_revision = ?, access_checked_at = ?
            WHERE singleton = 1`,
          access.plan,
          access.state,
          access.plan,
          JSON.stringify(access),
          access.revision,
          new Date().toISOString()
        )
      }
      return
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO tenant (
         singleton, owner_user_id, public_site_id, plan, status, active_handle,
         access_json, access_revision, created_at
         , access_checked_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      publicSiteId,
      access.plan,
      access.state,
      null,
      JSON.stringify(access),
      access.revision,
      new Date().toISOString(),
      new Date().toISOString()
    )
  }

  async recordHandleClaim(
    handle: string,
    claimId: string,
    expiresAt: string
  ): Promise<boolean> {
    await this.ready
    const existing = this.ctx.storage.sql
      .exec<TenantHandleClaimRow>(
        `SELECT claim_id, status, expires_at
           FROM tenant_handle_claim WHERE handle_label = ?`,
        handle
      )
      .toArray()[0]
    if (existing?.status === "active") return existing.claim_id === claimId
    if (
      existing !== undefined &&
      existing.claim_id !== claimId &&
      existing.expires_at > new Date().toISOString()
    ) {
      return false
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO tenant_handle_claim (
         handle_label, claim_id, status, expires_at, activated_at
       ) VALUES (?, ?, 'pending', ?, NULL)
       ON CONFLICT (handle_label) DO UPDATE SET
         claim_id = excluded.claim_id,
         status = 'pending',
         expires_at = excluded.expires_at,
         activated_at = NULL`,
      handle,
      claimId,
      expiresAt
    )
    return true
  }

  async activateHandleClaim(handle: string, claimId: string): Promise<boolean> {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql
        .exec<TenantHandleClaimRow>(
          `SELECT claim_id, status, expires_at
             FROM tenant_handle_claim WHERE handle_label = ?`,
          handle
        )
        .toArray()[0]
      if (
        existing === undefined ||
        existing.claim_id !== claimId ||
        (existing.status !== "active" &&
          existing.expires_at <= new Date().toISOString())
      ) {
        return false
      }
      const tenant = this.tenant()
      if (
        tenant === null ||
        tenant.plan !== "pro" ||
        tenant.status !== "active"
      )
        return false
      this.ctx.storage.sql.exec(
        `UPDATE tenant_handle_claim
            SET status = 'active', activated_at = COALESCE(activated_at, ?)
          WHERE handle_label = ? AND claim_id = ?`,
        new Date().toISOString(),
        handle,
        claimId
      )
      this.ctx.storage.sql.exec(
        "UPDATE tenant SET active_handle = ? WHERE singleton = 1",
        handle
      )
      return true
    })
  }

  async hasActivatedHandleClaim(
    handle: string,
    claimId: string
  ): Promise<boolean> {
    await this.ready
    return (
      this.ctx.storage.sql
        .exec<CountRow>(
          `SELECT count(*) AS count FROM tenant_handle_claim
          WHERE handle_label = ? AND claim_id = ? AND status = 'active'`,
          handle,
          claimId
        )
        .one().count === 1
    )
  }

  async getActiveHandle(): Promise<string | null> {
    await this.ready
    const tenant = this.tenant()
    return tenant?.plan === "pro" && tenant.status === "active"
      ? tenant.active_handle
      : null
  }

  async getEntitlementContext(): Promise<{
    ownerUserId: string
    checkedAt: string
  }> {
    await this.ready
    const tenant = this.tenant()
    if (tenant === null) throw new Error("tenant is not initialized")
    return {
      ownerUserId: tenant.owner_user_id,
      checkedAt: tenant.access_checked_at,
    }
  }

  async listPublications(): Promise<PublicationRecord[]> {
    await this.ready
    return this.ctx.storage.sql
      .exec<PublicationRow>(
        `SELECT publication_id, slug, visibility, current_version_id, created_at
           FROM publication ORDER BY created_at DESC, publication_id DESC`
      )
      .toArray()
      .map((publication) => this.publicationRecord(publication))
  }

  async getCurrentUsage(
    now = new Date().toISOString()
  ): Promise<UsagePeriodRecord> {
    await this.ready
    return usagePeriodRecord(this.ensureUsagePeriod(usagePeriod(now), now))
  }

  async getAccessGrant(): Promise<PublishAccessGrant> {
    await this.ready
    return this.currentAccess()
  }

  async getStorageUsage(): Promise<{ usedBytes: string; maxBytes: string }> {
    await this.ready
    return {
      usedBytes: this.storageBytes().toString(),
      maxBytes: this.currentAccess().maxStorageBytes,
    }
  }

  async resolvePublishedAsset(
    versionId: string,
    entryId: string
  ): Promise<DurableResult<PublishedAssetRecord>> {
    await this.ready
    const version = this.versionById(versionId)
    if (version === null || version.state !== "ready") {
      return failure(404, "asset_not_found", "Published asset not found")
    }
    const row = this.ctx.storage.sql
      .exec<AssetReferenceRow>(
        `SELECT refs.reference_kind, refs.reference_key, refs.uri, refs.sha256, refs.bytes,
                refs.media_type, objects.object_key
           FROM version_asset_reference AS refs
           JOIN content_object AS objects ON objects.sha256 = refs.sha256
          WHERE refs.version_id = ?
            AND refs.reference_kind = 'eidos-file-entry'
            AND refs.reference_key = ?
            AND objects.state = 'ready'`,
        versionId,
        entryId
      )
      .toArray()[0]
    return row === undefined
      ? failure(404, "asset_not_found", "Published asset not found")
      : ok({
          entryId: row.reference_key,
          uri: row.uri,
          sha256: row.sha256,
          bytes: row.bytes,
          mediaType: row.media_type,
          objectKey: row.object_key,
        })
  }

  async resolvePublishedFile(
    versionId: string,
    path: string
  ): Promise<DurableResult<PublishedFileRecord>> {
    await this.ready
    const version = this.versionById(versionId)
    if (version === null || version.state !== "ready") {
      return failure(404, "file_not_found", "Published file not found")
    }
    const row = this.ctx.storage.sql
      .exec<PublishedFileRow>(
        `SELECT files.path, files.sha256, files.bytes,
                files.media_type, objects.object_key
           FROM version_file AS files
           JOIN content_object AS objects ON objects.sha256 = files.sha256
          WHERE files.version_id = ? AND files.path = ?
            AND files.role = 'attachment' AND objects.state = 'ready'`,
        versionId,
        path
      )
      .toArray()[0]
    return row === undefined
      ? failure(404, "file_not_found", "Published file not found")
      : ok({
          path: row.path,
          sha256: row.sha256,
          bytes: row.bytes,
          mediaType: row.media_type,
          objectKey: row.object_key,
        })
  }

  async resolvePublishedArtifact(
    versionId: string,
    path: string
  ): Promise<DurableResult<StaticArtifactRecord>> {
    await this.ready
    const version = this.versionById(versionId)
    if (version === null || version.state !== "ready") {
      return failure(404, "artifact_not_found", "Published artifact not found")
    }
    const artifact = this.publishedArtifact(versionId, path)
    return artifact === null
      ? failure(404, "artifact_not_found", "Published artifact not found")
      : ok(artifact)
  }

  async authorizeBuildRuntime(
    versionId: string,
    reservationKey: string,
    now = new Date().toISOString()
  ): Promise<DurableResult<UsagePeriodRecord>> {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const version = this.versionById(versionId)
      if (version === null)
        return failure(
          404,
          "version_not_found",
          "Publication Version not found"
        )
      if (version.state !== "validating" && version.state !== "preparing") {
        return failure(
          409,
          "invalid_version_transition",
          "Version is not preparing"
        )
      }
      const existing = this.ctx.storage.sql
        .exec<Record<string, SqlStorageValue>>(
          "SELECT reservation_key FROM runtime_start_reservation WHERE reservation_key = ?",
          reservationKey
        )
        .toArray()[0]
      const period = usagePeriod(now)
      const usage = this.ensureUsagePeriod(period, now)
      if (existing !== undefined) return ok(usagePeriodRecord(usage))
      const access = this.currentAccess()
      const allowed = this.reserveRuntimeStart(
        usage,
        access,
        versionId,
        reservationKey,
        now
      )
      if (!allowed.ok) return allowed
      this.ctx.storage.sql.exec(
        "UPDATE usage_period SET builds = builds + 1 WHERE period = ?",
        period
      )
      return ok(usagePeriodRecord(this.requireUsagePeriod(period)))
    })
  }

  async authorizeRuntimeRequest(
    publicationId: string,
    versionId: string,
    clientHash: string,
    reserveStart: boolean,
    requestLeaseId: string | null,
    now = new Date().toISOString()
  ): Promise<DurableResult<UsagePeriodRecord>> {
    await this.ready
    return this.ctx.storage.transactionSync(() =>
      this.authorizeRuntimeRequestInTransaction(
        publicationId,
        versionId,
        clientHash,
        reserveStart,
        requestLeaseId,
        now
      )
    )
  }

  async authorizeRuntimeProxyRequest(
    target: {
      slug: string
      publicationId: string
      versionId: string
      servingTargetSha256: string
      visibility: "public" | "private"
      accessMode: "public" | "password" | "private"
      accessRevision: number
    },
    clientHash: string,
    requestLeaseId: string,
    now = new Date().toISOString()
  ): Promise<
    DurableResult<{
      runtimeIdleSeconds: number
      version: PublicationVersionRecord
    }>
  > {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const tenant = this.tenant()
      const publication = this.publication(target.slug)
      if (
        tenant === null ||
        tenant.status !== "active" ||
        publication === null ||
        publication.current_version_id !== target.versionId ||
        publication.publication_id !== target.publicationId
      ) {
        return failure(404, "publication_not_found", "Publication not found")
      }
      const version = this.version(target.slug, target.versionId)
      if (version === null || version.state !== "ready") {
        return failure(404, "publication_not_found", "Publication not found")
      }
      const publicationRecord = this.publicationRecord(publication)
      const resolvedVersion = versionRecord(version)
      if (
        publicationRecord.visibility !== target.visibility ||
        publicationRecord.accessMode !== target.accessMode ||
        publicationRecord.accessRevision !== target.accessRevision ||
        resolvedVersion.servingTargetSha256 !== target.servingTargetSha256
      ) {
        return failure(
          401,
          "stale_runtime_ticket",
          "Runtime ticket no longer targets the active Version"
        )
      }
      const authorized = this.authorizeRuntimeRequestInTransaction(
        target.publicationId,
        target.versionId,
        clientHash,
        false,
        requestLeaseId,
        now
      )
      if (!authorized.ok) return authorized
      return ok({
        runtimeIdleSeconds: this.currentAccess().runtimeIdleSeconds,
        version: resolvedVersion,
      })
    })
  }

  private authorizeRuntimeRequestInTransaction(
    publicationId: string,
    versionId: string,
    clientHash: string,
    reserveStart: boolean,
    requestLeaseId: string | null,
    now: string
  ): DurableResult<UsagePeriodRecord> {
    const publication = this.ctx.storage.sql
      .exec<PublicationRow>(
        `SELECT publication_id, slug, visibility, current_version_id, created_at
           FROM publication WHERE publication_id = ?`,
        publicationId
      )
      .toArray()[0]
    if (
      publication === undefined ||
      publication.current_version_id !== versionId
    ) {
      return failure(404, "publication_not_found", "Publication not found")
    }
    const access = this.currentAccess()
    if (access.state !== "active") {
      return failure(
        403,
        "publish_access_suspended",
        "Publish access is suspended"
      )
    }
    const windowStart = now.slice(0, 16)
    const rate = this.ctx.storage.sql
      .exec<RateWindowRow>(
        `SELECT request_count FROM runtime_rate_window
          WHERE publication_id = ? AND client_hash = ? AND window_start = ?`,
        publicationId,
        clientHash,
        windowStart
      )
      .toArray()[0]
    const rateLimit = access.plan === "pro" ? 600 : 120
    if ((rate?.request_count ?? 0) >= rateLimit) {
      return failure(429, "rate_limited", "Runtime request rate limit reached")
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO runtime_rate_window (
         publication_id, client_hash, window_start, request_count
       ) VALUES (?, ?, ?, 1)
       ON CONFLICT (publication_id, client_hash, window_start)
       DO UPDATE SET request_count = request_count + 1`,
      publicationId,
      clientHash,
      windowStart
    )
    this.ctx.storage.sql.exec(
      "DELETE FROM runtime_rate_window WHERE window_start < ?",
      new Date(Date.parse(now) - 5 * 60_000).toISOString().slice(0, 16)
    )
    const period = usagePeriod(now)
    const usage = this.ensureUsagePeriod(period, now)
    if (reserveStart) {
      const lease = this.ctx.storage.sql
        .exec<RuntimeLeaseRow>(
          "SELECT expires_at FROM runtime_start_lease WHERE version_id = ?",
          versionId
        )
        .toArray()[0]
      if (lease === undefined || lease.expires_at <= now) {
        const reservationKey = `viewer:${versionId}:${crypto.randomUUID()}`
        const reserved = this.reserveRuntimeStart(
          usage,
          access,
          versionId,
          reservationKey,
          now
        )
        if (!reserved.ok) return reserved
        this.ctx.storage.sql.exec(
          `INSERT INTO runtime_start_lease (version_id, expires_at)
           VALUES (?, ?)
           ON CONFLICT (version_id) DO UPDATE SET expires_at = excluded.expires_at`,
          versionId,
          new Date(Date.parse(now) + 2 * 60_000).toISOString()
        )
      }
    }
    if (requestLeaseId !== null) {
      this.ctx.storage.sql.exec(
        "DELETE FROM runtime_request_lease WHERE expires_at <= ?",
        now
      )
      const existingLease = this.ctx.storage.sql
        .exec<RuntimeRequestLeaseRow>(
          "SELECT lease_id FROM runtime_request_lease WHERE lease_id = ? AND version_id = ?",
          requestLeaseId,
          versionId
        )
        .toArray()[0]
      if (existingLease === undefined) {
        const concurrent = this.ctx.storage.sql
          .exec<CountRow>(
            "SELECT count(*) AS count FROM runtime_request_lease WHERE version_id = ?",
            versionId
          )
          .one().count
        const concurrencyLimit = access.plan === "pro" ? 16 : 4
        if (concurrent >= concurrencyLimit) {
          return failure(
            429,
            "runtime_concurrency_exceeded",
            "Runtime concurrency limit reached"
          )
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO runtime_request_lease (lease_id, version_id, expires_at)
           VALUES (?, ?, ?)`,
          requestLeaseId,
          versionId,
          new Date(Date.parse(now) + 2 * 60_000).toISOString()
        )
      }
    }
    this.ctx.storage.sql.exec(
      "UPDATE usage_period SET requests = requests + 1 WHERE period = ?",
      period
    )
    return ok(usagePeriodRecord(this.requireUsagePeriod(period)))
  }

  async completeRuntimeRequest(requestLeaseId: string): Promise<void> {
    await this.ready
    this.ctx.storage.sql.exec(
      "DELETE FROM runtime_request_lease WHERE lease_id = ?",
      requestLeaseId
    )
  }

  async recordRuntimeReady(versionId: string): Promise<void> {
    await this.ready
    this.ctx.storage.sql.exec(
      "DELETE FROM runtime_start_lease WHERE version_id = ?",
      versionId
    )
    this.ctx.storage.sql.exec(
      "DELETE FROM runtime_circuit WHERE version_id = ?",
      versionId
    )
  }

  async recordRuntimeFailure(
    versionId: string,
    now = new Date().toISOString()
  ): Promise<void> {
    await this.ready
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "DELETE FROM runtime_start_lease WHERE version_id = ?",
        versionId
      )
      const prior = this.ctx.storage.sql
        .exec<CircuitRow>(
          `SELECT consecutive_failures, first_failure_at, opened_until
             FROM runtime_circuit WHERE version_id = ?`,
          versionId
        )
        .toArray()[0]
      const withinWindow =
        prior !== undefined &&
        Date.parse(now) - Date.parse(prior.first_failure_at) <= 5 * 60_000
      const failures = withinWindow ? prior.consecutive_failures + 1 : 1
      const firstFailureAt = withinWindow ? prior.first_failure_at : now
      const openedUntil =
        failures >= 3
          ? new Date(Date.parse(now) + 5 * 60_000).toISOString()
          : null
      this.ctx.storage.sql.exec(
        `INSERT INTO runtime_circuit (
           version_id, consecutive_failures, first_failure_at, opened_until
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT (version_id) DO UPDATE SET
           consecutive_failures = excluded.consecutive_failures,
           first_failure_at = excluded.first_failure_at,
           opened_until = excluded.opened_until`,
        versionId,
        failures,
        firstFailureAt,
        openedUntil
      )
    })
  }

  async createPublication(
    slug: string,
    visibility: "public" | "private",
    access: PublishAccessGrant,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<PublicationRecord>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "createPublication",
      inputSha256,
      () => {
        if (visibility === "private" && !access.privatePublications) {
          return failure(
            403,
            "private_publication_not_allowed",
            "Private publications require Pro"
          )
        }
        const existing = this.publication(slug)
        if (existing !== null) {
          return ok(this.publicationRecord(existing))
        }
        if (this.tenant() === null)
          return failure(
            409,
            "tenant_not_initialized",
            "Tenant is not initialized"
          )
        const publicationId = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        this.ctx.storage.sql.exec(
          `INSERT INTO publication (publication_id, slug, visibility, current_version_id, created_at)
         VALUES (?, ?, ?, NULL, ?)`,
          publicationId,
          slug,
          visibility,
          createdAt
        )
        this.ctx.storage.sql.exec(
          `INSERT INTO publication_access (
             publication_id, mode, credential_revision, password_algorithm,
             password_iterations, password_salt, password_hash, updated_at
           ) VALUES (?, ?, 0, NULL, NULL, NULL, NULL, ?)`,
          publicationId,
          visibility,
          createdAt
        )
        return ok(this.publicationRecord(this.publication(slug)!))
      }
    )
  }

  async setPublicationAccess(
    slug: string,
    mode: "public" | "password" | "private",
    password: string | null,
    access: PublishAccessGrant,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<PublicationRecord>> {
    await this.ready
    if (mode !== "public" && !access.privatePublications) {
      return failure(
        403,
        "restricted_publication_not_allowed",
        "Password-protected and private publications require Pro"
      )
    }
    if (this.publication(slug) === null) {
      return failure(404, "publication_not_found", "Publication not found")
    }
    const verifier =
      mode === "password" && password !== null
        ? await createPublicationPasswordVerifier(
            password,
            this.bindings.PUBLISH_PASSWORD_PEPPER
          )
        : null
    if ((mode === "password") !== (verifier !== null)) {
      return failure(
        400,
        "invalid_publication_access",
        "Password access requires a valid password"
      )
    }
    return this.idempotent(
      idempotencyKey,
      "setPublicationAccess",
      inputSha256,
      () => {
        const publication = this.publication(slug)
        if (publication === null) {
          return failure(404, "publication_not_found", "Publication not found")
        }
        const current = this.publicationAccess(publication.publication_id)
        if (current === null) {
          throw new Error("publication access policy is missing")
        }
        if (mode !== "password" && current.mode === mode) {
          return ok(this.publicationRecord(publication))
        }
        const revision = current.credential_revision + 1
        const visibility = mode === "private" ? "private" : "public"
        const now = new Date().toISOString()
        this.ctx.storage.sql.exec(
          "UPDATE publication SET visibility = ? WHERE publication_id = ?",
          visibility,
          publication.publication_id
        )
        this.ctx.storage.sql.exec(
          `UPDATE publication_access
              SET mode = ?, credential_revision = ?, password_algorithm = ?,
                  password_iterations = ?, password_salt = ?, password_hash = ?,
                  updated_at = ?
            WHERE publication_id = ?`,
          mode,
          revision,
          verifier?.algorithm ?? null,
          verifier?.iterations ?? null,
          verifier?.salt ?? null,
          verifier?.hash ?? null,
          now,
          publication.publication_id
        )
        this.ctx.storage.sql.exec(
          "DELETE FROM publication_password_attempt WHERE publication_id = ?",
          publication.publication_id
        )
        return ok(this.publicationRecord(this.publication(slug)!))
      }
    )
  }

  async setFormPublicationPolicy(
    slug: string,
    respondentAccess: "anyone" | "signed_in",
    allowMultipleResponses: boolean,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<FormPublicationPolicy>> {
    await this.ready
    if (respondentAccess === "anyone" && !allowMultipleResponses) {
      return failure(
        400,
        "invalid_form_policy",
        "One response per user requires signed-in respondents"
      )
    }
    if (this.publication(slug) === null) {
      return failure(404, "publication_not_found", "Publication not found")
    }
    return this.idempotent(
      idempotencyKey,
      "setFormPublicationPolicy",
      inputSha256,
      () => {
        const publication = this.publication(slug)
        if (publication === null) {
          return failure(404, "publication_not_found", "Publication not found")
        }
        const current = this.publicationFormPolicy(publication.publication_id)
        if (
          current.respondentAccess === respondentAccess &&
          current.allowMultipleResponses === allowMultipleResponses
        ) {
          return ok(current)
        }
        const now = new Date().toISOString()
        this.ctx.storage.sql.exec(
          `INSERT INTO publication_form_policy (
             publication_id, respondent_access, allow_multiple_responses,
             policy_revision, updated_at
           ) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT (publication_id) DO UPDATE SET
             respondent_access = excluded.respondent_access,
             allow_multiple_responses = excluded.allow_multiple_responses,
             policy_revision = publication_form_policy.policy_revision + 1,
             updated_at = excluded.updated_at`,
          publication.publication_id,
          respondentAccess,
          allowMultipleResponses ? 1 : 0,
          now
        )
        return ok(this.publicationFormPolicy(publication.publication_id))
      }
    )
  }

  async setPublicationBranding(
    slug: string,
    showBranding: boolean,
    access: PublishAccessGrant,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<PublicationRecord>> {
    await this.ready
    if (!showBranding && !access.removeBranding) {
      return failure(
        403,
        "branding_removal_not_allowed",
        "Removing Eidos branding is not included with this Publish subscription"
      )
    }
    if (this.publication(slug) === null) {
      return failure(404, "publication_not_found", "Publication not found")
    }
    return this.idempotent(
      idempotencyKey,
      "setPublicationBranding",
      inputSha256,
      () => {
        const publication = this.publication(slug)
        if (publication === null) {
          return failure(404, "publication_not_found", "Publication not found")
        }
        const current = this.publicationBrandingPreference(
          publication.publication_id
        )
        if (current === showBranding) {
          return ok(this.publicationRecord(publication))
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO publication_branding (
             publication_id, show_branding, updated_at
           ) VALUES (?, ?, ?)
           ON CONFLICT (publication_id) DO UPDATE SET
             show_branding = excluded.show_branding,
             updated_at = excluded.updated_at`,
          publication.publication_id,
          showBranding ? 1 : 0,
          new Date().toISOString()
        )
        return ok(this.publicationRecord(publication))
      }
    )
  }

  async verifyPublicationPassword(
    slug: string,
    password: string,
    clientHash: string,
    now = new Date().toISOString()
  ): Promise<DurableResult<{ publicationId: string; accessRevision: number }>> {
    await this.ready
    if (!/^[A-Za-z0-9_-]{43}$/.test(clientHash)) {
      return failure(
        400,
        "invalid_password_request",
        "Password request is invalid"
      )
    }
    const publication = this.publication(slug)
    if (publication === null) {
      return failure(404, "publication_not_found", "Publication not found")
    }
    const policy = this.publicationAccess(publication.publication_id)
    const parsedNow = Date.parse(now)
    if (
      policy === null ||
      policy.mode !== "password" ||
      !Number.isFinite(parsedNow) ||
      policy.password_algorithm !== "pbkdf2-sha256-chain-v1+hmac-sha256" ||
      policy.password_iterations === null ||
      policy.password_salt === null ||
      policy.password_hash === null
    ) {
      return failure(401, "invalid_password", "Password is invalid")
    }
    const windowStart = Math.floor(parsedNow / (5 * 60_000))
    const reservation = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "DELETE FROM publication_password_attempt WHERE window_start < ?",
        windowStart - 2
      )
      const prior = this.ctx.storage.sql
        .exec<PasswordAttemptRow>(
          `SELECT failure_count FROM publication_password_attempt
            WHERE publication_id = ? AND client_hash = ? AND window_start = ?`,
          publication.publication_id,
          clientHash,
          windowStart
        )
        .toArray()[0]
      if ((prior?.failure_count ?? 0) >= 10) return false
      this.ctx.storage.sql.exec(
        `INSERT INTO publication_password_attempt (
           publication_id, client_hash, window_start, failure_count
         ) VALUES (?, ?, ?, 1)
         ON CONFLICT (publication_id, client_hash, window_start)
         DO UPDATE SET failure_count = failure_count + 1`,
        publication.publication_id,
        clientHash,
        windowStart
      )
      return true
    })
    if (!reservation) {
      return failure(429, "password_rate_limited", "Too many password attempts")
    }
    const verifier: PublicationPasswordVerifier = {
      algorithm: "pbkdf2-sha256-chain-v1+hmac-sha256",
      iterations: policy.password_iterations,
      salt: policy.password_salt,
      hash: policy.password_hash,
    }
    const valid = await verifyPublicationPassword(
      password,
      verifier,
      this.bindings.PUBLISH_PASSWORD_PEPPER
    )
    const current = this.publicationAccess(publication.publication_id)
    if (
      !valid ||
      current?.mode !== "password" ||
      current.credential_revision !== policy.credential_revision
    ) {
      return failure(401, "invalid_password", "Password is invalid")
    }
    this.ctx.storage.sql.exec(
      `DELETE FROM publication_password_attempt
        WHERE publication_id = ? AND client_hash = ?`,
      publication.publication_id,
      clientHash
    )
    return ok({
      publicationId: publication.publication_id,
      accessRevision: current.credential_revision,
    })
  }

  async beginVersionUpload(
    slug: string,
    bundle: ValidatedSourceBundle,
    versionId: string,
    activateOnReady: boolean,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<VersionUploadPlan>> {
    await this.ready
    const result = this.idempotent<VersionUploadPlan>(
      idempotencyKey,
      "beginVersionUpload",
      inputSha256,
      () => {
        const publication = this.publication(slug)
        if (publication === null)
          return failure(404, "publication_not_found", "Publication not found")
        const access = this.currentAccess()
        const tenant = this.tenant()
        if (tenant === null)
          return failure(
            409,
            "tenant_not_initialized",
            "Tenant is not initialized"
          )
        const sourceManifestKey = sourceManifestObjectKey(
          tenant.public_site_id,
          publication.publication_id,
          versionId
        )
        const entrypointObjectKey = contentObjectKey(
          tenant.public_site_id,
          bundle.entrypoint.sha256
        )
        const uniqueFiles = new Map<string, SourceBundleFile>()
        for (const file of bundle.manifest.files) {
          const prior = uniqueFiles.get(file.sha256)
          if (prior !== undefined && prior.bytes !== file.bytes) {
            return failure(
              409,
              "source_digest_conflict",
              "One source digest declares different byte counts"
            )
          }
          uniqueFiles.set(file.sha256, prior ?? file)
        }
        let storageBytes = this.storageBytes()
        let newBytes = 0n
        const objects: SourceObjectUpload[] = []
        for (const file of uniqueFiles.values()) {
          const existing = this.contentObject(file.sha256)
          if (existing !== null) {
            if (existing.bytes !== file.bytes) {
              return failure(
                409,
                "source_digest_conflict",
                "Stored content digest has a different byte count"
              )
            }
            objects.push(contentObjectUpload(existing))
          } else {
            newBytes += BigInt(file.bytes)
            objects.push({
              sha256: file.sha256,
              bytes: file.bytes,
              mediaType: file.mediaType,
              state: "pending",
            })
          }
        }
        if (storageBytes + newBytes > BigInt(access.maxStorageBytes)) {
          return failure(
            403,
            "storage_limit_reached",
            "Publish storage limit reached"
          )
        }
        const jobId = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        this.ctx.storage.sql.exec(
          `INSERT INTO publication_version (
           version_id, publication_id, state, job_id, activate_on_ready, source_manifest_key,
           source_manifest_sha256, source_bytes, entrypoint_json,
           entrypoint_object_key, driver_id, driver_version, created_at
         ) VALUES (?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          versionId,
          publication.publication_id,
          jobId,
          activateOnReady ? 1 : 0,
          sourceManifestKey,
          bundle.manifestSha256,
          bundle.sourceBytes,
          JSON.stringify(bundle.entrypoint),
          entrypointObjectKey,
          bundle.driver.id,
          bundle.driver.version,
          createdAt
        )
        for (const file of uniqueFiles.values()) {
          const existing = this.contentObject(file.sha256)
          if (existing === null) {
            this.ctx.storage.sql.exec(
              `INSERT INTO content_object (
                 sha256, bytes, media_type, object_key, state,
                 reference_count, created_at, ready_at
               ) VALUES (?, ?, ?, ?, 'pending', 1, ?, NULL)`,
              file.sha256,
              file.bytes,
              file.mediaType,
              contentObjectKey(tenant.public_site_id, file.sha256),
              createdAt
            )
          } else {
            this.ctx.storage.sql.exec(
              `UPDATE content_object
                  SET reference_count = reference_count + 1
                WHERE sha256 = ?`,
              file.sha256
            )
          }
        }
        for (const file of bundle.manifest.files) {
          this.ctx.storage.sql.exec(
            `INSERT INTO version_file (
               version_id, path, role, media_type, bytes, sha256
             ) VALUES (?, ?, ?, ?, ?, ?)`,
            versionId,
            file.path,
            file.role,
            file.mediaType,
            file.bytes,
            file.sha256
          )
        }
        for (const reference of bundle.manifest.assetReferences) {
          const file = bundle.manifest.files.find(
            (candidate) =>
              candidate.role === "attachment" &&
              candidate.path === decodeURIComponent(reference.uri) &&
              candidate.sha256 === reference.fileSha256
          )!
          this.ctx.storage.sql.exec(
            `INSERT INTO version_asset_reference (
               version_id, reference_kind, reference_key, uri, sha256, bytes, media_type
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            versionId,
            reference.kind,
            reference.kind === "eidos-file-entry"
              ? reference.entryId
              : reference.uri,
            reference.uri,
            reference.fileSha256,
            file.bytes,
            file.mediaType
          )
        }
        storageBytes += newBytes
        return ok({
          version: this.requireVersion(slug, versionId),
          objects,
          storageBytes: storageBytes.toString(),
          maxStorageBytes: access.maxStorageBytes,
        })
      }
    )
    if (!result.ok) return result
    return ok({
      ...result.value,
      objects: result.value.objects.map((object) =>
        contentObjectUpload(this.requireContentObject(object.sha256))
      ),
      storageBytes: this.storageBytes().toString(),
      maxStorageBytes: this.currentAccess().maxStorageBytes,
    })
  }

  async getVersionStatus(
    slug: string,
    versionId: string
  ): Promise<DurableResult<PublicationVersionRecord>> {
    await this.ready
    const row = this.version(slug, versionId)
    return row === null
      ? failure(404, "version_not_found", "Publication Version not found")
      : ok(versionRecord(row))
  }

  async getVersionForJob(
    versionId: string,
    jobId: string
  ): Promise<DurableResult<PublicationVersionRecord>> {
    await this.ready
    const row = this.versionById(versionId)
    return row === null || row.job_id !== jobId
      ? failure(404, "version_not_found", "Publication Version not found")
      : ok(versionRecord(row))
  }

  async getVersionObject(
    slug: string,
    versionId: string,
    sha256: string
  ): Promise<DurableResult<ContentObjectRecord>> {
    await this.ready
    const version = this.version(slug, versionId)
    if (version === null)
      return failure(404, "version_not_found", "Publication Version not found")
    if (!this.versionReferencesObject(versionId, sha256)) {
      return failure(404, "source_object_not_found", "Source object not found")
    }
    const object = this.contentObject(sha256)
    return object === null
      ? failure(404, "source_object_not_found", "Source object not found")
      : ok(contentObjectRecord(object))
  }

  async authorizeObjectUpload(
    slug: string,
    versionId: string,
    sha256: string,
    bytes: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<ContentObjectRecord>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "authorizeObjectUpload",
      inputSha256,
      () => {
        const version = this.version(slug, versionId)
        const object = this.contentObject(sha256)
        if (
          version === null ||
          object === null ||
          !this.versionReferencesObject(versionId, sha256)
        )
          return failure(
            404,
            "source_object_not_found",
            "Source object not found"
          )
        if (object.bytes !== bytes) {
          return failure(
            409,
            "source_upload_conflict",
            "Source upload does not match the immutable manifest"
          )
        }
        return version.state === "uploading" || object.state === "ready"
          ? ok(contentObjectRecord(object))
          : failure(
              409,
              "version_not_uploading",
              "Version is not accepting source bytes"
            )
      }
    )
  }

  async markObjectReady(
    slug: string,
    versionId: string,
    sha256: string,
    bytes: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<ContentObjectRecord>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "markObjectReady",
      inputSha256,
      () => {
        const version = this.version(slug, versionId)
        const object = this.contentObject(sha256)
        if (
          version === null ||
          object === null ||
          !this.versionReferencesObject(versionId, sha256)
        ) {
          return failure(
            404,
            "source_object_not_found",
            "Source object not found"
          )
        }
        if (object.bytes !== bytes) {
          return failure(
            409,
            "source_upload_conflict",
            "Stored object does not match the immutable manifest"
          )
        }
        if (object.state === "ready") return ok(contentObjectRecord(object))
        if (version.state !== "uploading") {
          return failure(
            409,
            "version_not_uploading",
            "Version is not accepting source bytes"
          )
        }
        this.ctx.storage.sql.exec(
          `UPDATE content_object
              SET state = 'ready', ready_at = ?
            WHERE sha256 = ? AND state = 'pending'`,
          new Date().toISOString(),
          sha256
        )
        this.addSourceUsage(bytes)
        return ok(contentObjectRecord(this.requireContentObject(sha256)))
      }
    )
  }

  async finalizeVersionUpload(
    slug: string,
    versionId: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<PublicationVersionRecord>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "finalizeVersionUpload",
      inputSha256,
      () => {
        const version = this.version(slug, versionId)
        if (version === null)
          return failure(
            404,
            "version_not_found",
            "Publication Version not found"
          )
        if (version.state === "uploaded") return ok(versionRecord(version))
        if (version.state !== "uploading")
          return failure(
            409,
            "version_not_uploading",
            "Version is not accepting source objects"
          )
        const missing = this.ctx.storage.sql
          .exec<CountRow>(
            `SELECT count(*) AS count
               FROM version_file AS files
               JOIN content_object AS objects ON objects.sha256 = files.sha256
              WHERE files.version_id = ? AND objects.state != 'ready'`,
            versionId
          )
          .one().count
        if (missing !== 0) {
          return failure(
            409,
            "source_objects_incomplete",
            "Source Bundle still has missing objects"
          )
        }
        this.ctx.storage.sql.exec(
          "UPDATE publication_version SET state = 'uploaded' WHERE version_id = ? AND state = 'uploading'",
          versionId
        )
        return ok(this.requireVersion(slug, versionId))
      }
    )
  }

  async getMultipartSession(
    slug: string,
    versionId: string,
    sha256: string
  ): Promise<DurableResult<MultipartUploadSession | null>> {
    await this.ready
    const version = this.version(slug, versionId)
    if (version === null)
      return failure(404, "version_not_found", "Publication Version not found")
    if (!this.versionReferencesObject(versionId, sha256))
      return failure(
        409,
        "source_upload_conflict",
        "Source object does not match the manifest"
      )
    const row = this.multipartSession(versionId, sha256)
    return ok(row === null ? null : multipartSessionRecord(row))
  }

  async findMultipartSession(
    slug: string,
    versionId: string,
    sessionId: string
  ): Promise<DurableResult<MultipartUploadSession>> {
    await this.ready
    const version = this.version(slug, versionId)
    const row = this.multipartSessionById(sessionId)
    return version === null || row === null || row.version_id !== versionId
      ? failure(404, "multipart_not_found", "Multipart upload not found")
      : ok(multipartSessionRecord(row))
  }

  async beginMultipartUpload(
    slug: string,
    versionId: string,
    sha256: string,
    sessionId: string,
    uploadId: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<MultipartUploadSession>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "beginMultipartUpload",
      inputSha256,
      () => {
        const version = this.version(slug, versionId)
        if (version === null)
          return failure(
            404,
            "version_not_found",
            "Publication Version not found"
          )
        const object = this.contentObject(sha256)
        if (object === null || !this.versionReferencesObject(versionId, sha256))
          return failure(
            409,
            "source_upload_conflict",
            "Source object does not match the manifest"
          )
        const existing = this.multipartSession(versionId, sha256)
        if (existing !== null) return ok(multipartSessionRecord(existing))
        if (object.state === "ready") {
          return failure(
            409,
            "source_object_ready",
            "Source object is already uploaded"
          )
        }
        if (version.state !== "uploading")
          return failure(
            409,
            "version_not_uploading",
            "Version is not accepting source bytes"
          )
        this.ctx.storage.sql.exec(
          `INSERT INTO multipart_upload (
           session_id, version_id, sha256, object_key, upload_id, state, created_at
         ) VALUES (?, ?, ?, ?, ?, 'uploading', ?)`,
          sessionId,
          versionId,
          sha256,
          object.object_key,
          uploadId,
          new Date().toISOString()
        )
        return ok(
          multipartSessionRecord(
            this.requireMultipartSession(versionId, sha256)
          )
        )
      }
    )
  }

  async authorizeMultipartPart(
    sessionId: string,
    partNumber: number,
    bytes: string,
    sha256: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<MultipartPartRecord>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "uploadMultipartPart",
      inputSha256,
      () => {
        const session = this.multipartSessionById(sessionId)
        if (session === null)
          return failure(
            404,
            "multipart_not_found",
            "Multipart upload not found"
          )
        if (session.state !== "uploading")
          return failure(
            409,
            "multipart_not_uploading",
            "Multipart upload is not accepting parts"
          )
        const existing = this.multipartPart(sessionId, partNumber)
        if (existing !== null) {
          return existing.bytes === bytes && existing.sha256 === sha256
            ? ok(multipartPartRecord(existing))
            : failure(
                409,
                "multipart_part_conflict",
                "Multipart part already has different bytes"
              )
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO multipart_part (session_id, part_number, bytes, sha256, etag)
         VALUES (?, ?, ?, ?, NULL)`,
          sessionId,
          partNumber,
          bytes,
          sha256
        )
        return ok(
          multipartPartRecord(this.requireMultipartPart(sessionId, partNumber))
        )
      }
    )
  }

  async recordMultipartPart(
    sessionId: string,
    partNumber: number,
    etag: string
  ): Promise<DurableResult<MultipartPartRecord>> {
    await this.ready
    const part = this.multipartPart(sessionId, partNumber)
    if (part === null)
      return failure(
        404,
        "multipart_part_not_found",
        "Multipart part not found"
      )
    if (part.etag !== null && part.etag !== etag) {
      return failure(
        409,
        "multipart_part_conflict",
        "Multipart part already has a different ETag"
      )
    }
    this.ctx.storage.sql.exec(
      "UPDATE multipart_part SET etag = ? WHERE session_id = ? AND part_number = ?",
      etag,
      sessionId,
      partNumber
    )
    return ok(
      multipartPartRecord(this.requireMultipartPart(sessionId, partNumber))
    )
  }

  async listMultipartParts(
    sessionId: string
  ): Promise<DurableResult<MultipartPartRecord[]>> {
    await this.ready
    const session = this.multipartSessionById(sessionId)
    if (session === null)
      return failure(404, "multipart_not_found", "Multipart upload not found")
    const parts = this.ctx.storage.sql
      .exec<MultipartPartRow>(
        `SELECT session_id, part_number, bytes, sha256, etag
           FROM multipart_part WHERE session_id = ? ORDER BY part_number`,
        sessionId
      )
      .toArray()
      .map(multipartPartRecord)
    if (parts.length === 0 || parts.some((part) => part.etag === null)) {
      return failure(
        409,
        "multipart_incomplete",
        "Multipart upload has incomplete parts"
      )
    }
    return ok(parts)
  }

  async completeMultipartUpload(
    slug: string,
    versionId: string,
    sessionId: string,
    bytes: string,
    sha256: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<ContentObjectRecord>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "completeMultipartUpload",
      inputSha256,
      () => {
        const version = this.version(slug, versionId)
        const session = this.multipartSessionById(sessionId)
        if (
          version === null ||
          session === null ||
          session.version_id !== versionId
        ) {
          return failure(
            404,
            "multipart_not_found",
            "Multipart upload not found"
          )
        }
        const object = this.contentObject(sha256)
        if (
          object === null ||
          session.sha256 !== sha256 ||
          object.bytes !== bytes ||
          !this.versionReferencesObject(versionId, sha256)
        ) {
          return failure(
            409,
            "source_upload_conflict",
            "Completed object does not match the manifest"
          )
        }
        if (object.state === "ready" && session.state === "completed")
          return ok(contentObjectRecord(object))
        if (version.state !== "uploading" || session.state !== "uploading") {
          return failure(
            409,
            "multipart_not_uploading",
            "Multipart upload cannot be completed"
          )
        }
        this.ctx.storage.sql.exec(
          "UPDATE multipart_upload SET state = 'completed' WHERE session_id = ?",
          sessionId
        )
        this.ctx.storage.sql.exec(
          `UPDATE content_object
              SET state = 'ready', ready_at = ?
            WHERE sha256 = ? AND state = 'pending'`,
          new Date().toISOString(),
          sha256
        )
        this.addSourceUsage(bytes)
        return ok(contentObjectRecord(this.requireContentObject(sha256)))
      }
    )
  }

  async markMultipartAborted(
    slug: string,
    versionId: string,
    sessionId: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<MultipartUploadSession>> {
    await this.ready
    return this.idempotent(
      idempotencyKey,
      "abortMultipartUpload",
      inputSha256,
      () => {
        const version = this.version(slug, versionId)
        const session = this.multipartSessionById(sessionId)
        if (
          version === null ||
          session === null ||
          session.version_id !== versionId
        ) {
          return failure(
            404,
            "multipart_not_found",
            "Multipart upload not found"
          )
        }
        if (session.state === "completed") {
          return failure(
            409,
            "multipart_completed",
            "Completed multipart upload cannot be aborted"
          )
        }
        if (session.state !== "aborted") {
          this.ctx.storage.sql.exec(
            "UPDATE multipart_upload SET state = 'aborted' WHERE session_id = ? AND state = 'uploading'",
            sessionId
          )
        }
        return ok(
          multipartSessionRecord(this.requireMultipartSessionById(sessionId))
        )
      }
    )
  }

  async beginValidation(
    versionId: string
  ): Promise<DurableResult<PublicationVersionRecord>> {
    await this.ready
    return this.transition(versionId, ["uploaded", "validating"], "validating")
  }

  async recordValidation(
    versionId: string,
    receipt: ValidationReceipt
  ): Promise<DurableResult<PublicationVersionRecord>> {
    await this.ready
    const row = this.versionById(versionId)
    if (row === null)
      return failure(404, "version_not_found", "Publication Version not found")
    if (
      row.state === "preparing" &&
      row.validation_receipt_json === JSON.stringify(receipt)
    )
      return ok(versionRecord(row))
    if (row.state !== "validating")
      return failure(
        409,
        "invalid_version_transition",
        "Version is not validating"
      )
    if (
      !receipt.valid ||
      receipt.sourceManifestSha256 !== row.source_manifest_sha256 ||
      receipt.driverId !== row.driver_id ||
      receipt.driverVersion !== row.driver_version
    ) {
      return failure(
        409,
        "invalid_validation_receipt",
        "Validation receipt does not match the Version"
      )
    }
    this.ctx.storage.sql.exec(
      "UPDATE publication_version SET state = 'preparing', validation_receipt_json = ? WHERE version_id = ?",
      JSON.stringify(receipt),
      versionId
    )
    return ok(versionRecord(this.requireVersionById(versionId)))
  }

  async reserveStaticArtifacts(
    versionId: string,
    artifacts: StaticArtifactRecord[]
  ): Promise<DurableResult<StaticArtifactRecord[]>> {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const version = this.versionById(versionId)
      if (version === null) {
        return failure(
          404,
          "version_not_found",
          "Publication Version not found"
        )
      }
      if (
        version.state !== "preparing" ||
        (version.driver_id !== "org.eidos.driver.markdown" &&
          version.driver_id !== "org.eidos.driver.form")
      ) {
        return failure(
          409,
          "invalid_version_transition",
          "Version is not preparing a static target"
        )
      }
      if (artifacts.length !== 1 || artifacts[0]?.path !== "index.html") {
        return failure(
          400,
          "invalid_artifact_manifest",
          "Static Driver must produce index.html"
        )
      }
      const artifact = artifacts[0]
      if (
        artifact.state !== "pending" ||
        artifact.mediaType !== "text/html; charset=utf-8" ||
        !/^(?:0|[1-9][0-9]*)$/.test(artifact.bytes) ||
        !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
        artifact.objectKey.length === 0
      ) {
        return failure(
          400,
          "invalid_artifact_manifest",
          "Static artifact descriptor is invalid"
        )
      }
      const existing = this.versionArtifacts(versionId)
      if (existing.length > 0) {
        return existing.length === 1 &&
          existing[0]?.path === artifact.path &&
          existing[0].bytes === artifact.bytes &&
          existing[0].sha256 === artifact.sha256 &&
          existing[0].media_type === artifact.mediaType &&
          existing[0].object_key === artifact.objectKey
          ? ok(existing.map(staticArtifactRecord))
          : failure(
              409,
              "artifact_conflict",
              "Version already reserved different artifacts"
            )
      }
      if (
        this.storageBytes() + BigInt(artifact.bytes) >
        BigInt(this.currentAccess().maxStorageBytes)
      ) {
        return failure(
          403,
          "storage_limit_reached",
          "Publish storage limit reached"
        )
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO version_artifact (
           version_id, path, bytes, sha256, media_type, object_key, state
         ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        versionId,
        artifact.path,
        artifact.bytes,
        artifact.sha256,
        artifact.mediaType,
        artifact.objectKey
      )
      this.addArtifactUsage(artifact.bytes)
      this.addBuildUsage()
      return ok(this.versionArtifacts(versionId).map(staticArtifactRecord))
    })
  }

  async markStaticArtifactsReady(
    versionId: string
  ): Promise<DurableResult<StaticArtifactRecord[]>> {
    await this.ready
    const version = this.versionById(versionId)
    const artifacts = this.versionArtifacts(versionId)
    if (
      version === null ||
      version.state !== "preparing" ||
      artifacts.length !== 1
    ) {
      return failure(
        409,
        "invalid_version_transition",
        "Static artifacts are not reserved"
      )
    }
    this.ctx.storage.sql.exec(
      "UPDATE version_artifact SET state = 'ready' WHERE version_id = ? AND state = 'pending'",
      versionId
    )
    return ok(this.versionArtifacts(versionId).map(staticArtifactRecord))
  }

  async markReady(
    versionId: string,
    target: ServingTarget,
    targetSha256: string,
    receipt: ReadyReceipt
  ): Promise<DurableResult<PublicationVersionRecord>> {
    await this.ready
    const row = this.versionById(versionId)
    if (row === null)
      return failure(404, "version_not_found", "Publication Version not found")
    if (row.state === "ready") {
      return row.serving_target_sha256 === targetSha256
        ? ok(versionRecord(row))
        : failure(
            409,
            "ready_target_conflict",
            "Version already has a different target"
          )
    }
    if (row.state !== "preparing")
      return failure(
        409,
        "invalid_version_transition",
        "Version is not preparing"
      )
    if (
      (target.kind === "runtime" &&
        target.sourceManifestSha256 !== row.source_manifest_sha256) ||
      receipt.sourceManifestSha256 !== row.source_manifest_sha256 ||
      receipt.driverId !== row.driver_id ||
      receipt.driverVersion !== row.driver_version ||
      receipt.servingTargetSha256 !== targetSha256
    ) {
      return failure(
        409,
        "invalid_ready_receipt",
        "Ready receipt does not match the Version"
      )
    }
    if (
      target.kind === "static" &&
      !this.versionArtifacts(versionId).some(
        (artifact) =>
          artifact.path === target.entrypoint && artifact.state === "ready"
      )
    ) {
      return failure(
        409,
        "artifact_not_ready",
        "Static target artifact is not ready"
      )
    }
    this.ctx.storage.sql.exec(
      `UPDATE publication_version
          SET state = 'ready', serving_target_json = ?, serving_target_sha256 = ?,
              ready_receipt_json = ?, target_health = 'healthy', target_health_reason = NULL
        WHERE version_id = ?`,
      JSON.stringify(target),
      targetSha256,
      JSON.stringify(receipt),
      versionId
    )
    return ok(versionRecord(this.requireVersionById(versionId)))
  }

  async markTargetUnhealthy(versionId: string, reason: string): Promise<void> {
    await this.ready
    this.ctx.storage.sql.exec(
      `UPDATE publication_version
          SET target_health = 'unhealthy', target_health_reason = ?
        WHERE version_id = ? AND state != 'deleted'`,
      reason.slice(0, 80),
      versionId
    )
  }

  async markFailed(
    versionId: string,
    step: string,
    code: string,
    retryable = false,
    failedAt = new Date().toISOString()
  ): Promise<void> {
    await this.ready
    this.ctx.storage.transactionSync(() => {
      const version = this.versionById(versionId)
      if (
        version === null ||
        version.state === "ready" ||
        version.state === "deleting" ||
        version.state === "deleted"
      ) {
        return
      }
      const boundedStep = step.slice(0, 80)
      const boundedCode = code.slice(0, 80)
      this.ctx.storage.sql.exec(
        `UPDATE publication_version SET state = 'failed', failure_step = ?, failure_code = ?
          WHERE version_id = ?`,
        boundedStep,
        boundedCode,
        versionId
      )
      const attempt =
        this.ctx.storage.sql
          .exec<CountRow>(
            "SELECT count(*) AS count FROM version_failure_event WHERE version_id = ?",
            versionId
          )
          .one().count + 1
      this.ctx.storage.sql.exec(
        `INSERT INTO version_failure_event (
           failure_id, job_id, version_id, attempt, step, code, retryable, failed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        version.job_id,
        versionId,
        attempt,
        boundedStep,
        boundedCode,
        retryable ? 1 : 0,
        failedAt
      )
    })
  }

  async getVersionFailureEvents(
    versionId: string
  ): Promise<VersionFailureEvent[]> {
    await this.ready
    return this.ctx.storage.sql
      .exec<FailureEventRow>(
        `SELECT job_id, version_id, attempt, step, code, retryable, failed_at
           FROM version_failure_event WHERE version_id = ? ORDER BY attempt`,
        versionId
      )
      .toArray()
      .map(failureEventRecord)
  }

  async getVersionLifecycleEvents(
    versionId: string
  ): Promise<VersionLifecycleEvent[]> {
    await this.ready
    return this.ctx.storage.sql
      .exec<LifecycleEventRow>(
        `SELECT version_id, event_type, actor, request_id, reason, occurred_at
           FROM version_lifecycle_event WHERE version_id = ? ORDER BY occurred_at, event_id`,
        versionId
      )
      .toArray()
      .map(lifecycleEventRecord)
  }

  async activateVersion(
    slug: string,
    versionId: string,
    actor: string,
    requestId: string,
    access: PublishAccessGrant | null,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<ActivationResult>> {
    await this.ready
    const result = this.idempotent<ActivationResult>(
      idempotencyKey,
      "activateVersion",
      inputSha256,
      () => {
        const publication = this.publication(slug)
        const version = this.version(slug, versionId)
        if (publication === null || version === null)
          return failure(
            404,
            "version_not_found",
            "Publication Version not found"
          )
        if (version.state !== "ready")
          return failure(
            409,
            "version_not_ready",
            "Publication Version is not ready"
          )
        const effectiveAccess = access ?? this.currentAccess()
        if (effectiveAccess.state !== "active")
          return failure(
            403,
            "publish_access_suspended",
            "Publish access is suspended"
          )
        const publicationAccess = this.publicationAccess(
          publication.publication_id
        )
        if (
          publicationAccess !== null &&
          publicationAccess.mode !== "public" &&
          !effectiveAccess.privatePublications
        ) {
          return failure(
            403,
            "restricted_publication_not_allowed",
            "Current plan does not allow password-protected or private publications"
          )
        }
        const existing = this.activationByRequest(
          publication.publication_id,
          requestId
        )
        if (existing !== null) return ok(activationRecord(existing))
        const activatedAt = new Date().toISOString()
        this.ctx.storage.sql.exec(
          "UPDATE publication SET current_version_id = ? WHERE publication_id = ?",
          versionId,
          publication.publication_id
        )
        this.ctx.storage.sql.exec(
          `INSERT INTO activation_event (
             event_id, publication_id, from_version_id, to_version_id, actor, request_id, activated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          publication.publication_id,
          publication.current_version_id,
          versionId,
          actor,
          requestId,
          activatedAt
        )
        return ok({
          publicationId: publication.publication_id,
          fromVersionId: publication.current_version_id,
          toVersionId: versionId,
          activatedAt,
          requestId,
        })
      }
    )
    if (result.ok) await this.scheduleRetention()
    return result
  }

  override async alarm(): Promise<void> {
    await this.runRetention(new Date().toISOString())
  }

  async runRetention(nowInstant = new Date().toISOString()): Promise<void> {
    await this.ready
    const tenant = this.tenant()
    if (tenant === null) return
    const access = this.currentAccess()
    const now = new Date(nowInstant)
    if (!Number.isFinite(now.getTime()))
      throw new Error("invalid retention instant")
    const graceCutoff = new Date(now.getTime() - 10 * 60_000).toISOString()
    const retentionCutoff = new Date(
      now.getTime() - access.retentionDays * 24 * 60 * 60_000
    ).toISOString()
    const abandonedCutoff = new Date(
      now.getTime() - 24 * 60 * 60_000
    ).toISOString()
    for (const publication of this.ctx.storage.sql
      .exec<PublicationRow>(
        `SELECT publication_id, slug, visibility, current_version_id, created_at
           FROM publication`
      )
      .toArray()) {
      const versions = this.ctx.storage.sql
        .exec<VersionRow>(
          VERSION_SELECT +
            " WHERE versions.publication_id = ? AND versions.state != 'deleted'" +
            " ORDER BY versions.created_at DESC, versions.version_id DESC",
          publication.publication_id
        )
        .toArray()
        .filter(
          (version) => version.version_id !== publication.current_version_id
        )
      const deactivations = this.ctx.storage.sql
        .exec<VersionDeactivationRow>(
          `SELECT from_version_id AS version_id,
                  max(activated_at) AS deactivated_at
             FROM activation_event
            WHERE publication_id = ? AND from_version_id IS NOT NULL
            GROUP BY from_version_id`,
          publication.publication_id
        )
        .toArray()
      const deactivatedAt = new Map(
        deactivations.map((row) => [row.version_id, row.deactivated_at])
      )
      const previousVersionId =
        publication.current_version_id === null
          ? null
          : (this.ctx.storage.sql
              .exec<PreviousVersionRow>(
                `SELECT from_version_id
                   FROM activation_event
                  WHERE publication_id = ? AND to_version_id = ?
                  ORDER BY activated_at DESC, rowid DESC
                  LIMIT 1`,
                publication.publication_id,
                publication.current_version_id
              )
              .toArray()[0]?.from_version_id ?? null)
      for (const version of versions) {
        const retryDeletion = version.state === "deleting"
        const deactivated = deactivatedAt.get(version.version_id)
        const ageAnchor = deactivated ?? version.created_at
        const beyondAge =
          ageAnchor <=
          (deactivated === undefined ? abandonedCutoff : retentionCutoff)
        const beyondFreeHistory =
          access.plan === "free" &&
          deactivated !== undefined &&
          version.version_id !== previousVersionId
        const graceElapsed = ageAnchor <= graceCutoff
        if (
          !retryDeletion &&
          (!graceElapsed || (!beyondAge && !beyondFreeHistory))
        )
          continue
        const current = this.publication(publication.slug)?.current_version_id
        if (current === version.version_id) continue
        const deletionContext = retryDeletion
          ? this.deletionContext(version.version_id)
          : null
        await this.deleteVersionResources(
          version,
          deletionContext?.actor ?? "system:retention",
          deletionContext?.request_id ?? `retention:${version.version_id}`,
          deletionContext?.reason ?? "retention"
        )
      }
    }
    const remaining = this.ctx.storage.sql
      .exec<CountRow>(
        `SELECT count(*) AS count
           FROM publication_version AS versions
           JOIN publication ON publication.publication_id = versions.publication_id
          WHERE versions.state != 'deleted'
            AND versions.version_id IS NOT publication.current_version_id`
      )
      .one().count
    if (remaining > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 24 * 60 * 60_000)
    }
  }

  async beginVersionDeletion(
    slug: string,
    versionId: string,
    actor: string,
    requestId: string,
    idempotencyKey: string,
    inputSha256: string
  ): Promise<DurableResult<VersionDeletionPlan>> {
    await this.ready
    return this.idempotent(idempotencyKey, "deleteVersion", inputSha256, () => {
      const publication = this.publication(slug)
      const version = this.version(slug, versionId)
      if (publication === null || version === null) {
        return failure(
          404,
          "version_not_found",
          "Publication Version not found"
        )
      }
      if (publication.current_version_id === versionId) {
        return failure(
          409,
          "current_version_delete_forbidden",
          "Current Version cannot be deleted"
        )
      }
      if (version.state !== "deleted" && version.state !== "deleting") {
        this.ctx.storage.sql.exec(
          "UPDATE publication_version SET state = 'deleting' WHERE version_id = ?",
          versionId
        )
      }
      this.recordLifecycleEvent(
        versionId,
        "deletion_started",
        actor,
        requestId,
        "user"
      )
      return ok({
        versionId,
        objectKeys: [
          version.source_manifest_key,
          ...this.ctx.storage.sql
            .exec<ContentObjectRow>(
              `SELECT DISTINCT objects.sha256, objects.bytes,
                               objects.media_type, objects.object_key,
                               objects.state, objects.reference_count
                 FROM version_file AS files
                 JOIN content_object AS objects
                   ON objects.sha256 = files.sha256
                WHERE files.version_id = ? AND objects.reference_count = 1`,
              versionId
            )
            .toArray()
            .map((object) => object.object_key),
          ...this.versionArtifacts(versionId).map(
            (artifact) => artifact.object_key
          ),
          ...this.staticTargetObjectKeys(version),
        ],
        state: version.state === "deleted" ? "deleted" : "deleting",
      })
    })
  }

  async reconcileActivation(
    publicationId: string,
    versionId: string,
    requestId: string
  ): Promise<DurableResult<ActivationResult>> {
    await this.ready
    const event = this.activationByRequest(publicationId, requestId)
    const publication = this.ctx.storage.sql
      .exec<PublicationRow>(
        `SELECT publication_id, slug, visibility, current_version_id, created_at
           FROM publication WHERE publication_id = ?`,
        publicationId
      )
      .toArray()[0]
    return event !== null &&
      event.to_version_id === versionId &&
      publication?.current_version_id === versionId
      ? ok(activationRecord(event))
      : failure(409, "activation_not_committed", "Activation was not committed")
  }

  async completeVersionDeletion(versionId: string): Promise<void> {
    await this.ready
    this.ctx.storage.sql.exec(
      "UPDATE publication_version SET state = 'deleted' WHERE version_id = ? AND state = 'deleting'",
      versionId
    )
  }

  async executeVersionDeletion(
    versionId: string,
    actor: string,
    requestId: string
  ): Promise<void> {
    await this.ready
    const version = this.versionById(versionId)
    if (version === null || version.state === "deleted") return
    if (version.state !== "deleting") {
      throw new Error("Version deletion was not authorized")
    }
    await this.deleteVersionResources(version, actor, requestId, "user")
  }

  async resolvePublication(slug: string): Promise<
    DurableResult<{
      ownerUserId: string
      canonicalHandle: string | null
      runtimeIdleSeconds: number
      accessCheckedAt: string
      publication: PublicationRecord
      formPolicy: FormPublicationPolicy
      version: PublicationVersionRecord
      staticArtifact: StaticArtifactRecord | null
    }>
  > {
    await this.ready
    const tenant = this.tenant()
    const publication = this.publication(slug)
    if (
      tenant === null ||
      tenant.status !== "active" ||
      publication === null ||
      publication.current_version_id === null
    ) {
      return failure(404, "publication_not_found", "Publication not found")
    }
    const version = this.version(slug, publication.current_version_id)
    if (version === null || version.state !== "ready")
      return failure(404, "publication_not_found", "Publication not found")
    const resolvedVersion = versionRecord(version)
    const target = resolvedVersion.servingTarget
    return ok({
      ownerUserId: tenant.owner_user_id,
      canonicalHandle: tenant.plan === "pro" ? tenant.active_handle : null,
      runtimeIdleSeconds: this.currentAccess().runtimeIdleSeconds,
      accessCheckedAt: tenant.access_checked_at,
      publication: this.publicationRecord(publication),
      formPolicy: this.publicationFormPolicy(publication.publication_id),
      version: resolvedVersion,
      staticArtifact:
        target?.kind === "static"
          ? this.publishedArtifact(version.version_id, target.entrypoint)
          : null,
    })
  }

  async resolvePublicationById(publicationId: string): Promise<
    DurableResult<{
      publication: PublicationRecord
      formPolicy: FormPublicationPolicy
      version: PublicationVersionRecord
    }>
  > {
    await this.ready
    const publication = this.ctx.storage.sql
      .exec<PublicationRow>(
        `SELECT publication_id, slug, visibility, current_version_id, created_at
           FROM publication WHERE publication_id = ?`,
        publicationId
      )
      .toArray()[0]
    if (publication?.current_version_id === null || publication === undefined) {
      return failure(404, "form_not_found", "Published Form not found")
    }
    const version = this.version(
      publication.slug,
      publication.current_version_id
    )
    if (
      version === null ||
      version.state !== "ready" ||
      version.driver_id !== "org.eidos.driver.form"
    ) {
      return failure(404, "form_not_found", "Published Form not found")
    }
    return ok({
      publication: this.publicationRecord(publication),
      formPolicy: this.publicationFormPolicy(publication.publication_id),
      version: versionRecord(version),
    })
  }

  private transition(
    versionId: string,
    accepted: PublicationVersionRecord["state"][],
    next: PublicationVersionRecord["state"]
  ): DurableResult<PublicationVersionRecord> {
    const row = this.versionById(versionId)
    if (row === null)
      return failure(404, "version_not_found", "Publication Version not found")
    if (row.state === next) return ok(versionRecord(row))
    if (!accepted.includes(row.state))
      return failure(
        409,
        "invalid_version_transition",
        "Invalid Version state transition"
      )
    this.ctx.storage.sql.exec(
      "UPDATE publication_version SET state = ? WHERE version_id = ?",
      next,
      versionId
    )
    return ok(versionRecord(this.requireVersionById(versionId)))
  }

  private idempotent<T>(
    key: string,
    operation: string,
    inputSha256: string,
    mutation: () => DurableResult<T>
  ): DurableResult<T> {
    return this.ctx.storage.transactionSync(() => {
      const prior = this.ctx.storage.sql
        .exec<IdempotencyRow>(
          "SELECT operation, input_sha256, result_json FROM idempotency_record WHERE idempotency_key = ?",
          key
        )
        .toArray()[0]
      if (prior !== undefined) {
        if (
          prior.operation !== operation ||
          prior.input_sha256 !== inputSha256
        ) {
          return failure(
            409,
            "idempotency_conflict",
            "Idempotency key was used with different input"
          )
        }
        return parseJson<DurableResult<T>>(prior.result_json)
      }
      const result = mutation()
      this.ctx.storage.sql.exec(
        `INSERT INTO idempotency_record (
           idempotency_key, operation, input_sha256, result_json, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
        key,
        operation,
        inputSha256,
        JSON.stringify(result),
        new Date().toISOString()
      )
      return result
    })
  }

  private currentAccess(): PublishAccessGrant {
    const tenant = this.tenant()
    if (tenant === null) throw new Error("tenant is not initialized")
    return parseJson<PublishAccessGrant>(tenant.access_json)
  }

  private async scheduleRetention(): Promise<void> {
    const candidate = Date.now() + 10 * 60_000
    const existing = await this.ctx.storage.getAlarm()
    if (existing === null || existing > candidate) {
      await this.ctx.storage.setAlarm(candidate)
    }
  }

  private async deleteVersionResources(
    version: VersionRow,
    actor: string,
    requestId: string,
    reason: "user" | "retention"
  ): Promise<void> {
    this.recordLifecycleEvent(
      version.version_id,
      "deletion_started",
      actor,
      requestId,
      reason
    )
    this.ctx.storage.sql.exec(
      "UPDATE publication_version SET state = 'deleting' WHERE version_id = ? AND state != 'deleted'",
      version.version_id
    )
    const multipart = this.multipartSessions(version.version_id)
    for (const session of multipart) {
      if (session.state !== "uploading") continue
      await this.bindings.PUBLISH_OBJECTS.resumeMultipartUpload(
        session.object_key,
        session.upload_id
      ).abort()
      this.ctx.storage.sql.exec(
        "UPDATE multipart_upload SET state = 'aborted' WHERE session_id = ? AND state = 'uploading'",
        session.session_id
      )
    }
    const objects = this.ctx.storage.sql
      .exec<ContentObjectRow>(
        `SELECT DISTINCT objects.sha256, objects.bytes, objects.media_type,
                         objects.object_key, objects.state,
                         objects.reference_count
           FROM version_file AS files
           JOIN content_object AS objects ON objects.sha256 = files.sha256
          WHERE files.version_id = ?`,
        version.version_id
      )
      .toArray()
    const artifacts = this.versionArtifacts(version.version_id)
    await this.bindings.PUBLISH_OBJECTS.delete([
      version.source_manifest_key,
      ...objects
        .filter((object) => object.reference_count === 1)
        .map((object) => object.object_key),
      ...artifacts.map((artifact) => artifact.object_key),
      ...this.staticTargetObjectKeys(version),
    ])
    const orchestrationMode: string = this.bindings.ORCHESTRATION_MODE
    if (orchestrationMode !== "control-only-test") {
      const target = nullableJson<ServingTarget>(version.serving_target_json)
      const tenant = this.tenant()
      try {
        if (tenant !== null && target?.kind === "runtime") {
          await this.bindings.EIDOS_RUNTIMES.getByName(
            target.instanceKey
          ).retireVersion(version.version_id)
        }
      } catch {
        // Shared Runtime cache is disposable and may already have been retired.
      }
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "DELETE FROM version_asset_reference WHERE version_id = ?",
        version.version_id
      )
      this.ctx.storage.sql.exec(
        "DELETE FROM version_artifact WHERE version_id = ?",
        version.version_id
      )
      this.ctx.storage.sql.exec(
        "DELETE FROM version_file WHERE version_id = ?",
        version.version_id
      )
      for (const session of multipart) {
        this.ctx.storage.sql.exec(
          "DELETE FROM multipart_part WHERE session_id = ?",
          session.session_id
        )
      }
      this.ctx.storage.sql.exec(
        "DELETE FROM multipart_upload WHERE version_id = ?",
        version.version_id
      )
      for (const object of objects) {
        if (object.reference_count === 1) {
          this.ctx.storage.sql.exec(
            "DELETE FROM content_object WHERE sha256 = ? AND reference_count = 1",
            object.sha256
          )
        } else {
          this.ctx.storage.sql.exec(
            `UPDATE content_object SET reference_count = reference_count - 1
              WHERE sha256 = ? AND reference_count > 1`,
            object.sha256
          )
        }
      }
      this.ctx.storage.sql.exec(
        "UPDATE publication_version SET state = 'deleted' WHERE version_id = ? AND state = 'deleting'",
        version.version_id
      )
    })
    this.recordLifecycleEvent(
      version.version_id,
      "deletion_completed",
      actor,
      requestId,
      reason
    )
  }

  private recordLifecycleEvent(
    versionId: string,
    eventType: "deletion_started" | "deletion_completed",
    actor: string,
    requestId: string,
    reason: "user" | "retention"
  ): void {
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO version_lifecycle_event (
         event_id, version_id, event_type, actor, request_id, reason, occurred_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      versionId,
      eventType,
      actor.slice(0, 256),
      requestId.slice(0, 128),
      reason,
      new Date().toISOString()
    )
  }

  private deletionContext(versionId: string): LifecycleEventRow | null {
    return (
      this.ctx.storage.sql
        .exec<LifecycleEventRow>(
          `SELECT version_id, event_type, actor, request_id, reason, occurred_at
           FROM version_lifecycle_event
          WHERE version_id = ? AND event_type = 'deletion_started'
          ORDER BY occurred_at DESC LIMIT 1`,
          versionId
        )
        .toArray()[0] ?? null
    )
  }

  private reserveRuntimeStart(
    usage: UsagePeriodRow,
    access: PublishAccessGrant,
    versionId: string,
    reservationKey: string,
    now: string
  ): DurableResult<UsagePeriodRecord> {
    if (access.state !== "active") {
      return failure(
        403,
        "publish_access_suspended",
        "Publish access is suspended"
      )
    }
    const circuit = this.ctx.storage.sql
      .exec<CircuitRow>(
        `SELECT consecutive_failures, first_failure_at, opened_until
           FROM runtime_circuit WHERE version_id = ?`,
        versionId
      )
      .toArray()[0]
    if (
      circuit?.opened_until !== null &&
      circuit?.opened_until !== undefined &&
      circuit.opened_until > now
    ) {
      return failure(
        503,
        "runtime_unavailable",
        "Runtime start circuit is open"
      )
    }
    const reservedSeconds = access.runtimeIdleSeconds
    if (
      usage.runtime_starts >= access.runtimeStartsPerPeriod ||
      BigInt(usage.runtime_active_seconds) + BigInt(reservedSeconds) >
        BigInt(access.runtimeSecondsPerPeriod)
    ) {
      return failure(429, "quota_exceeded", "Runtime budget is exhausted")
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO runtime_start_reservation (
         reservation_key, period, reserved_seconds, reserved_at
       ) VALUES (?, ?, ?, ?)`,
      reservationKey,
      usage.period,
      reservedSeconds,
      now
    )
    this.ctx.storage.sql.exec(
      `UPDATE usage_period
          SET runtime_starts = runtime_starts + 1,
              runtime_active_seconds = ?
        WHERE period = ?`,
      (
        BigInt(usage.runtime_active_seconds) + BigInt(reservedSeconds)
      ).toString(),
      usage.period
    )
    return ok(usagePeriodRecord(this.requireUsagePeriod(usage.period)))
  }

  private addSourceUsage(bytes: string, now = new Date().toISOString()): void {
    const period = usagePeriod(now)
    const usage = this.ensureUsagePeriod(period, now)
    this.ctx.storage.sql.exec(
      "UPDATE usage_period SET source_bytes = ? WHERE period = ?",
      (BigInt(usage.source_bytes) + BigInt(bytes)).toString(),
      period
    )
  }

  private addArtifactUsage(
    bytes: string,
    now = new Date().toISOString()
  ): void {
    const period = usagePeriod(now)
    const usage = this.ensureUsagePeriod(period, now)
    this.ctx.storage.sql.exec(
      "UPDATE usage_period SET artifact_bytes = ? WHERE period = ?",
      (BigInt(usage.artifact_bytes) + BigInt(bytes)).toString(),
      period
    )
  }

  private addBuildUsage(now = new Date().toISOString()): void {
    const period = usagePeriod(now)
    this.ensureUsagePeriod(period, now)
    this.ctx.storage.sql.exec(
      "UPDATE usage_period SET builds = builds + 1 WHERE period = ?",
      period
    )
  }

  private ensureUsagePeriod(period: string, now: string): UsagePeriodRow {
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO usage_period (
         period, source_bytes, artifact_bytes, runtime_active_seconds,
         runtime_starts, builds, requests, reconciled_at
       ) VALUES (?, '0', '0', '0', 0, 0, 0, ?)`,
      period,
      now
    )
    return this.requireUsagePeriod(period)
  }

  private requireUsagePeriod(period: string): UsagePeriodRow {
    return this.ctx.storage.sql
      .exec<UsagePeriodRow>(
        `SELECT period, source_bytes, artifact_bytes, runtime_active_seconds,
                runtime_starts, builds, requests, reconciled_at
           FROM usage_period WHERE period = ?`,
        period
      )
      .one()
  }

  private storageBytes(): bigint {
    const sourceBytes = this.ctx.storage.sql
      .exec<ContentObjectRow>(
        `SELECT sha256, bytes, media_type, object_key, state, reference_count
           FROM content_object WHERE reference_count > 0`
      )
      .toArray()
      .reduce((total, object) => total + BigInt(object.bytes), 0n)
    const artifactBytes = this.ctx.storage.sql
      .exec<VersionArtifactRow>(
        `SELECT version_id, path, bytes, sha256, media_type, object_key, state
           FROM version_artifact`
      )
      .toArray()
      .reduce((total, artifact) => total + BigInt(artifact.bytes), 0n)
    return sourceBytes + artifactBytes
  }

  private versionArtifacts(versionId: string): VersionArtifactRow[] {
    return this.ctx.storage.sql
      .exec<VersionArtifactRow>(
        `SELECT version_id, path, bytes, sha256, media_type, object_key, state
           FROM version_artifact WHERE version_id = ? ORDER BY path`,
        versionId
      )
      .toArray()
  }

  private publishedArtifact(
    versionId: string,
    path: string
  ): StaticArtifactRecord | null {
    const row = this.ctx.storage.sql
      .exec<VersionArtifactRow>(
        `SELECT version_id, path, bytes, sha256, media_type, object_key, state
           FROM version_artifact
          WHERE version_id = ? AND path = ? AND state = 'ready'`,
        versionId,
        path
      )
      .toArray()[0]
    return row === undefined ? null : staticArtifactRecord(row)
  }

  private staticTargetObjectKeys(version: VersionRow): string[] {
    const target = nullableJson<ServingTarget>(version.serving_target_json)
    return target?.kind === "static" ? [target.artifactManifestKey] : []
  }

  private contentObject(sha256: string): ContentObjectRow | null {
    return (
      this.ctx.storage.sql
        .exec<ContentObjectRow>(
          `SELECT sha256, bytes, media_type, object_key, state, reference_count
             FROM content_object WHERE sha256 = ?`,
          sha256
        )
        .toArray()[0] ?? null
    )
  }

  private requireContentObject(sha256: string): ContentObjectRow {
    const object = this.contentObject(sha256)
    if (object === null) throw new Error("Content object disappeared")
    return object
  }

  private versionReferencesObject(versionId: string, sha256: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<CountRow>(
          `SELECT count(*) AS count FROM version_file
            WHERE version_id = ? AND sha256 = ?`,
          versionId,
          sha256
        )
        .one().count > 0
    )
  }

  private tenant(): TenantRow | null {
    return (
      this.ctx.storage.sql
        .exec<TenantRow>(
          `SELECT owner_user_id, public_site_id, plan, status, active_handle,
                access_json, access_revision, access_checked_at
           FROM tenant WHERE singleton = 1`
        )
        .toArray()[0] ?? null
    )
  }

  private publication(slug: string): PublicationRow | null {
    return (
      this.ctx.storage.sql
        .exec<PublicationRow>(
          `SELECT publication_id, slug, visibility, current_version_id, created_at
           FROM publication WHERE slug = ?`,
          slug
        )
        .toArray()[0] ?? null
    )
  }

  private publicationAccess(
    publicationId: string
  ): PublicationAccessRow | null {
    return (
      this.ctx.storage.sql
        .exec<PublicationAccessRow>(
          `SELECT publication_id, mode, credential_revision,
                  password_algorithm, password_iterations, password_salt,
                  password_hash, updated_at
             FROM publication_access WHERE publication_id = ?`,
          publicationId
        )
        .toArray()[0] ?? null
    )
  }

  private publicationFormPolicy(publicationId: string): FormPublicationPolicy {
    const row = this.ctx.storage.sql
      .exec<PublicationFormPolicyRow>(
        `SELECT publication_id, respondent_access, allow_multiple_responses,
                policy_revision, updated_at
           FROM publication_form_policy WHERE publication_id = ?`,
        publicationId
      )
      .toArray()[0]
    return row === undefined
      ? {
          respondentAccess: "anyone",
          allowMultipleResponses: true,
          revision: 0,
        }
      : {
          respondentAccess: row.respondent_access,
          allowMultipleResponses: row.allow_multiple_responses === 1,
          revision: row.policy_revision,
        }
  }

  private publicationBrandingPreference(publicationId: string): boolean {
    const row = this.ctx.storage.sql
      .exec<PublicationBrandingRow>(
        `SELECT publication_id, show_branding, updated_at
           FROM publication_branding WHERE publication_id = ?`,
        publicationId
      )
      .toArray()[0]
    return row === undefined || row.show_branding === 1
  }

  private publicationRecord(row: PublicationRow): PublicationRecord {
    const access = this.publicationAccess(row.publication_id)
    if (access === null) throw new Error("publication access policy is missing")
    return publicationRecord(
      row,
      access,
      !this.currentAccess().removeBranding ||
        this.publicationBrandingPreference(row.publication_id)
    )
  }

  private version(slug: string, versionId: string): VersionRow | null {
    return (
      this.ctx.storage.sql
        .exec<VersionRow>(
          VERSION_SELECT +
            " WHERE publication.slug = ? AND versions.version_id = ?",
          slug,
          versionId
        )
        .toArray()[0] ?? null
    )
  }

  private versionById(versionId: string): VersionRow | null {
    return (
      this.ctx.storage.sql
        .exec<VersionRow>(
          VERSION_SELECT + " WHERE versions.version_id = ?",
          versionId
        )
        .toArray()[0] ?? null
    )
  }

  private requireVersion(
    slug: string,
    versionId: string
  ): PublicationVersionRecord {
    const row = this.version(slug, versionId)
    if (row === null) throw new Error("Version disappeared")
    return versionRecord(row)
  }

  private requireVersionById(versionId: string): VersionRow {
    const row = this.versionById(versionId)
    if (row === null) throw new Error("Version disappeared")
    return row
  }

  private activationByRequest(
    publicationId: string,
    requestId: string
  ): ActivationRow | null {
    return (
      this.ctx.storage.sql
        .exec<ActivationRow>(
          `SELECT publication_id, from_version_id, to_version_id, request_id, activated_at
           FROM activation_event WHERE publication_id = ? AND request_id = ?`,
          publicationId,
          requestId
        )
        .toArray()[0] ?? null
    )
  }

  private multipartSession(
    versionId: string,
    sha256: string
  ): MultipartSessionRow | null {
    return (
      this.ctx.storage.sql
        .exec<MultipartSessionRow>(
          `SELECT session_id, version_id, sha256, object_key, upload_id, state
           FROM multipart_upload WHERE version_id = ? AND sha256 = ?`,
          versionId,
          sha256
        )
        .toArray()[0] ?? null
    )
  }

  private multipartSessions(versionId: string): MultipartSessionRow[] {
    return this.ctx.storage.sql
      .exec<MultipartSessionRow>(
        `SELECT session_id, version_id, sha256, object_key, upload_id, state
           FROM multipart_upload WHERE version_id = ?`,
        versionId
      )
      .toArray()
  }

  private multipartSessionById(sessionId: string): MultipartSessionRow | null {
    return (
      this.ctx.storage.sql
        .exec<MultipartSessionRow>(
          `SELECT session_id, version_id, sha256, object_key, upload_id, state
           FROM multipart_upload WHERE session_id = ?`,
          sessionId
        )
        .toArray()[0] ?? null
    )
  }

  private requireMultipartSession(
    versionId: string,
    sha256: string
  ): MultipartSessionRow {
    const row = this.multipartSession(versionId, sha256)
    if (row === null) throw new Error("Multipart session disappeared")
    return row
  }

  private requireMultipartSessionById(sessionId: string): MultipartSessionRow {
    const row = this.multipartSessionById(sessionId)
    if (row === null) throw new Error("Multipart session disappeared")
    return row
  }

  private multipartPart(
    sessionId: string,
    partNumber: number
  ): MultipartPartRow | null {
    return (
      this.ctx.storage.sql
        .exec<MultipartPartRow>(
          `SELECT session_id, part_number, bytes, sha256, etag
           FROM multipart_part WHERE session_id = ? AND part_number = ?`,
          sessionId,
          partNumber
        )
        .toArray()[0] ?? null
    )
  }

  private requireMultipartPart(
    sessionId: string,
    partNumber: number
  ): MultipartPartRow {
    const row = this.multipartPart(sessionId, partNumber)
    if (row === null) throw new Error("Multipart part disappeared")
    return row
  }
}

const VERSION_SELECT = `
  SELECT versions.version_id, versions.publication_id, versions.state,
         versions.job_id, versions.activate_on_ready, versions.source_manifest_key,
         versions.source_manifest_sha256, versions.source_bytes,
         versions.entrypoint_json, versions.entrypoint_object_key,
         versions.driver_id, versions.driver_version,
         versions.serving_target_json, versions.serving_target_sha256,
         versions.validation_receipt_json, versions.ready_receipt_json,
         versions.target_health, versions.target_health_reason,
         versions.failure_step, versions.failure_code, versions.created_at
    FROM publication_version AS versions
    JOIN publication ON publication.publication_id = versions.publication_id`

function randomPublicSiteId(): string {
  const random = new Uint8Array(16)
  crypto.getRandomValues(random)
  let suffix = ""
  for (const byte of random) suffix += PUBLIC_SITE_ALPHABET.charAt(byte & 31)
  return "u-" + suffix
}

function publicationRecord(
  row: PublicationRow,
  access: PublicationAccessRow,
  showBranding: boolean
): PublicationRecord {
  return {
    publicationId: row.publication_id,
    slug: row.slug,
    visibility: row.visibility,
    accessMode: access.mode,
    accessRevision: access.credential_revision,
    showBranding,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
  }
}

function versionRecord(row: VersionRow): PublicationVersionRecord {
  return {
    versionId: row.version_id,
    publicationId: row.publication_id,
    state: row.state,
    jobId: row.job_id,
    activateOnReady: row.activate_on_ready === 1,
    sourceManifestKey: row.source_manifest_key,
    sourceManifestSha256: row.source_manifest_sha256,
    sourceBytes: row.source_bytes,
    entrypoint: parseJson<SourceBundleFile>(row.entrypoint_json),
    entrypointObjectKey: row.entrypoint_object_key,
    driverId: row.driver_id,
    driverVersion: row.driver_version,
    servingTarget: nullableJson<ServingTarget>(row.serving_target_json),
    servingTargetSha256: row.serving_target_sha256,
    validationReceipt: nullableJson<ValidationReceipt>(
      row.validation_receipt_json
    ),
    readyReceipt: nullableJson<ReadyReceipt>(row.ready_receipt_json),
    targetHealth: row.target_health,
    targetHealthReason: row.target_health_reason,
    failureStep: row.failure_step,
    failureCode: row.failure_code,
    createdAt: row.created_at,
  }
}

function contentObjectUpload(row: ContentObjectRow): SourceObjectUpload {
  return {
    sha256: row.sha256,
    bytes: row.bytes,
    mediaType: row.media_type,
    state: row.state,
  }
}

function contentObjectRecord(row: ContentObjectRow): ContentObjectRecord {
  return { ...contentObjectUpload(row), objectKey: row.object_key }
}

function staticArtifactRecord(row: VersionArtifactRow): StaticArtifactRecord {
  return {
    path: row.path,
    sha256: row.sha256,
    bytes: row.bytes,
    mediaType: row.media_type,
    objectKey: row.object_key,
    state: row.state,
  }
}

function activationRecord(row: ActivationRow): ActivationResult {
  return {
    publicationId: row.publication_id,
    fromVersionId: row.from_version_id,
    toVersionId: row.to_version_id,
    requestId: row.request_id,
    activatedAt: row.activated_at,
  }
}

function multipartSessionRecord(
  row: MultipartSessionRow
): MultipartUploadSession {
  return {
    sessionId: row.session_id,
    versionId: row.version_id,
    sha256: row.sha256,
    objectKey: row.object_key,
    uploadId: row.upload_id,
    state: row.state,
  }
}

function multipartPartRecord(row: MultipartPartRow): MultipartPartRecord {
  return {
    sessionId: row.session_id,
    partNumber: row.part_number,
    bytes: row.bytes,
    sha256: row.sha256,
    etag: row.etag,
  }
}

function usagePeriodRecord(row: UsagePeriodRow): UsagePeriodRecord {
  return {
    period: row.period,
    sourceBytes: row.source_bytes,
    artifactBytes: row.artifact_bytes,
    runtimeActiveSeconds: row.runtime_active_seconds,
    runtimeStarts: row.runtime_starts,
    builds: row.builds,
    requests: row.requests,
    reconciledAt: row.reconciled_at,
  }
}

function failureEventRecord(row: FailureEventRow): VersionFailureEvent {
  return {
    jobId: row.job_id,
    versionId: row.version_id,
    attempt: row.attempt,
    step: row.step,
    code: row.code,
    retryable: row.retryable === 1,
    failedAt: row.failed_at,
  }
}

function lifecycleEventRecord(row: LifecycleEventRow): VersionLifecycleEvent {
  return {
    versionId: row.version_id,
    eventType: row.event_type,
    actor: row.actor,
    requestId: row.request_id,
    reason: row.reason,
    occurredAt: row.occurred_at,
  }
}

function usagePeriod(instant: string): string {
  const parsed = new Date(instant)
  if (!Number.isFinite(parsed.getTime()))
    throw new Error("Invalid usage instant")
  return parsed.toISOString().slice(0, 7)
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function nullableJson<T>(value: string | null): T | null {
  return value === null ? null : parseJson<T>(value)
}

function ok<T>(value: T): DurableResult<T> {
  return { ok: true, value }
}

function failure<T>(
  status: number,
  code: string,
  message: string
): DurableResult<T> {
  return { ok: false, error: { status, code, message } }
}
