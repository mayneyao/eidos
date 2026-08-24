import {
  authenticatePublishUser,
  parsePrincipal,
  PublishAuthenticationError,
} from "./auth"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  EIDOS_DRIVER,
  FORM_DRIVER,
  MARKDOWN_DRIVER,
  SourceBundleError,
  manifestBytes,
  validateSourceBundle,
} from "./bundle"
import { canonicalJson, canonicalSha256 } from "./canonical"
import { PublicRuntimeError, routePublicRequest } from "./gateway"
import { FormRequestError } from "./collect"
import { activateFormRevision, parsePublishedFormDefinition } from "./form"
import {
  isRelayPublicHostname,
  publicationHostname,
  reservedPublishHandle,
} from "./hostnames"
import { withRequestId } from "./response"
import { validPublicationPassword } from "./passwords"
import type {
  ContentObjectRecord,
  DurableResult,
  PublicationVersionRecord,
  PublishPrincipal,
  PublishWorkflowParams,
  SourceBundleManifest,
  TenantSummary,
} from "./contracts"
import {
  PublicSiteClaimDurableObject,
  PublishHandleDurableObject,
  PublishTenant,
  TenantLocatorDurableObject,
} from "./tenant"
import { FormInboxDurableObject } from "./form-inbox"
export { PublishWorkflow } from "./workflow"
export { EidosRuntimeContainer } from "./runtime"

export {
  FormInboxDurableObject,
  PublicSiteClaimDurableObject,
  PublishHandleDurableObject,
  PublishTenant,
  TenantLocatorDurableObject,
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const VERSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,128}$/
const MULTIPART_SESSION_ID = /^[0-9a-f]{32}$/
const SINGLE_UPLOAD_MAX_BYTES = 95n * 1024n * 1024n
const MULTIPART_PART_MAX_BYTES = 100n * 1024n * 1024n
const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "cdn",
  "dashboard",
  "docs",
  "download",
  "editor",
  "help",
  "login",
  "logout",
  "publish",
  "relay",
  "signup",
  "status",
  "support",
  "www",
])

interface BeginVersionBody {
  driver:
    | { id: "org.eidos.driver.eidos"; version: "1.0" }
    | { id: "org.eidos.driver.markdown"; version: "1.0" }
    | { id: "org.eidos.driver.form"; version: "1.0" }
  manifest: SourceBundleManifest
  activate: boolean
}

interface PublicationAccessBody {
  mode: "public" | "password" | "private"
  password: string | null
}

interface FormPublicationPolicyBody {
  respondentAccess: "anyone" | "signed_in"
  allowMultipleResponses: boolean
}

