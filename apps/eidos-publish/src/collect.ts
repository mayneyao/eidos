import { sha256 } from "@noble/hashes/sha2.js"

import { canonicalJson, canonicalSha256 } from "./canonical"
import type {
  PublicationVersionRecord,
  PublicFormDefinition,
  PublishedFormDefinition,
  PublishedFormFieldType,
  PublishCollectLimits,
} from "./contracts"
import { loadFormDefinition } from "./form"
import type {
  FormAttachmentAuthorization,
  FormInboxDurableObject,
  FormInboxState,
} from "./form-inbox"
import {
  signFormSubmissionIntent,
  verifyFormSubmissionIntent,
  type FormSubmissionIntentClaims,
} from "./form-intent"
import type { PublishTenant } from "./tenant"

const encoder = new TextEncoder()
const MAX_INTENT_SECONDS = 30 * 60
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,128}$/
const ATTACHMENT_ID = /^[A-Za-z0-9_-]{16,64}$/
const SHA256 = /^[0-9a-f]{64}$/
const DECIMAL = /^(?:0|[1-9][0-9]*)$/
const MEDIA_TYPE = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/
const CONTROL = /[\u0000-\u001f\u007f]/

interface ResolvedFormPublication {
  publication: {
    publicationId: string
    accessRevision: number
  }
  version: PublicationVersionRecord
}

