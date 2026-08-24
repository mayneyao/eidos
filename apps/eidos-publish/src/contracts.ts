export type PublishPlan = "free" | "pro"
export type PublishServiceTier = "publish" | "custom"
export type PublishRuntimeIsolation = "shared" | "dedicated"

export type FormRespondentAccess = "anyone" | "signed_in"

export interface FormPublicationPolicy {
  respondentAccess: FormRespondentAccess
  allowMultipleResponses: boolean
  revision: number
}

export interface PublishAccessGrant {
  version: 1
  revision: number
  service: "eidos_publish"
  state: "active" | "blocked"
  plan: PublishPlan
  tier: PublishServiceTier
  handle: boolean
  privatePublications: boolean
  removeBranding: boolean
  maxStorageBytes: string
  maxObjectBytes: string
  maxEidosFileBytes: string
  retentionDays: number
  runtimeSecondsPerPeriod: string
  runtimeStartsPerPeriod: number
  runtimeIdleSeconds: number
  runtimeIsolation: PublishRuntimeIsolation
  collect: PublishCollectLimits
}

export interface PublishCollectLimits {
  submissionsPerPeriod: number
  maxSubmissionBodyBytes: number
  maxAttachmentsPerSubmission: number
  maxFormAttachmentBytes: string
  maxInboxBytes: string
  importedRetentionDays: number
  passwordForms: boolean
  emailNotifications: boolean
}

export interface PublishPrincipal {
  userId: string
  access: PublishAccessGrant
}

export interface PublicationRecord {
  publicationId: string
  slug: string
  visibility: "public" | "private"
  accessMode: "public" | "password" | "private"
  accessRevision: number
  showBranding: boolean
  currentVersionId: string | null
  createdAt: string
}

export interface SourceBundleFile {
  path: string
  role: "entrypoint" | "attachment"
  mediaType: string
  bytes: string
  sha256: string
}

export type SourceBundleAssetReference =
  | {
      kind: "eidos-file-entry"
      entryId: string
      uri: string
      fileSha256: string
    }
  | {
      kind: "markdown-link"
      uri: string
      fileSha256: string
    }

export interface SourceBundleManifest {
  spec: "eidos.publish/source-bundle@1"
  mediaType: string
  entrypoint: string
  files: SourceBundleFile[]
  assetReferences: SourceBundleAssetReference[]
}

export interface EidosDriverDescriptor {
  id: "org.eidos.driver.eidos"
  version: "1.0"
  acceptedMediaTypes: ["application/vnd.eidos+sqlite3"]
  targetKinds: ["runtime"]
  runtimeProfile: "eidos-serve-publish/1"
  limits: {
    maxObjectBytes: string
    maxEntrypointBytes: string
    maxManifestBytes: string
    maxManifestFiles: number
    maxPathBytes: 1024
  }
  conformance: string[]
}

export interface MarkdownDriverDescriptor {
  id: "org.eidos.driver.markdown"
  version: "1.0"
  acceptedMediaTypes: ["text/markdown"]
  targetKinds: ["static"]
  limits: {
    maxObjectBytes: string
    maxEntrypointBytes: "16777216"
    maxManifestBytes: string
    maxManifestFiles: number
    maxPathBytes: 1024
  }
  conformance: string[]
}

export interface FormDriverDescriptor {
  id: "org.eidos.driver.form"
  version: "1.0"
  acceptedMediaTypes: ["application/vnd.eidos.form+json"]
  targetKinds: ["static"]
  limits: {
    maxObjectBytes: "262144"
    maxEntrypointBytes: "262144"
    maxManifestBytes: string
    maxManifestFiles: 1
    maxPathBytes: 1024
  }
  conformance: ["EP-Core-1.0", "EP-Static-1.0", "EP-Collect-1.0"]
}

export type PublishDriverDescriptor =
  | EidosDriverDescriptor
  | MarkdownDriverDescriptor
  | FormDriverDescriptor

export type PublishedFormFieldType =
  | "integer"
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "datetime"
  | "file"
  | "multi-select"
  | "rating"
  | "select"
  | "url"

export interface PublishedFormDefinition {
  spec: "eidos.publish/form-definition@1"
  source: {
    fileId: string
    tableId: string
    viewId: string
    schemaRevision: string
    schemaFingerprint: string
  }
  presentation: {
    title: string
    description: string | null
    submitLabel: string
    successMessage: string
  }
  fields: Array<{
    fieldId: string
    inputKey: string
    type: PublishedFormFieldType
    label: string
    description: string | null
    placeholder: string | null
    multiline: boolean
    required: boolean
    nullable: boolean
    constraints: Record<string, unknown>
  }>
}

export interface PublicFormDefinition {
  spec: "eidos.publish/public-form@1"
  publicationVersionId: string
  presentation: PublishedFormDefinition["presentation"]
  fields: Array<
    Omit<PublishedFormDefinition["fields"][number], "fieldId" | "nullable">
  >
  submissionIntent: string
  expiresAt: string
}

export type PublicFormDocumentDefinition = Omit<
  PublicFormDefinition,
  "submissionIntent" | "expiresAt"
>

export interface FormSubmissionAttachmentInput {
  attachmentId: string
  inputKey: string
  name: string
  mediaType: string
  bytes: string
  sha256: string
}