interface PublicationBrandingBody {
  showBranding: boolean
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
    try {
      return await withRequestId(
        await route(request, env, ctx, requestId),
        requestId
      )
    } catch (cause) {
      if (cause instanceof PublishAuthenticationError) {
        return await withRequestId(
          problem(cause.status, cause.code, cause.message),
          requestId
        )
      }
      if (cause instanceof SourceBundleError) {
        return await withRequestId(
          problem(400, cause.code, cause.message),
          requestId
        )
      }
      if (cause instanceof PublicRuntimeError) {
        const unavailable = cause.code === "runtime_unavailable"
        return await withRequestId(
          problem(
            unavailable ? 503 : 400,
            cause.code,
            unavailable
              ? "Runtime is unavailable"
              : "Runtime session request is invalid"
          ),
          requestId
        )
      }
      if (cause instanceof FormRequestError) {
        return await withRequestId(
          problem(cause.status, cause.code, cause.message),
          requestId
        )
      }
      console.error(
        JSON.stringify({
          message: "publish request failed",
          requestId,
          path: new URL(request.url).pathname,
          error: cause instanceof Error ? cause.message : String(cause),
        })
      )
      return await withRequestId(
        problem(500, "internal", "Publish request failed"),
        requestId
      )
    }
  },
} satisfies ExportedHandler<Env>

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string
): Promise<Response> {
  const url = new URL(request.url)
  if (url.hostname === env.RELAY_CONTROL_HOST) {
    return await env.EIDOS_RELAY.fetch(request)
  }
  if (isRelayPublicHostname(url.hostname, env)) {
    return await env.EIDOS_RELAY.fetch(request)
  }
  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ service: "eidos-publish", status: "ok" })
  }
  if (
    request.method === "GET" &&
    url.pathname === "/.well-known/eidos-publish"
  ) {
    return json({
      service: "eidos-publish",
      version: 1,
      implementationStatus: "preview",
      authentication: {
        scheme: "bearer",
        authority: new URL(env.AUTH_USERINFO_URL).origin,
      },
      publishRoot: env.PUBLISH_ROOT,
      drivers: [
        {
          id: "org.eidos.driver.eidos",
          version: "1.0",
          mediaTypes: ["application/vnd.eidos+sqlite3"],
          targetKinds: ["runtime"],
        },
        {
          id: MARKDOWN_DRIVER.id,
          version: MARKDOWN_DRIVER.version,
          mediaTypes: MARKDOWN_DRIVER.acceptedMediaTypes,
          targetKinds: MARKDOWN_DRIVER.targetKinds,
          maxEntrypointBytes: MARKDOWN_DRIVER.limits.maxEntrypointBytes,
        },
        {
          id: FORM_DRIVER.id,
          version: FORM_DRIVER.version,
          mediaTypes: FORM_DRIVER.acceptedMediaTypes,
          targetKinds: FORM_DRIVER.targetKinds,
          maxEntrypointBytes: FORM_DRIVER.limits.maxEntrypointBytes,
        },
      ],
      states: [
        "created",
        "uploading",
        "uploaded",
        "validating",
        "preparing",
        "ready",
        "failed",
        "deleting",
        "deleted",
      ],
    })
  }
  if (url.hostname !== env.CONTROL_HOST) {
    return await routePublicRequest(request, env, ctx)
  }

  if (
    request.method === "POST" &&
    url.pathname === "/_internal/account-summary"
  ) {
    return await internalAccountSummary(request, env)
  }

  if (request.method === "PUT" && url.pathname === "/_internal/handle") {
    return await internalPublishHandle(request, env)
  }

  const internalBrandingMatch =
    /^\/_internal\/publications\/([^/]+)\/branding$/.exec(url.pathname)
  if (request.method === "PUT" && internalBrandingMatch !== null) {
    return await internalPublicationBranding(
      request,
      env,
      publicationSlug(internalBrandingMatch[1])
    )
  }

  const principal = await authenticatePublishUser(request, env)
  if (principal.access.state === "blocked") {
    return problem(
      403,
      principal.access.plan === "free"
        ? "publish_subscription_required"
        : "publish_access_suspended",
      principal.access.plan === "free"
        ? "An active Publish subscription is required"
        : "Publish access is suspended"
    )
  }
  const tenant = await tenantForPrincipal(env, principal)

  if (request.method === "GET" && url.pathname === "/api/tenant") {
    return json(await tenantSummary(env, principal, tenant))
  }

  const formMetadataMatch = /^\/api\/forms\/([^/]+)$/.exec(url.pathname)
  if (request.method === "GET" && formMetadataMatch !== null) {
    const publicationId = versionIdentifier(formMetadataMatch[1])
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    const state = await owned.inbox.getState(publicationId)
    if (!state.ok) return durableResponse(state)
    const stats = await owned.inbox.getStats(publicationId)
    if (!stats.ok) return durableResponse(stats)
    return json({
      publication: owned.resolved.publication,
      version: owned.resolved.version,
      definition: owned.definition,
      inbox: state.value,
      stats: stats.value,
    })
  }

  const formInboxMatch = /^\/api\/forms\/([^/]+)\/inbox$/.exec(url.pathname)
  if (formInboxMatch !== null) {
    const publicationId = versionIdentifier(formInboxMatch[1])
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    if (request.method === "GET") {
      const after = boundedCursor(url.searchParams.get("after"))
      const limit = boundedLimit(url.searchParams.get("limit"))
      return durableResponse(
        await owned.inbox.listSubmissions(publicationId, after, limit)
      )
    }
    if (request.method === "POST") {
      const body = await collectorLeaseBody(request)
      return durableResponse(
        await owned.inbox.leaseSubmissions(
          publicationId,
          body.collectorId,
          body.generation,
          body.after,
          body.limit
        )
      )
    }
  }

  const formTakeoverMatch = /^\/api\/forms\/([^/]+)\/collector\/takeover$/.exec(
    url.pathname
  )
  if (request.method === "POST" && formTakeoverMatch !== null) {
    requiredIdempotencyKey(request)
    const publicationId = versionIdentifier(formTakeoverMatch[1])
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    const body = await collectorIdentityBody(request)
    return durableResponse(
      await owned.inbox.takeoverCollector(publicationId, body.collectorId)
    )
  }

  const formPauseMatch = /^\/api\/forms\/([^/]+)\/pause$/.exec(url.pathname)
  if (request.method === "POST" && formPauseMatch !== null) {
    requiredIdempotencyKey(request)
    const publicationId = versionIdentifier(formPauseMatch[1])
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    const body = await formPauseBody(request)
    return durableResponse(
      await owned.inbox.setPaused(publicationId, body.paused)
    )
  }

  const formAckMatch = /^\/api\/forms\/([^/]+)\/inbox\/([^/]+)\/ack$/.exec(
    url.pathname
  )
  if (request.method === "POST" && formAckMatch !== null) {
    requiredIdempotencyKey(request)
    const publicationId = versionIdentifier(formAckMatch[1])
    const submissionId = versionIdentifier(formAckMatch[2])
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    const body = await collectorAckBody(request)
    return durableResponse(
      await owned.inbox.acknowledgeImported(
        publicationId,
        submissionId,
        body.collectorId,
        body.generation,
        body.payloadSha256,
        principal.access.collect.importedRetentionDays
      )
    )
  }

  const formAttachmentMatch =
    /^\/api\/forms\/([^/]+)\/inbox\/([^/]+)\/attachments\/([^/]+)$/.exec(
      url.pathname
    )
  if (request.method === "GET" && formAttachmentMatch !== null) {
    const publicationId = versionIdentifier(formAttachmentMatch[1])
    const submissionId = versionIdentifier(formAttachmentMatch[2])
    const attachmentId = opaqueIdentifier(formAttachmentMatch[3], "attachment")
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    const attachment = await owned.inbox.getAttachment(
      publicationId,
      submissionId,
      attachmentId
    )
    if (!attachment.ok) return durableResponse(attachment)
    if (attachment.value.objectKey === null)
      return problem(
        503,
        "attachment_unavailable",
        "Submission attachment is unavailable"
      )
    const object = await env.PUBLISH_OBJECTS.get(attachment.value.objectKey)
    if (
      object === null ||
      object.size.toString() !== attachment.value.bytes ||
      object.customMetadata?.contentSha256 !== attachment.value.sha256
    ) {
      await object?.body.cancel()
      return problem(
        503,
        "attachment_unavailable",
        "Submission attachment is unavailable"
      )
    }
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "attachment",
        "Content-Length": attachment.value.bytes,
        "Content-Type": attachment.value.mediaType,
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

  const formExportMatch = /^\/api\/forms\/([^/]+)\/export$/.exec(url.pathname)
  if (request.method === "GET" && formExportMatch !== null) {
    const publicationId = versionIdentifier(formExportMatch[1])
    const owned = await ensureOwnedFormInbox(
      env,
      tenant.stub,
      tenant.publicSiteId,
      publicationId
    )
    if (owned instanceof Response) return owned
    return formExportResponse(owned.inbox, publicationId)
  }

  const publicationMatch = /^\/api\/publications\/([^/]+)$/.exec(url.pathname)
  if (request.method === "PUT" && publicationMatch !== null) {
    const slug = publicationSlug(publicationMatch[1])
    const idempotencyKey = requiredIdempotencyKey(request)
    const body = await optionalPublicationBody(request)
    const inputSha256 = await canonicalSha256({
      slug,
      visibility: body.visibility,
    })
    return durableResponse(
      await tenant.stub.createPublication(
        slug,
        body.visibility,
        principal.access,
        idempotencyKey,
        inputSha256
      ),
      201
    )
  }

  const publicationAccessMatch = /^\/api\/publications\/([^/]+)\/access$/.exec(
    url.pathname
  )
  if (request.method === "PUT" && publicationAccessMatch !== null) {
    const slug = publicationSlug(publicationAccessMatch[1])
    const idempotencyKey = requiredIdempotencyKey(request)
    const body = await publicationAccessBody(request)
    const inputSha256 =
      body.password === null
        ? await canonicalSha256({ slug, mode: body.mode })
        : await secretInputSha256(
            { slug, mode: body.mode, password: body.password },
            env.PUBLISH_PASSWORD_PEPPER
          )
    return durableResponse(
      await tenant.stub.setPublicationAccess(
        slug,
        body.mode,
        body.password,
        principal.access,
        idempotencyKey,
        inputSha256
      )
    )
  }

  const formPolicyMatch = /^\/api\/publications\/([^/]+)\/form-policy$/.exec(
    url.pathname
  )
  if (request.method === "PUT" && formPolicyMatch !== null) {
    const slug = publicationSlug(formPolicyMatch[1])
    const idempotencyKey = requiredIdempotencyKey(request)
    const body = await formPublicationPolicyBody(request)
    const inputSha256 = await canonicalSha256({ slug, ...body })
    const updated = await tenant.stub.setFormPublicationPolicy(
      slug,
      body.respondentAccess,
      body.allowMultipleResponses,
      idempotencyKey,
      inputSha256
    )
    if (!updated.ok) return durableResponse(updated)
    const resolved = await tenant.stub.resolvePublication(slug)
    if (
      resolved.ok &&
      resolved.value.version.driverId === "org.eidos.driver.form"
    ) {
      const synchronized = await env.FORM_INBOXES.getByName(
        tenant.publicSiteId
      ).syncPolicy(resolved.value.publication.publicationId, updated.value)
      if (!synchronized.ok) return durableResponse(synchronized)
    }
    return durableResponse(updated)
  }

  const publicationBrandingMatch =
    /^\/api\/publications\/([^/]+)\/branding$/.exec(url.pathname)
  if (request.method === "PUT" && publicationBrandingMatch !== null) {
    const slug = publicationSlug(publicationBrandingMatch[1])
    const idempotencyKey = requiredIdempotencyKey(request)
    const body = await publicationBrandingBody(request)
    const inputSha256 = await canonicalSha256({ slug, ...body })
    return durableResponse(
      await tenant.stub.setPublicationBranding(
        slug,
        body.showBranding,
        principal.access,
        idempotencyKey,
        inputSha256
      )
    )
  }

  const versionsMatch = /^\/api\/publications\/([^/]+)\/versions$/.exec(
    url.pathname
  )
  if (request.method === "POST" && versionsMatch !== null) {
    const slug = publicationSlug(versionsMatch[1])
    return await beginVersion(request, env, tenant.stub, principal, slug)
  }

  const versionMatch = /^\/api\/publications\/([^/]+)\/versions\/([^/]+)$/.exec(
    url.pathname
  )
  if (request.method === "GET" && versionMatch !== null) {
    return durableResponse(
      await tenant.stub.getVersionStatus(
        publicationSlug(versionMatch[1]),
        versionIdentifier(versionMatch[2])
      )
    )
  }

  const uploadMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/objects\/([0-9a-f]{64})$/.exec(
      url.pathname
    )
  if (request.method === "PUT" && uploadMatch !== null) {
    return await uploadSourceObject(
      request,
      env,
      tenant.stub,
      principal,
      tenant.publicSiteId,
      publicationSlug(uploadMatch[1]),
      versionIdentifier(uploadMatch[2]),
      uploadMatch[3]!
    )
  }

  const beginMultipartMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/objects\/([0-9a-f]{64})\/multipart$/.exec(
      url.pathname
    )
  if (request.method === "POST" && beginMultipartMatch !== null) {
    return await beginMultipartSource(
      request,
      env,
      tenant.stub,
      publicationSlug(beginMultipartMatch[1]),
      versionIdentifier(beginMultipartMatch[2]),
      beginMultipartMatch[3]!
    )
  }

  const multipartPartMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/multipart\/([^/]+)\/parts\/([0-9]+)$/.exec(
      url.pathname
    )
  if (request.method === "PUT" && multipartPartMatch !== null) {
    return await uploadMultipartPart(
      request,
      env,
      tenant.stub,
      publicationSlug(multipartPartMatch[1]),
      versionIdentifier(multipartPartMatch[2]),
      multipartSessionIdentifier(multipartPartMatch[3]),
      multipartPartNumber(multipartPartMatch[4])
    )
  }

  const completeMultipartMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/multipart\/([^/]+)\/complete$/.exec(
      url.pathname
    )
  if (request.method === "POST" && completeMultipartMatch !== null) {
    return await completeMultipartSource(
      request,
      env,
      tenant.stub,
      principal,
      tenant.publicSiteId,
      publicationSlug(completeMultipartMatch[1]),
      versionIdentifier(completeMultipartMatch[2]),
      multipartSessionIdentifier(completeMultipartMatch[3]),
      requestId
    )
  }

  const abortMultipartMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/multipart\/([^/]+)$/.exec(
      url.pathname
    )
  if (request.method === "DELETE" && abortMultipartMatch !== null) {
    return await abortMultipartSource(
      request,
      env,
      tenant.stub,
      publicationSlug(abortMultipartMatch[1]),
      versionIdentifier(abortMultipartMatch[2]),
      multipartSessionIdentifier(abortMultipartMatch[3])
    )
  }

  const finalizeUploadMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/complete$/.exec(
      url.pathname
    )
  if (request.method === "POST" && finalizeUploadMatch !== null) {
    return await finalizeVersionUpload(
      request,
      env,
      tenant.stub,
      principal,
      tenant.publicSiteId,
      publicationSlug(finalizeUploadMatch[1]),
      versionIdentifier(finalizeUploadMatch[2]),
      requestId
    )
  }

  const activateMatch =
    /^\/api\/publications\/([^/]+)\/versions\/([^/]+)\/activate$/.exec(
      url.pathname
    )
  if (request.method === "POST" && activateMatch !== null) {
    const slug = publicationSlug(activateMatch[1])
    const versionId = versionIdentifier(activateMatch[2])
    const idempotencyKey = requiredIdempotencyKey(request)
    const inputSha256 = await canonicalSha256({ slug, versionId })
    return await activatePublicationVersion(
      env,
      tenant.publicSiteId,
      tenant.stub,
      slug,
      versionId,
      principal,
      requestId,
      idempotencyKey,
      inputSha256
    )
  }

  const deleteMatch = /^\/api\/publications\/([^/]+)\/versions\/([^/]+)$/.exec(
    url.pathname
  )
  if (request.method === "DELETE" && deleteMatch !== null) {
    const slug = publicationSlug(deleteMatch[1])
    const versionId = versionIdentifier(deleteMatch[2])
    const idempotencyKey = requiredIdempotencyKey(request)
    const inputSha256 = await canonicalSha256({ slug, versionId })
    const deletion = await tenant.stub.beginVersionDeletion(
      slug,
      versionId,
      principal.userId,
      requestId,
      idempotencyKey,
      inputSha256
    )
    if (!deletion.ok) return durableResponse(deletion)
    if (deletion.value.state !== "deleted") {
      await tenant.stub.executeVersionDeletion(
        versionId,
        principal.userId,
        requestId
      )
    }
    return json({ versionId, state: "deleted" })
  }

  const rollbackMatch = /^\/api\/publications\/([^/]+)\/rollback$/.exec(
    url.pathname
  )
  if (request.method === "POST" && rollbackMatch !== null) {
    const slug = publicationSlug(rollbackMatch[1])
    const body = await rollbackBody(request)
    const idempotencyKey = requiredIdempotencyKey(request)
    const inputSha256 = await canonicalSha256({
      slug,
      versionId: body.versionId,
    })
    return await activatePublicationVersion(
      env,
      tenant.publicSiteId,
      tenant.stub,
      slug,
      body.versionId,
      principal,
      requestId,
      idempotencyKey,
      inputSha256
    )
  }

  return problem(404, "not_found", "Route not found")
}