export async function formDefinitionResponse(
  env: Env,
  tenantId: string,
  audience: string,
  resolved: ResolvedFormPublication
): Promise<Response> {
  const version = requireFormVersion(resolved.version)
  const definition = await loadFormDefinition(env, version)
  const inbox = formInbox(env, tenantId)
  const registered = await inbox.registerRevision({
    publicationId: resolved.publication.publicationId,
    versionId: version.versionId,
    schemaFingerprint: definition.source.schemaFingerprint,
    definitionSha256: version.entrypoint.sha256,
    definitionJson: canonicalJson(definition),
  })
  if (!registered.ok) return durableProblem(registered)
  if (!registered.value.accepting) {
    return formProblem(
      409,
      "form_not_accepting",
      "Form is not accepting responses"
    )
  }
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + MAX_INTENT_SECONDS
  const intent = await signFormSubmissionIntent(
    {
      iss: "eidos-publish-form",
      aud: audience,
      tenantId,
      publicationId: resolved.publication.publicationId,
      publicationVersionId: version.versionId,
      accessRevision: resolved.publication.accessRevision,
      submissionRevision: registered.value.submissionRevision,
      nonce: randomToken(24),
      iat: now,
      exp: expiresAt,
      kid: "v1",
    },
    env.PUBLISH_FORM_INTENT_SECRET
  )
  const publicDefinition: PublicFormDefinition = {
    spec: "eidos.publish/public-form@1",
    publicationVersionId: version.versionId,
    presentation: definition.presentation,
    fields: definition.fields.map(
      ({ fieldId: _fieldId, nullable: _nullable, ...field }) => field
    ),
    submissionIntent: intent,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
  return Response.json(publicDefinition, {
    headers: publicJsonHeaders(false),
  })
}

export async function initializeFormSubmission(
  request: Request,
  env: Env,
  tenantId: string,
  audience: string,
  slug: string,
  resolved: ResolvedFormPublication,
  limits: PublishCollectLimits
): Promise<Response> {
  const body = await boundedJson(request, limits.maxSubmissionBodyBytes)
  const record = plainRecord(body, "submission_invalid")
  if (
    Object.keys(record).some(
      (key) =>
        !["intent", "idempotencyKey", "values", "attachments"].includes(key)
    ) ||
    typeof record.intent !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(record.idempotencyKey)
  ) {
    return formProblem(
      400,
      "submission_invalid",
      "Submission request is invalid"
    )
  }
  const inbox = formInbox(env, tenantId)
  const authorized = await authorizeIntent(
    record.intent,
    env,
    tenantId,
    audience,
    resolved,
    inbox
  )
  if (authorized instanceof Response) return authorized
  const versionResult = await env.PUBLISH_TENANTS.getByName(
    tenantId
  ).getVersionStatus(slug, authorized.claims.publicationVersionId)
  if (!versionResult.ok)
    return formProblem(
      409,
      "form_version_stale",
      "Form revision is unavailable"
    )
  const version = requireFormVersion(versionResult.value)
  if (version.publicationId !== resolved.publication.publicationId) {
    return formProblem(
      409,
      "form_version_stale",
      "Form revision is unavailable"
    )
  }
  const definition = await loadFormDefinition(env, version)
  const normalized = normalizeSubmission(
    record.values,
    record.attachments,
    definition,
    limits
  )
  if (normalized instanceof Response) return normalized
  const payloadJson = canonicalJson(normalized.payload)
  const payloadBytes = encoder.encode(payloadJson).byteLength
  if (payloadBytes > limits.maxSubmissionBodyBytes) {
    return formProblem(
      413,
      "submission_invalid",
      "Submission payload is too large"
    )
  }
  const submissionId = crypto.randomUUID()
  const inputSha256 = await canonicalSha256({
    versionId: version.versionId,
    payload: normalized.payload,
    attachments: normalized.attachments.map(
      ({ fieldId: _fieldId, ...attachment }) => attachment
    ),
  })
  const created = await inbox.initializeSubmission({
    submissionId,
    publicationId: resolved.publication.publicationId,
    versionId: version.versionId,
    schemaFingerprint: definition.source.schemaFingerprint,
    idempotencyKey: record.idempotencyKey,
    inputSha256,
    payload: normalized.payload,
    payloadSha256: await canonicalSha256(normalized.payload),
    payloadBytes,
    attachments: normalized.attachments.map((attachment) => ({
      ...attachment,
      tempObjectKey: temporaryAttachmentKey(
        tenantId,
        resolved.publication.publicationId,
        submissionId,
        attachment.attachmentId
      ),
    })),
    limits,
    clientHash: await clientHash(request, env.PUBLISH_FORM_INTENT_SECRET),
  })
  if (!created.ok) return durableProblem(created)
  return Response.json(
    {
      submissionId: created.value.submissionId,
      state: created.value.state,
      attachments: created.value.attachments.map((attachment) => ({
        ...attachment,
        uploadUrl: `/_eidos/forms/${slug}/submissions/${created.value.submissionId}/attachments/${attachment.attachmentId}`,
      })),
    },
    { status: 201, headers: publicJsonHeaders(true) }
  )
}

export async function uploadFormAttachment(
  request: Request,
  env: Env,
  tenantId: string,
  audience: string,
  submissionId: string,
  attachmentId: string,
  resolved: ResolvedFormPublication
): Promise<Response> {
  if (!ATTACHMENT_ID.test(attachmentId) || request.body === null) {
    return formProblem(
      400,
      "submission_invalid",
      "Attachment upload is invalid"
    )
  }
  const intent = formIntentHeader(request)
  if (intent === null)
    return formProblem(
      401,
      "submission_intent_invalid",
      "Submission Intent is required"
    )
  const inbox = formInbox(env, tenantId)
  const authorized = await authorizeIntent(
    intent,
    env,
    tenantId,
    audience,
    resolved,
    inbox
  )
  if (authorized instanceof Response) return authorized
  const bytes = decimalHeader(request.headers.get("content-length"))
  const digest = request.headers.get("x-eidos-content-sha256")
  if (bytes === null || digest === null || !SHA256.test(digest)) {
    return formProblem(
      411,
      "submission_invalid",
      "Attachment length and digest are required"
    )
  }
  const descriptor = await inbox.authorizeAttachment(
    resolved.publication.publicationId,
    submissionId,
    attachmentId,
    bytes.toString(),
    digest
  )
  if (!descriptor.ok) return durableProblem(descriptor)

  const [objectBody, digestBody] = request.body.tee()
  const digestPromise = hashReadableStream(digestBody)
  const stored = await env.PUBLISH_OBJECTS.put(
    descriptor.value.tempObjectKey,
    objectBody,
    {
      sha256: hexBytes(digest),
      httpMetadata: { contentType: descriptor.value.mediaType },
      customMetadata: {
        contentBytes: descriptor.value.bytes,
        contentSha256: descriptor.value.sha256,
      },
    }
  )
  const actual = await digestPromise
  if (
    actual.bytes !== bytes ||
    actual.sha256 !== digest ||
    stored.size.toString() !== descriptor.value.bytes
  ) {
    await env.PUBLISH_OBJECTS.delete(descriptor.value.tempObjectKey)
    return formProblem(
      409,
      "attachment_hash_mismatch",
      "Attachment digest differs"
    )
  }
  const ready = await inbox.markAttachmentReady(submissionId, attachmentId)
  return ready.ok
    ? Response.json(
        { attachmentId, state: "ready" },
        { headers: publicJsonHeaders(true) }
      )
    : durableProblem(ready)
}

export async function completeFormSubmission(
  request: Request,
  env: Env,
  tenantId: string,
  audience: string,
  resolved: ResolvedFormPublication,
  submissionId: string
): Promise<Response> {
  const intent = formIntentHeader(request)
  if (intent === null)
    return formProblem(
      401,
      "submission_intent_invalid",
      "Submission Intent is required"
    )
  const inbox = formInbox(env, tenantId)
  const authorized = await authorizeIntent(
    intent,
    env,
    tenantId,
    audience,
    resolved,
    inbox
  )
  if (authorized instanceof Response) return authorized
  const begun = await inbox.beginComplete(
    resolved.publication.publicationId,
    submissionId
  )
  if (!begun.ok) return durableProblem(begun)
  const promoted: Array<{ attachmentId: string; objectKey: string }> = []
  for (const attachment of begun.value) {
    if (attachment.state === "promoted" && attachment.objectKey !== null) {
      promoted.push({
        attachmentId: attachment.attachmentId,
        objectKey: attachment.objectKey,
      })
      continue
    }
    const objectKey = formAttachmentObjectKey(tenantId, attachment.sha256)
    const source = await env.PUBLISH_OBJECTS.get(attachment.tempObjectKey)
    if (
      source === null ||
      source.size.toString() !== attachment.bytes ||
      source.customMetadata?.contentSha256 !== attachment.sha256
    ) {
      await source?.body.cancel()
      return formProblem(
        409,
        "submission_not_ready",
        "Submission attachment is unavailable"
      )
    }
    const stored = await env.PUBLISH_OBJECTS.put(objectKey, source.body, {
      onlyIf: { etagDoesNotMatch: "*" },
      sha256: hexBytes(attachment.sha256),
      httpMetadata: { contentType: attachment.mediaType },
      customMetadata: {
        contentBytes: attachment.bytes,
        contentSha256: attachment.sha256,
      },
    })
    if (stored === null) {
      const existing = await env.PUBLISH_OBJECTS.head(objectKey)
      if (
        existing?.size.toString() !== attachment.bytes ||
        existing.customMetadata?.contentSha256 !== attachment.sha256
      ) {
        return formProblem(
          409,
          "attachment_hash_mismatch",
          "Stored attachment differs"
        )
      }
    }
    await env.PUBLISH_OBJECTS.delete(attachment.tempObjectKey)
    promoted.push({ attachmentId: attachment.attachmentId, objectKey })
  }
  const completed = await inbox.commitSubmission(
    resolved.publication.publicationId,
    submissionId,
    promoted
  )
  if (!completed.ok) return durableProblem(completed)
  return Response.json(
    {
      submissionId,
      state: "committed",
      sequence: completed.value.sequence,
    },
    { headers: publicJsonHeaders(true) }
  )
}

export function formClientScriptResponse(): Response {
  return new Response(FORM_CLIENT_SCRIPT, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/javascript; charset=utf-8",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export function formDocumentCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ")
}

function normalizeSubmission(
  valuesValue: unknown,
  attachmentsValue: unknown,
  definition: PublishedFormDefinition,
  limits: PublishCollectLimits
):
  | {
      payload: Record<string, unknown>
      attachments: Array<{
        attachmentId: string
        fieldId: string
        name: string
        mediaType: string
        bytes: string
        sha256: string
      }>
    }
  | Response {
  let values: Record<string, unknown>
  try {
    values = plainRecord(valuesValue ?? {}, "submission_invalid")
  } catch {
    return formProblem(
      400,
      "submission_invalid",
      "Submission values are invalid"
    )
  }
  if (!Array.isArray(attachmentsValue ?? [])) {
    return formProblem(
      400,
      "submission_invalid",
      "Submission attachments are invalid"
    )
  }
  const attachmentsRaw = (attachmentsValue ?? []) as unknown[]
  if (attachmentsRaw.length > limits.maxAttachmentsPerSubmission) {
    return formProblem(413, "attachment_count_exceeded", "Too many attachments")
  }
  const fieldsByInputKey = new Map(
    definition.fields.map((field) => [field.inputKey, field] as const)
  )
  if (Object.keys(values).some((key) => !fieldsByInputKey.has(key))) {
    return formProblem(
      400,
      "submission_invalid",
      "Submission contains an unknown field"
    )
  }
  const attachments: Array<{
    attachmentId: string
    fieldId: string
    name: string
    mediaType: string
    bytes: string
    sha256: string
  }> = []
  const attachmentIds = new Set<string>()
  for (const candidate of attachmentsRaw) {
    let item: Record<string, unknown>
    try {
      item = plainRecord(candidate, "submission_invalid")
    } catch {
      return formProblem(
        400,
        "submission_invalid",
        "Attachment metadata is invalid"
      )
    }
    if (
      Object.keys(item).length !== 6 ||
      Object.keys(item).some(
        (key) =>
          ![
            "attachmentId",
            "inputKey",
            "name",
            "mediaType",
            "bytes",
            "sha256",
          ].includes(key)
      ) ||
      typeof item.attachmentId !== "string" ||
      !ATTACHMENT_ID.test(item.attachmentId) ||
      attachmentIds.has(item.attachmentId) ||
      typeof item.inputKey !== "string" ||
      typeof item.name !== "string" ||
      item.name.length === 0 ||
      encoder.encode(item.name).byteLength > 255 ||
      CONTROL.test(item.name) ||
      typeof item.mediaType !== "string" ||
      !MEDIA_TYPE.test(item.mediaType) ||
      typeof item.bytes !== "string" ||
      !DECIMAL.test(item.bytes) ||
      typeof item.sha256 !== "string" ||
      !SHA256.test(item.sha256)
    ) {
      return formProblem(
        400,
        "submission_invalid",
        "Attachment metadata is invalid"
      )
    }
    const field = fieldsByInputKey.get(item.inputKey)
    if (field?.type !== "file") {
      return formProblem(
        400,
        "submission_invalid",
        "Attachment field is invalid"
      )
    }
    if (BigInt(item.bytes) > BigInt(limits.maxFormAttachmentBytes)) {
      return formProblem(413, "attachment_too_large", "Attachment is too large")
    }
    attachmentIds.add(item.attachmentId)
    attachments.push({
      attachmentId: item.attachmentId,
      fieldId: field.fieldId,
      name: safeAttachmentName(item.name),
      mediaType: item.mediaType.toLowerCase(),
      bytes: item.bytes,
      sha256: item.sha256,
    })
  }

  const payload: Record<string, unknown> = {}
  for (const field of definition.fields) {
    if (field.type === "file") {
      const fieldAttachments = attachments
        .filter((attachment) => attachment.fieldId === field.fieldId)
        .map((attachment) => attachment.attachmentId)
      if (field.required && fieldAttachments.length === 0) {
        return formProblem(
          400,
          "submission_invalid",
          `${field.label} is required`
        )
      }
      if (field.constraints.multiple === false && fieldAttachments.length > 1) {
        return formProblem(
          400,
          "submission_invalid",
          `${field.label} accepts one attachment`
        )
      }
      if (fieldAttachments.length > 0) {
        payload[field.fieldId] = { attachments: fieldAttachments }
      }
      continue
    }
    const raw = values[field.inputKey]
    if (raw === undefined || raw === null || raw === "") {
      if (field.required) {
        return formProblem(
          400,
          "submission_invalid",
          `${field.label} is required`
        )
      }
      continue
    }
    const value = normalizeFieldValue(field.type, raw, field.constraints)
    if (value === INVALID) {
      return formProblem(400, "submission_invalid", `${field.label} is invalid`)
    }
    payload[field.fieldId] = value
  }
  return { payload, attachments }
}

const INVALID = Symbol("invalid")

function normalizeFieldValue(
  type: PublishedFormFieldType,
  value: unknown,
  constraints: Record<string, unknown>
): unknown | typeof INVALID {
  if (type === "checkbox") return typeof value === "boolean" ? value : INVALID
  if (type === "number" || type === "rating") {
    if (typeof value !== "number" || !Number.isFinite(value)) return INVALID
    if (typeof constraints.min === "number" && value < constraints.min)
      return INVALID
    if (typeof constraints.max === "number" && value > constraints.max)
      return INVALID
    return value
  }
  if (type === "multi-select") {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string") ||
      new Set(value).size !== value.length
    ) {
      return INVALID
    }
    const options = stringOptions(constraints.options)
    return options !== null && value.some((item) => !options.has(item))
      ? INVALID
      : value
  }
  if (typeof value !== "string" || CONTROL.test(value)) return INVALID
  const maxBytes =
    typeof constraints.maxBytes === "number" &&
    Number.isSafeInteger(constraints.maxBytes) &&
    constraints.maxBytes > 0
      ? constraints.maxBytes
      : 64 * 1024
  if (encoder.encode(value).byteLength > maxBytes) return INVALID
  if (type === "integer" && !/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value))
    return INVALID
  if (type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return INVALID
  if (type === "datetime" && !Number.isFinite(Date.parse(value))) return INVALID
  if (type === "url") {
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        return INVALID
    } catch {
      return INVALID
    }
  }
  if (type === "select") {
    const options = stringOptions(constraints.options)
    if (options !== null && !options.has(value)) return INVALID
  }
  return value
}