export interface FormSubmissionRecord {
  submissionId: string
  publicationId: string
  publicationVersionId: string
  state: "initiated" | "uploading" | "committed" | "leased" | "imported"
  sequence: string | null
  payloadJson: string
  payloadSha256: string
  schemaFingerprint: string
  attachments: Array<{
    attachmentId: string
    fieldId: string
    name: string
    mediaType: string
    bytes: string
    sha256: string
  }>
  createdAt: string
  committedAt: string | null
}

export interface ValidatedSourceBundle {
  manifest: SourceBundleManifest
  canonicalJson: string
  manifestSha256: string
  sourceBytes: string
  driver: PublishDriverDescriptor
  entrypoint: SourceBundleFile
}

export interface SourceObjectUpload {
  sha256: string
  bytes: string
  mediaType: string
  state: "pending" | "ready"
}

export interface ContentObjectRecord extends SourceObjectUpload {
  objectKey: string
}

export interface VersionUploadPlan {
  version: PublicationVersionRecord
  objects: SourceObjectUpload[]
  storageBytes: string
  maxStorageBytes: string
}

export interface PublishedAssetRecord {
  entryId: string
  uri: string
  sha256: string
  bytes: string
  mediaType: string
  objectKey: string
}

export interface PublishedFileRecord {
  path: string
  sha256: string
  bytes: string
  mediaType: string
  objectKey: string
}

export interface StaticArtifactRecord extends PublishedFileRecord {
  state: "pending" | "ready"
}

export interface ValidationReceipt {
  sourceManifestSha256: string
  driverId: string
  driverVersion: string
  valid: boolean
  diagnostics: Array<{ code: string; message: string }>
}

export interface RuntimeServingTarget {
  kind: "runtime"
  runtimeProfile: "eidos-serve-publish/1"
  instanceKey: string
  versionId: string
  sourceManifestSha256: string
}

export interface StaticServingTarget {
  kind: "static"
  artifactManifestKey: string
  artifactManifestSha256: string
  entrypoint: string
}

export type ServingTarget = RuntimeServingTarget | StaticServingTarget

export interface ArtifactManifest {
  spec: "eidos.publish/artifact-manifest@1"
  entrypoint: string
  files: Array<{
    path: string
    bytes: string
    sha256: string
    contentType: string
  }>
}

export interface ReadyReceipt {
  sourceManifestSha256: string
  driverId: string
  driverVersion: string
  servingTargetSha256: string
  readyAt: string
  conformance: string[]
}

export type PublicationVersionState =
  | "created"
  | "uploading"
  | "uploaded"
  | "validating"
  | "preparing"
  | "ready"
  | "failed"
  | "deleting"
  | "deleted"

export interface PublicationVersionRecord {
  versionId: string
  publicationId: string
  state: PublicationVersionState
  jobId: string
  activateOnReady: boolean
  sourceManifestKey: string
  sourceManifestSha256: string
  sourceBytes: string
  entrypoint: SourceBundleFile
  entrypointObjectKey: string
  driverId: string
  driverVersion: string
  servingTarget: ServingTarget | null
  servingTargetSha256: string | null
  validationReceipt: ValidationReceipt | null
  readyReceipt: ReadyReceipt | null
  targetHealth: "pending" | "healthy" | "unhealthy"
  targetHealthReason: string | null
  failureStep: string | null
  failureCode: string | null
  createdAt: string
}

export interface PublishWorkflowParams {
  tenantId: string
  publicationId: string
  slug: string
  versionId: string
  jobId: string
  activate: boolean
  actor: string
  requestId: string
  runtimeIdleSeconds: number
  runtimeIsolation: PublishRuntimeIsolation
}

export interface ActivationResult {
  publicationId: string
  fromVersionId: string | null
  toVersionId: string
  activatedAt: string
  requestId: string
}

export interface VersionDeletionPlan {
  versionId: string
  objectKeys: string[]
  state: "deleting" | "deleted"
}

export interface VersionFailureEvent {
  jobId: string
  versionId: string
  attempt: number
  step: string
  code: string
  retryable: boolean
  failedAt: string
}

export interface VersionLifecycleEvent {
  versionId: string
  eventType: "deletion_started" | "deletion_completed"
  actor: string
  requestId: string
  reason: "user" | "retention"
  occurredAt: string
}

export interface MultipartUploadSession {
  sessionId: string
  versionId: string
  sha256: string
  objectKey: string
  uploadId: string
  state: "uploading" | "completed" | "aborted"
}

export interface MultipartPartRecord {
  sessionId: string
  partNumber: number
  bytes: string
  sha256: string
  etag: string | null
}

export interface TenantSummary {
  publicSiteId: string
  canonicalHost: string
  preferredHandle: string | null
  access: PublishAccessGrant
  publications: PublicationRecord[]
  usage: UsagePeriodRecord
  storage: {
    usedBytes: string
    maxBytes: string
  }
}

export interface UsagePeriodRecord {
  period: string
  sourceBytes: string
  artifactBytes: string
  runtimeActiveSeconds: string
  runtimeStarts: number
  builds: number
  requests: number
  reconciledAt: string
}

export type DurableResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: { status: number; code: string; message: string }
    }