async function internalAccountSummary(
  request: Request,
  env: Env
): Promise<Response> {
  if (!sharedServiceSecret(request, env.PUBLISH_SERVICE_SECRET)) {
    return problem(404, "not_found", "Route not found")
  }
  const principal = parsePrincipal(await boundedJson(request, 4096))
  const tenant = await tenantForPrincipal(env, principal)
  return json(await tenantSummary(env, principal, tenant))
}

async function internalPublishHandle(
  request: Request,
  env: Env
): Promise<Response> {
  if (!sharedServiceSecret(request, env.PUBLISH_SERVICE_SECRET)) {
    return problem(404, "not_found", "Route not found")
  }
  const value = await boundedJson(request, 8192)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  ) {
    throw badRequest(
      "invalid_publish_handle",
      "Publish handle request is invalid"
    )
  }
  const record = value as Record<string, unknown>
  const principal = parsePrincipal(record.principal)
  if (principal.access.state === "blocked") {
    return problem(
      403,
      principal.access.plan === "free"
        ? "publish_subscription_required"
        : "publish_access_suspended",
      principal.access.plan === "free"
        ? "An active Publish subscription is required"
        : "Publish access is suspended"
    )
  }
  if (!principal.access.handle) {
    return problem(
      403,
      "publish_handle_not_allowed",
      "A Publish handle is not included with this subscription"
    )
  }
  if (typeof record.handle !== "string" || !validHandle(record.handle)) {
    throw badRequest(
      "invalid_publish_handle",
      "Use 3 to 30 lowercase letters, digits, or hyphens, starting with a letter"
    )
  }

  const tenant = await tenantForPrincipal(env, principal)
  const handle = env.PUBLISH_HANDLES.getByName(record.handle)
  const claim = await handle.beginClaim(record.handle, tenant.publicSiteId)
  if (
    claim === null ||
    !(await tenant.stub.recordHandleClaim(
      record.handle,
      claim.claimId,
      claim.expiresAt
    )) ||
    !(await handle.activate(tenant.publicSiteId, claim.claimId)) ||
    !(await tenant.stub.activateHandleClaim(record.handle, claim.claimId))
  ) {
    return problem(
      409,
      "publish_handle_unavailable",
      "This Publish handle is not available"
    )
  }

  const activeHandle = await tenant.stub.getActiveHandle()
  if (activeHandle !== record.handle) {
    return problem(
      409,
      "publish_handle_conflict",
      "The Publish handle could not be activated"
    )
  }
  return json(
    await tenantSummary(env, principal, {
      ...tenant,
      preferredHandle: activeHandle,
    })
  )
}