function stringOptions(value: unknown): Set<string> | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null
  }
  return new Set(value)
}

function safeAttachmentName(value: string): string {
  return value.split(/[\\/]/).at(-1) ?? "attachment"
}

async function authorizeIntent(
  token: string,
  env: Env,
  tenantId: string,
  audience: string,
  resolved: ResolvedFormPublication,
  inbox: DurableObjectStub<FormInboxDurableObject>
): Promise<
  { claims: FormSubmissionIntentClaims; state: FormInboxState } | Response
> {
  const claims = await verifyFormSubmissionIntent(
    token,
    env.PUBLISH_FORM_INTENT_SECRET,
    audience
  )
  if (claims === null) {
    return formProblem(
      401,
      "submission_intent_invalid",
      "Submission Intent is invalid"
    )
  }
  const state = await inbox.getState(resolved.publication.publicationId)
  if (
    !state.ok ||
    !state.value.accepting ||
    claims.tenantId !== tenantId ||
    claims.publicationId !== resolved.publication.publicationId ||
    claims.accessRevision !== resolved.publication.accessRevision ||
    claims.submissionRevision !== state.value.submissionRevision
  ) {
    return formProblem(
      409,
      "form_not_accepting",
      "Form is not accepting responses"
    )
  }
  return { claims, state: state.value }
}

