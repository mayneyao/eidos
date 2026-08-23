import { DurableObject } from "cloudflare:workers"

import type {
  DurableResult,
  FormSubmissionRecord,
  PublishCollectLimits,
} from "./contracts"

interface FormStateRow extends Record<string, SqlStorageValue> {
  publication_id: string
  current_version_id: string
  accepting: number
  submission_revision: number
  next_sequence: number
  collector_id: string | null
  collector_generation: number
  updated_at: string
}

interface RevisionRow extends Record<string, SqlStorageValue> {
  publication_id: string
  version_id: string
  schema_fingerprint: string
  definition_sha256: string
  definition_json: string
  created_at: string
}

interface SubmissionRow extends Record<string, SqlStorageValue> {
  submission_id: string
  publication_id: string
  version_id: string
  state: "initiated" | "uploading" | "committed" | "leased" | "imported"
  sequence: number | null
  input_sha256: string
  payload_json: string
  payload_sha256: string
  schema_fingerprint: string
  payload_bytes: number
  attachment_bytes: string
  lease_generation: number | null
  lease_expires_at: string | null
  created_at: string
  committed_at: string | null
  imported_at: string | null
  purge_after: string | null
}

interface AttachmentRow extends Record<string, SqlStorageValue> {
  attachment_id: string
  submission_id: string
  field_id: string
  name: string
  media_type: string
  bytes: string
  sha256: string
  state: "pending" | "ready" | "promoted"
  temp_object_key: string
  object_key: string | null
}

interface IdempotencyRow extends Record<string, SqlStorageValue> {
  input_sha256: string
  submission_id: string
}

interface CountRow extends Record<string, SqlStorageValue> {
  count: number
}

interface SumRow extends Record<string, SqlStorageValue> {
  bytes: number
}

interface InboxStatsRow extends Record<string, SqlStorageValue> {
  pending_count: number
  imported_count: number
  oldest_pending_at: string | null
}

interface CleanupAttachmentRow extends Record<string, SqlStorageValue> {
  submission_id: string
  temp_object_key: string
  object_key: string | null
}

interface RateRow extends Record<string, SqlStorageValue> {
  request_count: number
}

export interface FormRevisionRegistration {
  publicationId: string
  versionId: string
  schemaFingerprint: string
  definitionSha256: string
  definitionJson: string
}

export interface FormInboxState {
  publicationId: string
  currentVersionId: string
  accepting: boolean
  submissionRevision: number
  collectorId: string | null
  collectorGeneration: number
}

export interface FormInboxStats {
  pendingCount: number
  importedCount: number
  inboxBytes: string
  oldestPendingAt: string | null
}

export interface FormSubmissionInitInput {
  submissionId: string
  publicationId: string
  versionId: string
  schemaFingerprint: string
  idempotencyKey: string
  inputSha256: string
  payload: Record<string, unknown>
  payloadSha256: string
  payloadBytes: number
  attachments: Array<{
    attachmentId: string
    fieldId: string
    name: string
    mediaType: string
    bytes: string
    sha256: string
    tempObjectKey: string
  }>
  limits: PublishCollectLimits
  clientHash: string
  now?: string
}

export interface FormSubmissionInitResult {
  submissionId: string
  state: FormSubmissionRecord["state"]
  attachments: Array<{
    attachmentId: string
    bytes: string
    sha256: string
    state: "pending" | "ready" | "promoted"
  }>
}

export interface FormAttachmentAuthorization {
  submissionId: string
  attachmentId: string
  bytes: string
  sha256: string
  mediaType: string
  tempObjectKey: string
  objectKey: string | null
  state: "pending" | "ready" | "promoted"
}