async function internalPublicationBranding(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  if (!sharedServiceSecret(request, env.PUBLISH_SERVICE_SECRET)) {
    return problem(404, "not_found", "Route not found")
  }
  const idempotencyKey = requiredIdempotencyKey(request)
  const value = await boundedJson(request, 8192)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  ) {
    throw badRequest(
      "invalid_publication_branding",
      "Publication branding request is invalid"
    )
  }
  const record = value as Record<string, unknown>
  const principal = parsePrincipal(record.principal)
  if (principal.access.state === "blocked") {
    return problem(
      403,
      principal.access.plan === "free"
        ? "publish_subscription_required"
        : "publish_access_suspended",
      principal.access.plan === "free"
        ? "An active Publish subscription is required"
        : "Publish access is suspended"
    )
  }
  if (typeof record.showBranding !== "boolean") {
    throw badRequest(
      "invalid_publication_branding",
      "Publication branding request is invalid"
    )
  }
  const tenant = await tenantForPrincipal(env, principal)
  const inputSha256 = await canonicalSha256({
    slug,
    showBranding: record.showBranding,
  })
  return durableResponse(
    await tenant.stub.setPublicationBranding(
      slug,
      record.showBranding,
      principal.access,
      idempotencyKey,
      inputSha256
    )
  )
}

async function tenantSummary(
  env: Env,
  principal: PublishPrincipal,
  tenant: Awaited<ReturnType<typeof tenantForPrincipal>>
): Promise<TenantSummary> {
  const [publications, usage, storage] = await Promise.all([
    tenant.stub.listPublications(),
    tenant.stub.getCurrentUsage(),
    tenant.stub.getStorageUsage(),
  ])
  return {
    publicSiteId: tenant.publicSiteId,
    canonicalHost: canonicalHost(
      env,
      tenant.preferredHandle,
      tenant.publicSiteId
    ),
    preferredHandle: tenant.preferredHandle,
    access: principal.access,
    publications,
    usage,
    storage,
  }
}

async function tenantForPrincipal(env: Env, principal: PublishPrincipal) {
  const locator = env.TENANT_LOCATORS.getByName(principal.userId)
  const publicSiteId = await locator.getOrCreate(principal.userId)
  const stub = env.PUBLISH_TENANTS.getByName(publicSiteId)
  await stub.initialize(principal.userId, publicSiteId, principal.access, null)
  const preferredHandle = await stub.getActiveHandle()
  return { publicSiteId, preferredHandle, stub }
}

async function ensureOwnedFormInbox(
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  tenantId: string,
  publicationId: string
) {
  const resolved = await tenant.resolvePublicationById(publicationId)
  if (!resolved.ok) return durableResponse(resolved)
  const inbox = env.FORM_INBOXES.getByName(tenantId)
  const active = await inbox.getActiveRevision(
    publicationId,
    resolved.value.version.versionId
  )
  if (!active.ok) return durableResponse(active)
  if (
    active.value.revision.definitionSha256 !==
    resolved.value.version.entrypoint.sha256
  ) {
    return problem(
      503,
      "form_definition_unavailable",
      "Published Form definition is unavailable"
    )
  }
  try {
    const definition = parsePublishedFormDefinition(
      JSON.parse(active.value.revision.definitionJson) as unknown
    )
    if (
      definition.source.schemaFingerprint !==
      active.value.revision.schemaFingerprint
    ) {
      throw new Error("Form schema fingerprint differs")
    }
    return { inbox, resolved: resolved.value, definition }
  } catch {
    return problem(
      503,
      "form_definition_unavailable",
      "Published Form definition is unavailable"
    )
  }
}

async function activatePublicationVersion(
  env: Env,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  versionId: string,
  principal: PublishPrincipal,
  requestId: string,
  idempotencyKey: string,
  inputSha256: string
): Promise<Response> {
  const activated = await tenant.activateVersion(
    slug,
    versionId,
    principal.userId,
    requestId,
    principal.access,
    idempotencyKey,
    inputSha256
  )
  if (!activated.ok) return durableResponse(activated)
  const version = await tenant.getVersionStatus(slug, versionId)
  if (!version.ok) return durableResponse(version)
  if (version.value.driverId === "org.eidos.driver.form") {
    await activateFormRevision(
      env,
      tenantId,
      tenant,
      activated.value.publicationId
    )
  }
  return durableResponse(activated)
}

async function beginVersion(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  principal: PublishPrincipal,
  slug: string
): Promise<Response> {
  const idempotencyKey = requiredIdempotencyKey(request)
  const body = await beginVersionBody(request)
  const bundle = await validateSourceBundle(body.manifest, {
    maxObjectBytes: principal.access.maxObjectBytes,
  })
  if (
    body.driver.id !== bundle.driver.id ||
    body.driver.version !== bundle.driver.version
  ) {
    return problem(
      400,
      "unsupported_driver",
      "The requested Driver is not installed"
    )
  }
  const inputSha256 = await canonicalSha256({ slug, ...body })
  const begun = await tenant.beginVersionUpload(
    slug,
    bundle,
    crypto.randomUUID(),
    body.activate,
    idempotencyKey,
    inputSha256
  )
  if (!begun.ok) return durableResponse(begun)

  const manifest = manifestBytes(bundle.manifest)
  const stored = await env.PUBLISH_OBJECTS.put(
    begun.value.version.sourceManifestKey,
    manifest,
    {
      onlyIf: { etagDoesNotMatch: "*" },
      sha256: hexBytes(bundle.manifestSha256),
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        sourceManifestSha256: bundle.manifestSha256,
        sourceManifestBytes: manifest.byteLength.toString(),
      },
    }
  )
  if (stored === null) {
    const existing = await env.PUBLISH_OBJECTS.head(
      begun.value.version.sourceManifestKey
    )
    if (
      existing === null ||
      existing.customMetadata?.sourceManifestSha256 !== bundle.manifestSha256 ||
      existing.customMetadata.sourceManifestBytes !==
        manifest.byteLength.toString()
    ) {
      return problem(
        409,
        "source_manifest_conflict",
        "Source manifest object already differs"
      )
    }
  }
  return json(
    {
      ...begun.value.version,
      activate: body.activate,
      uploadPlan: begun.value.objects,
      storage: {
        usedBytes: begun.value.storageBytes,
        maxBytes: begun.value.maxStorageBytes,
      },
    },
    201
  )
}