function requireFormVersion(
  version: PublicationVersionRecord
): PublicationVersionRecord {
  if (
    version.state !== "ready" ||
    version.targetHealth !== "healthy" ||
    version.driverId !== "org.eidos.driver.form" ||
    version.driverVersion !== "1.0" ||
    version.servingTarget?.kind !== "static"
  ) {
    throw new Error("Published Form is unavailable")
  }
  return version
}

function formInbox(
  env: Env,
  tenantId: string
): DurableObjectStub<FormInboxDurableObject> {
  return env.FORM_INBOXES.getByName(tenantId)
}

function temporaryAttachmentKey(
  tenantId: string,
  publicationId: string,
  submissionId: string,
  attachmentId: string
): string {
  return [
    "form-inbox",
    tenantId,
    "temporary",
    publicationId,
    submissionId,
    attachmentId,
  ].join("/")
}

function formAttachmentObjectKey(tenantId: string, digest: string): string {
  return [
    "form-inbox",
    tenantId,
    "objects",
    "sha256",
    digest.slice(0, 2),
    digest,
  ].join("/")
}

function formIntentHeader(request: Request): string | null {
  const value = request.headers.get("x-eidos-submission-intent")
  return value && value.length <= 4096 ? value : null
}

async function boundedJson(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  const length = decimalHeader(request.headers.get("content-length"))
  if (length !== null && length > BigInt(maxBytes)) {
    throw new FormRequestError(
      413,
      "submission_invalid",
      "Submission request is too large"
    )
  }
  const text = await request.text()
  if (encoder.encode(text).byteLength > maxBytes) {
    throw new FormRequestError(
      413,
      "submission_invalid",
      "Submission request is too large"
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new FormRequestError(
      400,
      "submission_invalid",
      "Submission request must be JSON"
    )
  }
}

export class FormRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "FormRequestError"
  }
}