export class FormInboxDurableObject extends DurableObject<Env> {
  private readonly ready: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS form_inbox_schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS form_revision (
          publication_id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          schema_fingerprint TEXT NOT NULL,
          definition_sha256 TEXT NOT NULL,
          definition_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (publication_id, version_id)
        );
        CREATE TABLE IF NOT EXISTS form_state (
          publication_id TEXT PRIMARY KEY,
          current_version_id TEXT NOT NULL,
          accepting INTEGER NOT NULL DEFAULT 1 CHECK (accepting IN (0, 1)),
          submission_revision INTEGER NOT NULL DEFAULT 0 CHECK (submission_revision >= 0),
          next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
          collector_id TEXT,
          collector_generation INTEGER NOT NULL DEFAULT 0 CHECK (collector_generation >= 0),
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS submission (
          submission_id TEXT PRIMARY KEY,
          publication_id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('initiated', 'uploading', 'committed', 'leased', 'imported')),
          sequence INTEGER,
          input_sha256 TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          schema_fingerprint TEXT NOT NULL,
          payload_bytes INTEGER NOT NULL CHECK (payload_bytes >= 0),
          attachment_bytes TEXT NOT NULL,
          lease_generation INTEGER,
          lease_expires_at TEXT,
          created_at TEXT NOT NULL,
          committed_at TEXT,
          imported_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_form_submission_cursor
          ON submission (publication_id, state, sequence);
        CREATE INDEX IF NOT EXISTS idx_form_submission_created
          ON submission (publication_id, created_at);
        CREATE TABLE IF NOT EXISTS submission_attachment (
          attachment_id TEXT NOT NULL,
          submission_id TEXT NOT NULL REFERENCES submission(submission_id) ON DELETE RESTRICT,
          field_id TEXT NOT NULL,
          name TEXT NOT NULL,
          media_type TEXT NOT NULL,
          bytes TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'promoted')),
          temp_object_key TEXT NOT NULL UNIQUE,
          object_key TEXT,
          PRIMARY KEY (submission_id, attachment_id)
        );
        CREATE TABLE IF NOT EXISTS submission_idempotency (
          publication_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          input_sha256 TEXT NOT NULL,
          submission_id TEXT NOT NULL UNIQUE REFERENCES submission(submission_id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          PRIMARY KEY (publication_id, idempotency_key)
        );
        CREATE TABLE IF NOT EXISTS rate_window (
          publication_id TEXT NOT NULL,
          client_hash TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          request_count INTEGER NOT NULL CHECK (request_count >= 0),
          PRIMARY KEY (publication_id, client_hash, window_start)
        );
        INSERT OR IGNORE INTO form_inbox_schema_migrations (version, applied_at)
        VALUES (1, datetime('now'));
      `)
      const submissionColumns = this.ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(submission)")
        .toArray()
      if (!submissionColumns.some((column) => column.name === "purge_after")) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE submission ADD COLUMN purge_after TEXT"
        )
      }
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO form_inbox_schema_migrations (version, applied_at)
         VALUES (2, datetime('now'))`
      )
    })
  }

  async registerRevision(
    input: FormRevisionRegistration
  ): Promise<DurableResult<FormInboxState>> {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const now = new Date().toISOString()
      const definitionJson = input.definitionJson
      const existing = this.revision(input.publicationId, input.versionId)
      if (
        existing !== null &&
        (existing.definition_sha256 !== input.definitionSha256 ||
          existing.schema_fingerprint !== input.schemaFingerprint ||
          existing.definition_json !== definitionJson)
      ) {
        return failure(
          409,
          "form_definition_conflict",
          "Immutable Form revision already differs"
        )
      }
      if (existing === null) {
        this.ctx.storage.sql.exec(
          `INSERT INTO form_revision (
             publication_id, version_id, schema_fingerprint,
             definition_sha256, definition_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          input.publicationId,
          input.versionId,
          input.schemaFingerprint,
          input.definitionSha256,
          definitionJson,
          now
        )
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO form_state (
           publication_id, current_version_id, accepting, submission_revision,
           next_sequence, collector_id, collector_generation, updated_at
         ) VALUES (?, ?, 1, 0, 1, NULL, 0, ?)
         ON CONFLICT (publication_id) DO UPDATE SET
           current_version_id = excluded.current_version_id,
           updated_at = excluded.updated_at`,
        input.publicationId,
        input.versionId,
        now
      )
      return ok(stateRecord(this.requireState(input.publicationId)))
    })
  }

  async getState(
    publicationId: string
  ): Promise<DurableResult<FormInboxState>> {
    await this.ready
    const row = this.state(publicationId)
    return row === null
      ? failure(404, "form_not_found", "Published Form not found")
      : ok(stateRecord(row))
  }

  async getStats(
    publicationId: string
  ): Promise<DurableResult<FormInboxStats>> {
    await this.ready
    if (this.state(publicationId) === null) {
      return failure(404, "form_not_found", "Published Form not found")
    }
    const row = this.ctx.storage.sql
      .exec<InboxStatsRow>(
        `SELECT
           SUM(CASE WHEN state IN ('committed', 'leased') THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN state = 'imported' THEN 1 ELSE 0 END) AS imported_count,
           MIN(CASE WHEN state IN ('committed', 'leased') THEN committed_at END) AS oldest_pending_at
         FROM submission WHERE publication_id = ?`,
        publicationId
      )
      .toArray()[0]
    return ok({
      pendingCount: row?.pending_count ?? 0,
      importedCount: row?.imported_count ?? 0,
      inboxBytes: this.inboxBytes(publicationId),
      oldestPendingAt: row?.oldest_pending_at ?? null,
    })
  }

  async setPaused(
    publicationId: string,
    paused: boolean
  ): Promise<DurableResult<FormInboxState>> {
    await this.ready
    const row = this.state(publicationId)
    if (row === null)
      return failure(404, "form_not_found", "Published Form not found")
    const accepting = paused ? 0 : 1
    if (row.accepting !== accepting) {
      this.ctx.storage.sql.exec(
        `UPDATE form_state
            SET accepting = ?, submission_revision = submission_revision + 1,
                updated_at = ?
          WHERE publication_id = ?`,
        accepting,
        new Date().toISOString(),
        publicationId
      )
    }
    return ok(stateRecord(this.requireState(publicationId)))
  }

  async initializeSubmission(
    input: FormSubmissionInitInput
  ): Promise<DurableResult<FormSubmissionInitResult>> {
    await this.ready
    const result = this.ctx.storage.transactionSync(() => {
      const now = input.now ?? new Date().toISOString()
      const state = this.state(input.publicationId)
      if (state === null || state.accepting !== 1) {
        return failure(
          409,
          "form_not_accepting",
          "Form is not accepting responses"
        )
      }
      const revision = this.revision(input.publicationId, input.versionId)
      if (
        revision === null ||
        revision.schema_fingerprint !== input.schemaFingerprint
      ) {
        return failure(
          409,
          "form_version_stale",
          "Form revision is unavailable"
        )
      }
      const prior = this.ctx.storage.sql
        .exec<IdempotencyRow>(
          `SELECT input_sha256, submission_id
             FROM submission_idempotency
            WHERE publication_id = ? AND idempotency_key = ?`,
          input.publicationId,
          input.idempotencyKey
        )
        .toArray()[0]
      if (prior !== undefined) {
        if (prior.input_sha256 !== input.inputSha256) {
          return failure(
            409,
            "idempotency_conflict",
            "Idempotency key was already used with different input"
          )
        }
        return ok(this.submissionInitResult(prior.submission_id))
      }
      const windowStart = Math.floor(Date.parse(now) / 60_000)
      this.ctx.storage.sql.exec(
        "DELETE FROM rate_window WHERE window_start < ?",
        windowStart - 2
      )
      const rate = this.ctx.storage.sql
        .exec<RateRow>(
          `SELECT request_count FROM rate_window
            WHERE publication_id = ? AND client_hash = ? AND window_start = ?`,
          input.publicationId,
          input.clientHash,
          windowStart
        )
        .toArray()[0]
      if ((rate?.request_count ?? 0) >= 20) {
        return failure(
          429,
          "submission_limit_reached",
          "Submission rate limit reached"
        )
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO rate_window (
           publication_id, client_hash, window_start, request_count
         ) VALUES (?, ?, ?, 1)
         ON CONFLICT (publication_id, client_hash, window_start)
         DO UPDATE SET request_count = request_count + 1`,
        input.publicationId,
        input.clientHash,
        windowStart
      )
      const period = now.slice(0, 7)
      const count =
        this.ctx.storage.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM submission
            WHERE publication_id = ? AND substr(created_at, 1, 7) = ?`,
            input.publicationId,
            period
          )
          .toArray()[0]?.count ?? 0
      if (count >= input.limits.submissionsPerPeriod) {
        return failure(
          403,
          "submission_limit_reached",
          "Monthly submission limit reached"
        )
      }
      const attachmentBytes = input.attachments.reduce(
        (total, attachment) => total + BigInt(attachment.bytes),
        0n
      )
      const used = BigInt(this.inboxBytes())
      if (
        used + BigInt(input.payloadBytes) + attachmentBytes >
        BigInt(input.limits.maxInboxBytes)
      ) {
        return failure(
          403,
          "inbox_storage_limit_reached",
          "Form Inbox storage limit reached"
        )
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO submission (
           submission_id, publication_id, version_id, state, sequence,
           input_sha256, payload_json, payload_sha256, schema_fingerprint,
           payload_bytes, attachment_bytes, lease_generation, lease_expires_at,
           created_at, committed_at, imported_at, purge_after
         ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL)`,
        input.submissionId,
        input.publicationId,
        input.versionId,
        input.attachments.length > 0 ? "uploading" : "initiated",
        input.inputSha256,
        JSON.stringify(input.payload),
        input.payloadSha256,
        input.schemaFingerprint,
        input.payloadBytes,
        attachmentBytes.toString(),
        now
      )
      for (const attachment of input.attachments) {
        this.ctx.storage.sql.exec(
          `INSERT INTO submission_attachment (
             attachment_id, submission_id, field_id, name, media_type, bytes,
             sha256, state, temp_object_key, object_key
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
          attachment.attachmentId,
          input.submissionId,
          attachment.fieldId,
          attachment.name,
          attachment.mediaType,
          attachment.bytes,
          attachment.sha256,
          attachment.tempObjectKey
        )
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO submission_idempotency (
           publication_id, idempotency_key, input_sha256, submission_id, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
        input.publicationId,
        input.idempotencyKey,
        input.inputSha256,
        input.submissionId,
        now
      )
      return ok(this.submissionInitResult(input.submissionId))
    })
    if (result.ok) await this.scheduleCleanup()
    return result
  }

  async authorizeAttachment(
    publicationId: string,
    submissionId: string,
    attachmentId: string,
    bytes: string,
    digest: string
  ): Promise<DurableResult<FormAttachmentAuthorization>> {
    await this.ready
    const submission = this.submission(submissionId)
    const attachment = this.attachment(submissionId, attachmentId)
    if (
      submission === null ||
      submission.publication_id !== publicationId ||
      (submission.state !== "uploading" && submission.state !== "initiated") ||
      attachment === null
    ) {
      return failure(
        404,
        "submission_not_found",
        "Submission attachment not found"
      )
    }
    if (attachment.bytes !== bytes || attachment.sha256 !== digest) {
      return failure(
        409,
        "attachment_hash_mismatch",
        "Attachment bytes or digest differ from its declaration"
      )
    }
    return ok(attachmentAuthorization(attachment))
  }

  async markAttachmentReady(
    submissionId: string,
    attachmentId: string
  ): Promise<DurableResult<FormAttachmentAuthorization>> {
    await this.ready
    const attachment = this.attachment(submissionId, attachmentId)
    if (attachment === null) {
      return failure(
        404,
        "submission_not_found",
        "Submission attachment not found"
      )
    }
    if (attachment.state === "pending") {
      this.ctx.storage.sql.exec(
        `UPDATE submission_attachment SET state = 'ready'
          WHERE submission_id = ? AND attachment_id = ?`,
        submissionId,
        attachmentId
      )
    }
    return ok(
      attachmentAuthorization(
        this.requireAttachment(submissionId, attachmentId)
      )
    )
  }

  async beginComplete(
    publicationId: string,
    submissionId: string
  ): Promise<DurableResult<FormAttachmentAuthorization[]>> {
    await this.ready
    const submission = this.submission(submissionId)
    if (submission === null || submission.publication_id !== publicationId) {
      return failure(404, "submission_not_found", "Submission not found")
    }
    if (
      submission.state === "committed" ||
      submission.state === "leased" ||
      submission.state === "imported"
    ) {
      return ok(this.attachments(submissionId).map(attachmentAuthorization))
    }
    const attachments = this.attachments(submissionId)
    if (attachments.some((attachment) => attachment.state === "pending")) {
      return failure(
        409,
        "submission_not_ready",
        "Submission attachments are incomplete"
      )
    }
    return ok(attachments.map(attachmentAuthorization))
  }

  async commitSubmission(
    publicationId: string,
    submissionId: string,
    promoted: Array<{ attachmentId: string; objectKey: string }>,
    now = new Date().toISOString()
  ): Promise<DurableResult<FormSubmissionRecord>> {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const submission = this.submission(submissionId)
      if (submission === null || submission.publication_id !== publicationId) {
        return failure(404, "submission_not_found", "Submission not found")
      }
      if (
        submission.state === "committed" ||
        submission.state === "leased" ||
        submission.state === "imported"
      ) {
        return ok(this.submissionRecord(submission))
      }
      const attachments = this.attachments(submissionId)
      const promotedById = new Map(
        promoted.map((attachment) => [
          attachment.attachmentId,
          attachment.objectKey,
        ])
      )
      if (
        attachments.some(
          (attachment) =>
            attachment.state === "pending" ||
            !promotedById.has(attachment.attachment_id)
        )
      ) {
        return failure(
          409,
          "submission_not_ready",
          "Submission attachments are incomplete"
        )
      }
      for (const attachment of attachments) {
        this.ctx.storage.sql.exec(
          `UPDATE submission_attachment
              SET state = 'promoted', object_key = ?
            WHERE submission_id = ? AND attachment_id = ?`,
          promotedById.get(attachment.attachment_id)!,
          submissionId,
          attachment.attachment_id
        )
      }
      const state = this.requireState(publicationId)
      const sequence = state.next_sequence
      this.ctx.storage.sql.exec(
        `UPDATE submission
            SET state = 'committed', sequence = ?, committed_at = ?
          WHERE submission_id = ?`,
        sequence,
        now,
        submissionId
      )
      this.ctx.storage.sql.exec(
        `UPDATE form_state SET next_sequence = next_sequence + 1, updated_at = ?
          WHERE publication_id = ?`,
        now,
        publicationId
      )
      return ok(this.submissionRecord(this.requireSubmission(submissionId)))
    })
  }

  async listSubmissions(
    publicationId: string,
    after: number,
    limit: number
  ): Promise<
    DurableResult<{
      submissions: FormSubmissionRecord[]
      nextCursor: string | null
    }>
  > {
    await this.ready
    const rows = this.ctx.storage.sql
      .exec<SubmissionRow>(
        `SELECT * FROM submission
          WHERE publication_id = ? AND sequence > ?
            AND state IN ('committed', 'leased', 'imported')
          ORDER BY sequence ASC LIMIT ?`,
        publicationId,
        after,
        limit
      )
      .toArray()
    const submissions = rows.map((row) => this.submissionRecord(row))
    return ok({
      submissions,
      nextCursor:
        rows.length === limit ? String(rows[rows.length - 1]!.sequence) : null,
    })
  }

  async takeoverCollector(
    publicationId: string,
    collectorId: string
  ): Promise<DurableResult<FormInboxState>> {
    await this.ready
    const state = this.state(publicationId)
    if (state === null)
      return failure(404, "form_not_found", "Published Form not found")
    if (state.collector_id === collectorId) return ok(stateRecord(state))
    this.ctx.storage.sql.exec(
      `UPDATE form_state
          SET collector_id = ?, collector_generation = collector_generation + 1,
              updated_at = ?
        WHERE publication_id = ?`,
      collectorId,
      new Date().toISOString(),
      publicationId
    )
    this.ctx.storage.sql.exec(
      `UPDATE submission SET state = 'committed', lease_generation = NULL,
                             lease_expires_at = NULL
        WHERE publication_id = ? AND state = 'leased'`,
      publicationId
    )
    return ok(stateRecord(this.requireState(publicationId)))
  }

  async leaseSubmissions(
    publicationId: string,
    collectorId: string,
    generation: number,
    after: number,
    limit: number,
    now = new Date().toISOString()
  ): Promise<
    DurableResult<{
      submissions: FormSubmissionRecord[]
      leaseExpiresAt: string
    }>
  > {
    await this.ready
    return this.ctx.storage.transactionSync(() => {
      const state = this.state(publicationId)
      if (
        state === null ||
        state.collector_id !== collectorId ||
        state.collector_generation !== generation
      ) {
        return failure(
          409,
          "collector_generation_stale",
          "Collector generation is no longer active"
        )
      }
      this.ctx.storage.sql.exec(
        `UPDATE submission SET state = 'committed', lease_generation = NULL,
                               lease_expires_at = NULL
          WHERE publication_id = ? AND state = 'leased' AND lease_expires_at <= ?`,
        publicationId,
        now
      )
      const rows = this.ctx.storage.sql
        .exec<SubmissionRow>(
          `SELECT * FROM submission
            WHERE publication_id = ? AND sequence > ?
              AND (state = 'committed' OR
                   (state = 'leased' AND lease_generation = ?))
            ORDER BY sequence ASC LIMIT ?`,
          publicationId,
          after,
          generation,
          limit
        )
        .toArray()
      const leaseExpiresAt = new Date(
        Date.parse(now) + 5 * 60_000
      ).toISOString()
      for (const row of rows.filter(
        (candidate) => candidate.state === "committed"
      )) {
        this.ctx.storage.sql.exec(
          `UPDATE submission SET state = 'leased', lease_generation = ?,
                                 lease_expires_at = ?
            WHERE submission_id = ?`,
          generation,
          leaseExpiresAt,
          row.submission_id
        )
      }
      return ok({
        submissions: rows.map((row) =>
          this.submissionRecord({
            ...row,
            state: "leased",
            lease_generation: generation,
            lease_expires_at: leaseExpiresAt,
          })
        ),
        leaseExpiresAt,
      })
    })
  }

  async acknowledgeImported(
    publicationId: string,
    submissionId: string,
    collectorId: string,
    generation: number,
    payloadSha256: string,
    retentionDays: number,
    now = new Date().toISOString()
  ): Promise<DurableResult<FormSubmissionRecord>> {
    await this.ready
    const state = this.state(publicationId)
    const submission = this.submission(submissionId)
    if (
      state === null ||
      state.collector_id !== collectorId ||
      state.collector_generation !== generation
    ) {
      return failure(
        409,
        "collector_generation_stale",
        "Collector generation is no longer active"
      )
    }
    if (
      submission === null ||
      submission.publication_id !== publicationId ||
      submission.payload_sha256 !== payloadSha256
    ) {
      return failure(404, "submission_not_found", "Submission not found")
    }
    if (submission.state === "imported")
      return ok(this.submissionRecord(submission))
    if (
      submission.state !== "leased" ||
      submission.lease_generation !== generation
    ) {
      return failure(
        409,
        "submission_lease_conflict",
        "Submission is not leased by this Collector"
      )
    }
    this.ctx.storage.sql.exec(
      `UPDATE submission SET state = 'imported', imported_at = ?,
                             lease_expires_at = NULL, purge_after = ?
        WHERE submission_id = ?`,
      now,
      new Date(Date.parse(now) + retentionDays * 86_400_000).toISOString(),
      submissionId
    )
    await this.scheduleCleanup()
    return ok(this.submissionRecord(this.requireSubmission(submissionId)))
  }

  override async alarm(): Promise<void> {
    await this.ready
    const now = new Date().toISOString()
    const incompleteBefore = new Date(
      Date.parse(now) - 86_400_000
    ).toISOString()
    const submissions = this.ctx.storage.sql
      .exec<{ submission_id: string }>(
        `SELECT submission_id FROM submission
          WHERE (state IN ('initiated', 'uploading') AND created_at <= ?)
             OR (state = 'imported' AND purge_after IS NOT NULL AND purge_after <= ?)
          ORDER BY COALESCE(purge_after, created_at) ASC LIMIT 100`,
        incompleteBefore,
        now
      )
      .toArray()
    if (submissions.length > 0) {
      const submissionIds = new Set(submissions.map((row) => row.submission_id))
      const attachments = this.ctx.storage.sql
        .exec<CleanupAttachmentRow>(
          `SELECT submission_id, temp_object_key, object_key
             FROM submission_attachment`
        )
        .toArray()
        .filter((row) => submissionIds.has(row.submission_id))
      const objectKeys = new Set(attachments.map((row) => row.temp_object_key))
      const cleanupReferences = new Map<string, number>()
      for (const attachment of attachments) {
        if (attachment.object_key === null) continue
        cleanupReferences.set(
          attachment.object_key,
          (cleanupReferences.get(attachment.object_key) ?? 0) + 1
        )
      }
      for (const [objectKey, cleanupCount] of cleanupReferences) {
        const total = this.ctx.storage.sql
          .exec<CountRow>(
            `SELECT COUNT(*) AS count FROM submission_attachment
              WHERE object_key = ?`,
            objectKey
          )
          .toArray()[0]?.count
        if ((total ?? 0) <= cleanupCount) objectKeys.add(objectKey)
      }
      if (objectKeys.size > 0) {
        await this.env.PUBLISH_OBJECTS.delete([...objectKeys])
      }
      this.ctx.storage.transactionSync(() => {
        for (const submissionId of submissionIds) {
          this.ctx.storage.sql.exec(
            "DELETE FROM submission_idempotency WHERE submission_id = ?",
            submissionId
          )
          this.ctx.storage.sql.exec(
            "DELETE FROM submission_attachment WHERE submission_id = ?",
            submissionId
          )
          this.ctx.storage.sql.exec(
            "DELETE FROM submission WHERE submission_id = ?",
            submissionId
          )
        }
      })
    }
    await this.scheduleCleanup(true)
  }

  async getAttachment(
    publicationId: string,
    submissionId: string,
    attachmentId: string
  ): Promise<DurableResult<FormAttachmentAuthorization>> {
    await this.ready
    const submission = this.submission(submissionId)
    const attachment = this.attachment(submissionId, attachmentId)
    if (
      submission === null ||
      submission.publication_id !== publicationId ||
      attachment === null ||
      attachment.state !== "promoted" ||
      attachment.object_key === null
    ) {
      return failure(
        404,
        "attachment_not_found",
        "Submission attachment not found"
      )
    }
    return ok(attachmentAuthorization(attachment))
  }

  private inboxBytes(publicationId?: string): string {
    const row = this.ctx.storage.sql
      .exec<SumRow>(
        `SELECT COALESCE(SUM(payload_bytes + CAST(attachment_bytes AS INTEGER)), 0) AS bytes
           FROM submission WHERE state != 'imported'
             AND (? IS NULL OR publication_id = ?)`,
        publicationId ?? null,
        publicationId ?? null
      )
      .toArray()[0]
    return String(row?.bytes ?? 0)
  }

  private async scheduleCleanup(replace = false): Promise<void> {
    const row = this.ctx.storage.sql
      .exec<{ cleanup_ms: number | null }>(
        `SELECT MIN(cleanup_ms) AS cleanup_ms FROM (
           SELECT unixepoch(created_at, '+1 day') * 1000 AS cleanup_ms
             FROM submission WHERE state IN ('initiated', 'uploading')
           UNION ALL
           SELECT unixepoch(purge_after) * 1000 AS cleanup_ms
             FROM submission WHERE state = 'imported' AND purge_after IS NOT NULL
         )`
      )
      .toArray()[0]
    if (row?.cleanup_ms === null || row?.cleanup_ms === undefined) {
      if (replace) await this.ctx.storage.deleteAlarm()
      return
    }
    const target = Math.max(Date.now() + 1_000, row.cleanup_ms)
    const current = await this.ctx.storage.getAlarm()
    if (replace || current === null || target < current) {
      await this.ctx.storage.setAlarm(target)
    }
  }

  private state(publicationId: string): FormStateRow | null {
    return (
      this.ctx.storage.sql
        .exec<FormStateRow>(
          "SELECT * FROM form_state WHERE publication_id = ?",
          publicationId
        )
        .toArray()[0] ?? null
    )
  }

  private requireState(publicationId: string): FormStateRow {
    const value = this.state(publicationId)
    if (value === null) throw new Error("Form state is unavailable")
    return value
  }

  private revision(
    publicationId: string,
    versionId: string
  ): RevisionRow | null {
    return (
      this.ctx.storage.sql
        .exec<RevisionRow>(
          `SELECT * FROM form_revision
            WHERE publication_id = ? AND version_id = ?`,
          publicationId,
          versionId
        )
        .toArray()[0] ?? null
    )
  }

  private submission(submissionId: string): SubmissionRow | null {
    return (
      this.ctx.storage.sql
        .exec<SubmissionRow>(
          "SELECT * FROM submission WHERE submission_id = ?",
          submissionId
        )
        .toArray()[0] ?? null
    )
  }

  private requireSubmission(submissionId: string): SubmissionRow {
    const value = this.submission(submissionId)
    if (value === null) throw new Error("Submission is unavailable")
    return value
  }

  private attachment(
    submissionId: string,
    attachmentId: string
  ): AttachmentRow | null {
    return (
      this.ctx.storage.sql
        .exec<AttachmentRow>(
          `SELECT * FROM submission_attachment
            WHERE submission_id = ? AND attachment_id = ?`,
          submissionId,
          attachmentId
        )
        .toArray()[0] ?? null
    )
  }

  private requireAttachment(
    submissionId: string,
    attachmentId: string
  ): AttachmentRow {
    const value = this.attachment(submissionId, attachmentId)
    if (value === null) throw new Error("Submission attachment is unavailable")
    return value
  }

  private attachments(submissionId: string): AttachmentRow[] {
    return this.ctx.storage.sql
      .exec<AttachmentRow>(
        `SELECT * FROM submission_attachment
          WHERE submission_id = ? ORDER BY attachment_id`,
        submissionId
      )
      .toArray()
  }

  private submissionInitResult(submissionId: string): FormSubmissionInitResult {
    const submission = this.requireSubmission(submissionId)
    return {
      submissionId,
      state: submission.state,
      attachments: this.attachments(submissionId).map((attachment) => ({
        attachmentId: attachment.attachment_id,
        bytes: attachment.bytes,
        sha256: attachment.sha256,
        state: attachment.state,
      })),
    }
  }

  private submissionRecord(row: SubmissionRow): FormSubmissionRecord {
    return {
      submissionId: row.submission_id,
      publicationId: row.publication_id,
      publicationVersionId: row.version_id,
      state: row.state,
      sequence: row.sequence === null ? null : String(row.sequence),
      payloadJson: row.payload_json,
      payloadSha256: row.payload_sha256,
      schemaFingerprint: row.schema_fingerprint,
      attachments: this.attachments(row.submission_id).map((attachment) => ({
        attachmentId: attachment.attachment_id,
        fieldId: attachment.field_id,
        name: attachment.name,
        mediaType: attachment.media_type,
        bytes: attachment.bytes,
        sha256: attachment.sha256,
      })),
      createdAt: row.created_at,
      committedAt: row.committed_at,
    }
  }
}

function stateRecord(row: FormStateRow): FormInboxState {
  return {
    publicationId: row.publication_id,
    currentVersionId: row.current_version_id,
    accepting: row.accepting === 1,
    submissionRevision: row.submission_revision,
    collectorId: row.collector_id,
    collectorGeneration: row.collector_generation,
  }
}

function attachmentAuthorization(
  row: AttachmentRow
): FormAttachmentAuthorization {
  return {
    submissionId: row.submission_id,
    attachmentId: row.attachment_id,
    bytes: row.bytes,
    sha256: row.sha256,
    mediaType: row.media_type,
    tempObjectKey: row.temp_object_key,
    objectKey: row.object_key,
    state: row.state,
  }
}

function ok<T>(value: T): DurableResult<T> {
  return { ok: true, value }
}

function failure(
  status: number,
  code: string,
  message: string
): DurableResult<never> {
  return { ok: false, error: { status, code, message } }
}