async function uploadSourceObject(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  principal: PublishPrincipal,
  _tenantId: string,
  slug: string,
  versionId: string,
  sha256: string
): Promise<Response> {
  if (request.body === null)
    return problem(400, "source_body_required", "Source body is required")
  const idempotencyKey = requiredIdempotencyKey(request)
  const length = decimalHeader(request.headers.get("content-length"))
  if (length === null) {
    return problem(
      411,
      "content_length_required",
      "Content-Length is required for this upload path"
    )
  }
  if (length > BigInt(principal.access.maxObjectBytes)) {
    return problem(
      413,
      "source_object_too_large",
      "Object exceeds the 1 GiB limit"
    )
  }
  if (length > SINGLE_UPLOAD_MAX_BYTES) {
    return problem(
      413,
      "multipart_required",
      "Use multipart upload for source files larger than 95 MiB"
    )
  }
  const declaredSha256 = request.headers.get("x-eidos-content-sha256")
  if (declaredSha256 !== sha256) {
    return problem(
      400,
      "source_digest_required",
      "X-Eidos-Content-SHA256 must be 64 lowercase hexadecimal characters"
    )
  }
  const inputSha256 = await canonicalSha256({
    slug,
    versionId,
    bytes: length.toString(),
    sha256,
  })
  const authorized = await tenant.authorizeObjectUpload(
    slug,
    versionId,
    sha256,
    length.toString(),
    idempotencyKey,
    inputSha256
  )
  if (!authorized.ok) return durableResponse(authorized)
  if (authorized.value.state === "ready") {
    await request.body.cancel()
    return json(sourceObjectResponse(authorized.value))
  }

  const stored = await env.PUBLISH_OBJECTS.put(
    authorized.value.objectKey,
    request.body,
    {
      onlyIf: { etagDoesNotMatch: "*" },
      sha256: hexBytes(sha256),
      httpMetadata: { contentType: authorized.value.mediaType },
      customMetadata: {
        contentSha256: sha256,
        contentBytes: length.toString(),
      },
    }
  )
  if (stored === null) {
    const conflict = await verifyStoredObject(
      env.PUBLISH_OBJECTS,
      authorized.value.objectKey,
      length,
      sha256
    )
    if (conflict !== null) return conflict
  } else if (BigInt(stored.size) !== length) {
    return problem(
      409,
      "source_size_mismatch",
      "Stored source size does not match Content-Length"
    )
  }
  const completed = await tenant.markObjectReady(
    slug,
    versionId,
    sha256,
    length.toString(),
    `complete:${idempotencyKey}`,
    inputSha256
  )
  if (!completed.ok) return durableResponse(completed)
  return json(sourceObjectResponse(completed.value))
}

async function startWorkflowForVersion(
  env: Env,
  principal: PublishPrincipal,
  tenantId: string,
  slug: string,
  version: PublicationVersionRecord,
  requestId: string
): Promise<{ id: string; status: string }> {
  return await ensurePublishWorkflow(env, {
    tenantId,
    publicationId: version.publicationId,
    slug,
    versionId: version.versionId,
    jobId: version.jobId,
    activate: version.activateOnReady,
    actor: principal.userId,
    requestId,
    runtimeIdleSeconds: principal.access.runtimeIdleSeconds,
  })
}

async function finalizeVersionUpload(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  principal: PublishPrincipal,
  tenantId: string,
  slug: string,
  versionId: string,
  requestId: string
): Promise<Response> {
  const idempotencyKey = requiredIdempotencyKey(request)
  const inputSha256 = await canonicalSha256({ slug, versionId })
  const completed = await tenant.finalizeVersionUpload(
    slug,
    versionId,
    idempotencyKey,
    inputSha256
  )
  if (!completed.ok) return durableResponse(completed)
  const workflow = await startWorkflowForVersion(
    env,
    principal,
    tenantId,
    slug,
    completed.value,
    requestId
  )
  return json({ ...completed.value, workflow })
}

async function beginMultipartSource(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  versionId: string,
  sha256: string
): Promise<Response> {
  const idempotencyKey = requiredIdempotencyKey(request)
  const existing = await tenant.getMultipartSession(slug, versionId, sha256)
  if (!existing.ok) return durableResponse(existing)
  if (existing.value !== null) {
    return json({
      sessionId: existing.value.sessionId,
      versionId,
      state: existing.value.state,
      recommendedPartBytes: (64 * 1024 * 1024).toString(),
    })
  }
  const object = await tenant.getVersionObject(slug, versionId, sha256)
  if (!object.ok) return durableResponse(object)
  if (object.value.state === "ready") {
    return json({
      sha256: object.value.sha256,
      bytes: object.value.bytes,
      mediaType: object.value.mediaType,
      state: object.value.state,
    })
  }
  const upload = await env.PUBLISH_OBJECTS.createMultipartUpload(
    object.value.objectKey,
    {
      httpMetadata: { contentType: object.value.mediaType },
      customMetadata: {
        contentBytes: object.value.bytes,
        contentSha256: object.value.sha256,
      },
    }
  )
  const sessionId = randomOpaqueId()
  const inputSha256 = await canonicalSha256({ slug, versionId, sha256 })
  const begun = await tenant.beginMultipartUpload(
    slug,
    versionId,
    sha256,
    sessionId,
    upload.uploadId,
    idempotencyKey,
    inputSha256
  )
  if (!begun.ok) {
    await upload.abort()
    return durableResponse(begun)
  }
  if (begun.value.uploadId !== upload.uploadId) await upload.abort()
  return json(
    {
      sessionId: begun.value.sessionId,
      versionId,
      state: begun.value.state,
      recommendedPartBytes: (64 * 1024 * 1024).toString(),
    },
    201
  )
}