function plainRecord(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FormRequestError(400, code, "Request object is invalid")
  }
  return value as Record<string, unknown>
}

function decimalHeader(value: string | null): bigint | null {
  return value !== null && DECIMAL.test(value) ? BigInt(value) : null
}

async function clientHash(request: Request, secret: string): Promise<string> {
  const source = [
    request.headers.get("cf-connecting-ip") ?? "unknown",
    request.headers.get("user-agent")?.slice(0, 256) ?? "unknown",
    secret,
  ].join("\n")
  return hex(sha256(encoder.encode(source)))
}

async function hashReadableStream(
  body: ReadableStream<Uint8Array>
): Promise<{ bytes: bigint; sha256: string }> {
  const hash = sha256.create()
  const reader = body.getReader()
  let bytes = 0n
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      hash.update(result.value)
      bytes += BigInt(result.value.byteLength)
    }
  } finally {
    reader.releaseLock()
  }
  return { bytes, sha256: hex(hash.digest()) }
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function hexBytes(value: string): Uint8Array {
  return Uint8Array.from({ length: value.length / 2 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  )
}

function randomToken(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function publicJsonHeaders(_mutation: boolean): HeadersInit {
  return {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  }
}

function formProblem(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: publicJsonHeaders(true) }
  )
}

function durableProblem(result: {
  ok: false
  error: { status: number; code: string; message: string }
}): Response {
  return formProblem(
    result.error.status,
    result.error.code,
    result.error.message
  )
}