async function uploadMultipartPart(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  versionId: string,
  sessionId: string,
  partNumber: number
): Promise<Response> {
  if (request.body === null)
    return problem(400, "source_body_required", "Part body is required")
  const idempotencyKey = requiredIdempotencyKey(request)
  const length = decimalHeader(request.headers.get("content-length"))
  if (length === null)
    return problem(411, "content_length_required", "Content-Length is required")
  if (length === 0n || length > MULTIPART_PART_MAX_BYTES) {
    return problem(
      413,
      "multipart_part_size_invalid",
      "Multipart part must contain 1 byte to 100 MiB"
    )
  }
  const declaredSha256 = request.headers.get("x-eidos-content-sha256")
  if (declaredSha256 === null || !SHA256.test(declaredSha256)) {
    return problem(
      400,
      "source_digest_required",
      "X-Eidos-Content-SHA256 must contain lowercase SHA-256"
    )
  }
  const session = await tenant.findMultipartSession(slug, versionId, sessionId)
  if (!session.ok || session.value.sessionId !== sessionId) {
    return problem(404, "multipart_not_found", "Multipart upload not found")
  }
  const inputSha256 = await canonicalSha256({
    slug,
    versionId,
    sessionId,
    partNumber,
    bytes: length.toString(),
    sha256: declaredSha256,
  })
  const authorized = await tenant.authorizeMultipartPart(
    sessionId,
    partNumber,
    length.toString(),
    declaredSha256,
    idempotencyKey,
    inputSha256
  )
  if (!authorized.ok) return durableResponse(authorized)

  const [objectBody, digestBody] = request.body.tee()
  const digestPromise = hashReadableStream(digestBody)
  const uploaded = await env.PUBLISH_OBJECTS.resumeMultipartUpload(
    session.value.objectKey,
    session.value.uploadId
  ).uploadPart(partNumber, objectBody)
  const digest = await digestPromise
  if (digest.sha256 !== declaredSha256 || digest.bytes !== length) {
    return problem(
      409,
      "multipart_part_digest_mismatch",
      "Multipart part digest or size differs"
    )
  }
  return durableResponse(
    await tenant.recordMultipartPart(sessionId, partNumber, uploaded.etag)
  )
}

interface StoredMultipartObject {
  readonly size: number
  readonly customMetadata?: Record<string, string>
}

interface MultipartObjectStore {
  head(key: string): Promise<StoredMultipartObject | null>
  resumeMultipartUpload(
    key: string,
    uploadId: string
  ): {
    complete(parts: R2UploadedPart[]): Promise<unknown>
  }
}

export async function authoritativeMultipartObject(
  store: MultipartObjectStore,
  objectKey: string,
  uploadId: string,
  parts: R2UploadedPart[]
): Promise<StoredMultipartObject | null> {
  const existing = await store.head(objectKey)
  if (existing !== null) return existing
  await store.resumeMultipartUpload(objectKey, uploadId).complete(parts)
  // R2 writes are strongly consistent. The post-completion HEAD is the
  // authoritative object metadata; complete() may omit optional metadata in
  // its immediate R2Object representation.
  return await store.head(objectKey)
}

async function completeMultipartSource(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  _principal: PublishPrincipal,
  _tenantId: string,
  slug: string,
  versionId: string,
  sessionId: string,
  _requestId: string
): Promise<Response> {
  const idempotencyKey = requiredIdempotencyKey(request)
  const sessionResult = await tenant.findMultipartSession(
    slug,
    versionId,
    sessionId
  )
  if (!sessionResult.ok || sessionResult.value.sessionId !== sessionId) {
    return problem(404, "multipart_not_found", "Multipart upload not found")
  }
  const objectResult = await tenant.getVersionObject(
    slug,
    versionId,
    sessionResult.value.sha256
  )
  if (!objectResult.ok) return durableResponse(objectResult)
  const objectDescriptor = objectResult.value
  if (
    sessionResult.value.state === "completed" &&
    objectDescriptor.state === "ready"
  ) {
    return json(sourceObjectResponse(objectDescriptor))
  }
  const parts = await tenant.listMultipartParts(sessionId)
  if (!parts.ok) return durableResponse(parts)
  const totalBytes = parts.value.reduce(
    (total, part) => total + BigInt(part.bytes),
    0n
  )
  if (totalBytes.toString() !== objectDescriptor.bytes) {
    return problem(
      409,
      "source_size_mismatch",
      "Multipart parts do not equal the manifest byte count"
    )
  }
  const object = await authoritativeMultipartObject(
    env.PUBLISH_OBJECTS,
    sessionResult.value.objectKey,
    sessionResult.value.uploadId,
    parts.value.map((part) => ({
      partNumber: part.partNumber,
      etag: part.etag!,
    }))
  )
  if (object === null) {
    return problem(503, "source_unavailable", "Completed source is unavailable")
  }
  if (
    object.size.toString() !== objectDescriptor.bytes ||
    object.customMetadata?.contentBytes !== objectDescriptor.bytes ||
    object.customMetadata.contentSha256 !== objectDescriptor.sha256
  ) {
    return problem(
      409,
      "source_size_mismatch",
      "Completed object size differs from the manifest"
    )
  }
  const stored = await env.PUBLISH_OBJECTS.get(sessionResult.value.objectKey)
  if (stored === null)
    return problem(503, "source_unavailable", "Completed source is unavailable")
  const digest = await hashReadableStream(stored.body)
  if (
    digest.bytes.toString() !== objectDescriptor.bytes ||
    digest.sha256 !== objectDescriptor.sha256
  ) {
    await env.PUBLISH_OBJECTS.delete(sessionResult.value.objectKey)
    await tenant.markFailed(
      versionId,
      "multipart-verify",
      "source_digest_mismatch"
    )
    return problem(
      409,
      "source_digest_mismatch",
      "Completed source digest differs from the manifest"
    )
  }
  const inputSha256 = await canonicalSha256({ slug, versionId, sessionId })
  const completed = await tenant.completeMultipartUpload(
    slug,
    versionId,
    sessionId,
    objectDescriptor.bytes,
    objectDescriptor.sha256,
    idempotencyKey,
    inputSha256
  )
  if (!completed.ok) return durableResponse(completed)
  return json(sourceObjectResponse(completed.value))
}

async function abortMultipartSource(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  versionId: string,
  sessionId: string
): Promise<Response> {
  const idempotencyKey = requiredIdempotencyKey(request)
  const sessionResult = await tenant.findMultipartSession(
    slug,
    versionId,
    sessionId
  )
  if (!sessionResult.ok || sessionResult.value.sessionId !== sessionId) {
    return problem(404, "multipart_not_found", "Multipart upload not found")
  }
  if (sessionResult.value.state === "completed") {
    return problem(
      409,
      "multipart_completed",
      "Completed multipart upload cannot be aborted"
    )
  }
  if (sessionResult.value.state === "uploading") {
    await env.PUBLISH_OBJECTS.resumeMultipartUpload(
      sessionResult.value.objectKey,
      sessionResult.value.uploadId
    ).abort()
  }
  const inputSha256 = await canonicalSha256({ slug, versionId, sessionId })
  return durableResponse(
    await tenant.markMultipartAborted(
      slug,
      versionId,
      sessionId,
      idempotencyKey,
      inputSha256
    )
  )
}

async function requireVersion(
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  versionId: string
): Promise<PublicationVersionRecord> {
  const version = await tenant.getVersionStatus(slug, versionId)
  if (!version.ok) throw badRequest(version.error.code, version.error.message)
  return version.value
}

async function ensurePublishWorkflow(
  env: Env,
  params: PublishWorkflowParams
): Promise<{ id: string; status: string }> {
  const orchestrationMode: string = env.ORCHESTRATION_MODE
  if (orchestrationMode === "control-only-test") {
    return { id: params.jobId, status: "test-skipped" }
  }
  try {
    const instance = await env.PUBLISH_WORKFLOW.create({
      id: params.jobId,
      params,
    })
    const status = await instance.status()
    return { id: instance.id, status: status.status }
  } catch (cause) {
    try {
      const instance = await env.PUBLISH_WORKFLOW.get(params.jobId)
      const status = await instance.status()
      if (status.status !== "unknown")
        return { id: instance.id, status: status.status }
    } catch {
      // The original create error remains authoritative if reconciliation fails.
    }
    throw cause
  }
}