const FORM_CLIENT_SCRIPT = String.raw`(()=>{"use strict";
const root=document.getElementById("eidos-form-root"),slug=root&&root.dataset.slug;
if(!root||!slug)return;
const el=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key==="class")node.className=value;else if(key==="required")node.required=Boolean(value);else if(key==="multiple")node.multiple=Boolean(value);else node.setAttribute(key,String(value));}if(text!==undefined)node.textContent=text;return node;};
const hex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,"0")).join("");
const id=()=>crypto.randomUUID().replaceAll("-","");
async function load(){const response=await fetch("/_eidos/forms/"+encodeURIComponent(slug)+"/definition",{credentials:"same-origin"});if(!response.ok)throw new Error((await response.json().catch(()=>null))?.error?.message||"This form is unavailable.");return response.json();}
function control(field){let input;if(field.type==="text"&&field.multiline){input=el("textarea");}else if(field.type==="select"||field.type==="multi-select"){input=el("select",field.type==="multi-select"?{multiple:true}:{});if(!field.required&&field.type==="select")input.append(el("option",{value:""},"Choose…"));for(const value of field.constraints.options||[])input.append(el("option",{value},value));}else{const types={integer:"number",number:"number",rating:"number",checkbox:"checkbox",date:"date",datetime:"datetime-local",file:"file",url:"url"};input=el("input",{type:types[field.type]||"text"});if(field.type==="file")input.multiple=field.constraints.multiple!==false;}input.name=field.inputKey;input.required=field.required;if(field.placeholder)input.placeholder=field.placeholder;return input;}
async function render(def){root.replaceChildren();const header=el("header"),title=el("h1",{},def.presentation.title);header.append(title);if(def.presentation.description)header.append(el("p",{},def.presentation.description));root.append(header);const form=el("form"),controls=new Map();for(const field of def.fields){const wrap=el("div",{class:"field"}),label=el("label",{},field.label);if(field.required)label.append(el("span",{class:"required"}," *"));const input=control(field);label.htmlFor="field-"+field.inputKey;input.id=label.htmlFor;wrap.append(label);if(field.description)wrap.append(el("p",{class:"hint"},field.description));wrap.append(input);controls.set(field.inputKey,{field,input});form.append(wrap);}const status=el("p",{class:"status","aria-live":"polite"}),button=el("button",{type:"submit"},def.presentation.submitLabel);form.append(status,button);form.addEventListener("submit",async event=>{event.preventDefault();button.disabled=true;status.className="status";status.textContent="Submitting…";try{const values={},attachments=[],files=[];for(const [inputKey,{field,input}] of controls){if(field.type==="file"){for(const file of input.files||[]){const attachmentId=id(),digest=hex(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));attachments.push({attachmentId,inputKey,name:file.name,mediaType:file.type||"application/octet-stream",bytes:String(file.size),sha256:digest});files.push({attachmentId,file,digest});}}else if(field.type==="checkbox")values[inputKey]=input.checked;else if(field.type==="multi-select")values[inputKey]=Array.from(input.selectedOptions,option=>option.value);else if(input.value!=="")values[inputKey]=(field.type==="number"||field.type==="rating")?Number(input.value):(field.type==="datetime"?new Date(input.value).toISOString():input.value);}
const init=await fetch("/_eidos/forms/"+encodeURIComponent(slug)+"/submissions/init",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({intent:def.submissionIntent,idempotencyKey:id(),values,attachments})});const initialized=await init.json();if(!init.ok)throw new Error(initialized?.error?.message||"Submission failed.");for(const upload of initialized.attachments){const item=files.find(candidate=>candidate.attachmentId===upload.attachmentId);if(!item)continue;const response=await fetch(upload.uploadUrl,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":item.file.type||"application/octet-stream","X-Eidos-Content-SHA256":item.digest,"X-Eidos-Submission-Intent":def.submissionIntent},body:item.file});if(!response.ok)throw new Error((await response.json().catch(()=>null))?.error?.message||"Attachment upload failed.");}
const complete=await fetch("/_eidos/forms/"+encodeURIComponent(slug)+"/submissions/"+initialized.submissionId+"/complete",{method:"POST",credentials:"same-origin",headers:{"X-Eidos-Submission-Intent":def.submissionIntent}});if(!complete.ok)throw new Error((await complete.json().catch(()=>null))?.error?.message||"Submission failed.");form.reset();status.textContent=def.presentation.successMessage;}catch(error){status.className="status error";status.textContent=error instanceof Error?error.message:"Submission failed.";}finally{button.disabled=false;}});root.append(form);}
load().then(render).catch(error=>{root.replaceChildren(el("p",{class:"status error"},error instanceof Error?error.message:"This form is unavailable."));});})();`