async function verifyStoredObject(
  store: R2Bucket,
  objectKey: string,
  length: bigint,
  sha256: string
): Promise<Response | null> {
  const stored = await store.head(objectKey)
  return stored !== null &&
    BigInt(stored.size) === length &&
    stored.customMetadata?.contentSha256 === sha256 &&
    stored.customMetadata.contentBytes === length.toString()
    ? null
    : problem(409, "source_upload_conflict", "Source object already differs")
}

function sourceObjectResponse(object: ContentObjectRecord) {
  return {
    sha256: object.sha256,
    bytes: object.bytes,
    mediaType: object.mediaType,
    state: object.state,
  }
}

async function collectorIdentityBody(
  request: Request
): Promise<{ collectorId: string }> {
  const value = await boundedJson(request, 2048)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as { collectorId?: unknown }).collectorId !== "string"
  ) {
    throw badRequest("invalid_collector", "Collector request is invalid")
  }
  return {
    collectorId: opaqueIdentifier(
      (value as { collectorId: string }).collectorId,
      "collector"
    ),
  }
}

async function collectorLeaseBody(request: Request): Promise<{
  collectorId: string
  generation: number
  after: number
  limit: number
}> {
  const value = await boundedJson(request, 4096)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("invalid_collector", "Collector lease request is invalid")
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some(
      (key) => !["collectorId", "generation", "after", "limit"].includes(key)
    ) ||
    typeof record.collectorId !== "string" ||
    !Number.isSafeInteger(record.generation) ||
    (record.generation as number) < 0 ||
    !Number.isSafeInteger(record.after ?? 0) ||
    ((record.after as number | undefined) ?? 0) < 0 ||
    !Number.isSafeInteger(record.limit ?? 50) ||
    ((record.limit as number | undefined) ?? 50) < 1 ||
    ((record.limit as number | undefined) ?? 50) > 100
  ) {
    throw badRequest("invalid_collector", "Collector lease request is invalid")
  }
  return {
    collectorId: opaqueIdentifier(record.collectorId, "collector"),
    generation: record.generation as number,
    after: (record.after as number | undefined) ?? 0,
    limit: (record.limit as number | undefined) ?? 50,
  }
}

async function collectorAckBody(request: Request): Promise<{
  collectorId: string
  generation: number
  payloadSha256: string
}> {
  const value = await boundedJson(request, 4096)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(
      "invalid_collector",
      "Collector acknowledgement is invalid"
    )
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== 3 ||
    typeof record.collectorId !== "string" ||
    !Number.isSafeInteger(record.generation) ||
    (record.generation as number) < 0 ||
    typeof record.payloadSha256 !== "string" ||
    !SHA256.test(record.payloadSha256)
  ) {
    throw badRequest(
      "invalid_collector",
      "Collector acknowledgement is invalid"
    )
  }
  return {
    collectorId: opaqueIdentifier(record.collectorId, "collector"),
    generation: record.generation as number,
    payloadSha256: record.payloadSha256,
  }
}

async function formPauseBody(request: Request): Promise<{ paused: boolean }> {
  const value = await boundedJson(request, 1024)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as { paused?: unknown }).paused !== "boolean"
  ) {
    throw badRequest("invalid_form_state", "Form pause request is invalid")
  }
  return { paused: (value as { paused: boolean }).paused }
}

function boundedCursor(value: string | null): number {
  if (value === null || value === "") return 0
  if (!/^(?:0|[1-9][0-9]{0,14})$/.test(value)) {
    throw badRequest("invalid_cursor", "Inbox cursor is invalid")
  }
  const cursor = Number(value)
  if (!Number.isSafeInteger(cursor)) {
    throw badRequest("invalid_cursor", "Inbox cursor is invalid")
  }
  return cursor
}

function boundedLimit(value: string | null): number {
  if (value === null || value === "") return 50
  if (!/^[1-9][0-9]{0,2}$/.test(value)) {
    throw badRequest("invalid_limit", "Inbox limit is invalid")
  }
  const limit = Number(value)
  if (limit > 100) throw badRequest("invalid_limit", "Inbox limit is invalid")
  return limit
}

function opaqueIdentifier(value: string | undefined, kind: string): string {
  if (value === undefined || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw badRequest(`invalid_${kind}`, `Invalid ${kind} ID`)
  }
  return value
}

function formExportResponse(
  inbox: DurableObjectStub<FormInboxDurableObject>,
  publicationId: string
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = 0
      try {
        while (true) {
          const page = await inbox.listSubmissions(publicationId, cursor, 100)
          if (!page.ok) throw new Error(page.error.code)
          for (const submission of page.value.submissions) {
            controller.enqueue(
              new TextEncoder().encode(`${JSON.stringify(submission)}\n`)
            )
          }
          if (page.value.nextCursor === null) break
          cursor = Number(page.value.nextCursor)
        }
        controller.close()
      } catch (cause) {
        controller.error(cause)
      }
    },
  })
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="eidos-form-${publicationId}.ndjson"`,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

async function optionalPublicationBody(
  request: Request
): Promise<{ visibility: "public" | "private" }> {
  if (request.body === null || request.headers.get("content-length") === "0") {
    return { visibility: "public" }
  }
  const value = await boundedJson(request, 1024)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "visibility") ||
    ((value as { visibility?: unknown }).visibility !== "public" &&
      (value as { visibility?: unknown }).visibility !== "private")
  ) {
    throw badRequest("invalid_publication", "Publication body is invalid")
  }
  return {
    visibility: (value as { visibility: "public" | "private" }).visibility,
  }
}

async function publicationAccessBody(
  request: Request
): Promise<PublicationAccessBody> {
  const value = await boundedJson(request, 2048)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(
      "invalid_publication_access",
      "Publication access body is invalid"
    )
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some((key) => !["mode", "password"].includes(key)) ||
    (record.mode !== "public" &&
      record.mode !== "password" &&
      record.mode !== "private")
  ) {
    throw badRequest(
      "invalid_publication_access",
      "Password access requires 8 to 128 characters without control characters"
    )
  }
  if (record.mode === "password") {
    if (
      typeof record.password !== "string" ||
      !validPublicationPassword(record.password)
    ) {
      throw badRequest(
        "invalid_publication_access",
        "Password access requires 8 to 128 characters without control characters"
      )
    }
    return { mode: "password", password: record.password }
  }
  if (record.password !== undefined) {
    throw badRequest(
      "invalid_publication_access",
      "A password is accepted only when access mode is password"
    )
  }
  return {
    mode: record.mode,
    password: null,
  }
}

async function formPublicationPolicyBody(
  request: Request
): Promise<FormPublicationPolicyBody> {
  const value = await boundedJson(request, 1024)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("invalid_form_policy", "Form policy body is invalid")
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== 2 ||
    (record.respondentAccess !== "anyone" &&
      record.respondentAccess !== "signed_in") ||
    typeof record.allowMultipleResponses !== "boolean" ||
    (record.respondentAccess === "anyone" && !record.allowMultipleResponses)
  ) {
    throw badRequest(
      "invalid_form_policy",
      "One response per user requires signed-in respondents"
    )
  }
  return {
    respondentAccess: record.respondentAccess,
    allowMultipleResponses: record.allowMultipleResponses,
  }
}

async function publicationBrandingBody(
  request: Request
): Promise<PublicationBrandingBody> {
  const value = await boundedJson(request, 1024)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as { showBranding?: unknown }).showBranding !== "boolean"
  ) {
    throw badRequest(
      "invalid_publication_branding",
      "Publication branding request is invalid"
    )
  }
  return {
    showBranding: (value as { showBranding: boolean }).showBranding,
  }
}

async function beginVersionBody(request: Request): Promise<BeginVersionBody> {
  const value = await boundedJson(request, 64 * 1024)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(
      "invalid_version_request",
      "Version request body is invalid"
    )
  }
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some(
      (key) => !["driver", "manifest", "activate"].includes(key)
    )
  ) {
    throw badRequest(
      "invalid_version_request",
      "Version request body is invalid"
    )
  }
  const driver = record.driver
  const driverRecord =
    typeof driver === "object" && driver !== null && !Array.isArray(driver)
      ? (driver as Record<string, unknown>)
      : null
  if (
    driverRecord === null ||
    Object.keys(driverRecord).length !== 2 ||
    driverRecord.version !== "1.0" ||
    (driverRecord.id !== EIDOS_DRIVER.id &&
      driverRecord.id !== MARKDOWN_DRIVER.id &&
      driverRecord.id !== FORM_DRIVER.id)
  ) {
    throw badRequest(
      "unsupported_driver",
      "The requested Driver is not installed"
    )
  }
  if (record.activate !== undefined && typeof record.activate !== "boolean") {
    throw badRequest("invalid_version_request", "activate must be boolean")
  }
  return {
    driver:
      driverRecord.id === FORM_DRIVER.id
        ? { id: FORM_DRIVER.id, version: FORM_DRIVER.version }
        : driverRecord.id === MARKDOWN_DRIVER.id
          ? { id: MARKDOWN_DRIVER.id, version: MARKDOWN_DRIVER.version }
          : { id: EIDOS_DRIVER.id, version: EIDOS_DRIVER.version },
    manifest: record.manifest as SourceBundleManifest,
    activate: record.activate ?? true,
  }
}

async function rollbackBody(request: Request): Promise<{ versionId: string }> {
  const value = await boundedJson(request, 1024)
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as { versionId?: unknown }).versionId !== "string"
  ) {
    throw badRequest("invalid_rollback_request", "Rollback request is invalid")
  }
  return {
    versionId: versionIdentifier((value as { versionId: string }).versionId),
  }
}

async function boundedJson(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  const contentLength = decimalHeader(request.headers.get("content-length"))
  if (contentLength !== null && contentLength > BigInt(maxBytes)) {
    throw badRequest(
      "control_body_too_large",
      "Control request body is too large"
    )
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw badRequest(
      "control_body_too_large",
      "Control request body is too large"
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw badRequest("invalid_json", "Request body must be valid JSON")
  }
}

function requiredIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")
  if (value === null || !IDEMPOTENCY_KEY.test(value)) {
    throw badRequest(
      "idempotency_key_required",
      "Idempotency-Key must contain 8 to 128 visible ASCII characters"
    )
  }
  return value
}

function sourcePath(value: string | undefined): string {
  if (value === undefined)
    throw badRequest("invalid_source_path", "Source path is invalid")
  try {
    return value
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/")
  } catch {
    throw badRequest("invalid_source_path", "Source path is invalid")
  }
}

function canonicalHost(
  env: Env,
  preferredHandle: string | null,
  publicSiteId: string
): string {
  return publicationHostname(preferredHandle ?? publicSiteId, env)
}

function validHandle(value: string): boolean {
  return (
    /^[a-z](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(value) &&
    !reservedPublishHandle(value) &&
    !RESERVED_HANDLES.has(value)
  )
}

function publicationSlug(value: string | undefined): string {
  if (value === undefined || !SLUG.test(value)) {
    throw badRequest(
      "invalid_publication_slug",
      "Publication slug must contain 1 to 64 lowercase letters, digits, or hyphens"
    )
  }
  return value
}

function versionIdentifier(value: string | undefined): string {
  if (value === undefined || !VERSION_ID.test(value)) {
    throw badRequest("invalid_version_id", "Invalid Version ID")
  }
  return value
}

function multipartSessionIdentifier(value: string | undefined): string {
  if (value === undefined || !MULTIPART_SESSION_ID.test(value)) {
    throw badRequest("invalid_multipart_session", "Invalid multipart session")
  }
  return value
}

function multipartPartNumber(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]{0,3}$/.test(value)) {
    throw badRequest(
      "invalid_multipart_part",
      "Multipart part number must be between 1 and 10000"
    )
  }
  const part = Number(value)
  if (part > 10_000)
    throw badRequest(
      "invalid_multipart_part",
      "Multipart part number is too large"
    )
  return part
}

function decimalHeader(value: string | null): bigint | null {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/.test(value)) return null
  return BigInt(value)
}

function hexBytes(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes.buffer
}

function hexDigest(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function secretInputSha256(
  value: unknown,
  secret: string
): Promise<string> {
  const encodedSecret = new TextEncoder().encode(secret ?? "")
  if (encodedSecret.byteLength < 32) {
    throw new Error("PUBLISH_PASSWORD_PEPPER must contain at least 32 bytes")
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encodedSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return hexDigest(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`publish-access:${canonicalJson(value)}`)
    )
  )
}

async function hashReadableStream(
  body: ReadableStream<Uint8Array>
): Promise<{ sha256: string; bytes: bigint }> {
  const hasher = sha256.create()
  const reader = body.getReader()
  let bytes = 0n
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      hasher.update(next.value)
      bytes += BigInt(next.value.byteLength)
    }
    return { sha256: hexDigest(hasher.digest()), bytes }
  } finally {
    reader.releaseLock()
  }
}

function randomOpaqueId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function sharedServiceSecret(request: Request, secret: string): boolean {
  if (new TextEncoder().encode(secret ?? "").byteLength < 32) return false
  const supplied = request.headers.get("x-eidos-publish-service") ?? ""
  const length = Math.max(supplied.length, secret.length)
  let difference = supplied.length ^ secret.length
  for (let index = 0; index < length; index += 1) {
    difference |=
      (supplied.charCodeAt(index) || 0) ^ (secret.charCodeAt(index) || 0)
  }
  return difference === 0
}

function durableResponse<T>(
  result: DurableResult<T>,
  successStatus = 200
): Response {
  return result.ok
    ? json(result.value, successStatus)
    : problem(result.error.status, result.error.code, result.error.message)
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

function problem(status: number, code: string, message: string): Response {
  const headers =
    status === 401
      ? { "WWW-Authenticate": 'Bearer realm="publish.eidos.space"' }
      : undefined
  return Response.json(
    { error: { code, message, retryable: status >= 500 } },
    {
      status,
      headers: { "Cache-Control": "private, no-store", ...(headers ?? {}) },
    }
  )
}

function badRequest(code: string, message: string): PublishAuthenticationError {
  return new PublishAuthenticationError(400, code, message)
}
