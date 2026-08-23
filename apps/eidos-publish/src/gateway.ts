import { publicationHostLabel, publicationHostname } from "./hostnames"
import {
  completeFormSubmission,
  formClientScriptResponse,
  formDefinitionResponse,
  formDocumentCsp,
  initializeFormSubmission,
  uploadFormAttachment,
} from "./collect"

import type {
  DurableResult,
  PublicationVersionRecord,
  UsagePeriodRecord,
} from "./contracts"
import { refreshTenantEntitlementsIfStale } from "./entitlements"
import { runtimeDescriptor, type EidosRuntimeContainer } from "./runtime"
import type { PublishHandleDurableObject, PublishTenant } from "./tenant"

const PUBLIC_SITE_ID = /^u-[0-9abcdefghjkmnpqrstvwxyz]{16}$/
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const EIDOS_FILE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const RUNTIME_PORT = 8420
const MAX_TICKET_SECONDS = 300
const MAX_RUNTIME_REQUEST_BYTES = 1024 * 1024
const MAX_RUNTIME_RESPONSE_BYTES = 16 * 1024 * 1024
const VIEWER_COOKIE = "__Host-eidos_publish_viewer"
const PASSWORD_COOKIE_PREFIX = "__Host-eidos_publish_password_"
const MAX_PASSWORD_SESSION_SECONDS = 12 * 60 * 60
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])
const PUBLICATION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ")
const PASSWORD_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ")
const MARKDOWN_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: https:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ")

interface RuntimeTicketClaims {
  iss: "eidos-publish"
  aud: string
  tenantId: string
  publicationId: string
  versionId: string
  servingTargetSha256: string
  visibility: "public" | "private"
  accessMode: "public" | "password" | "private"
  accessRevision: number
  iat: number
  exp: number
  kid: "v1"
}

interface ViewerSessionClaims {
  iss: "eidos-publish-viewer"
  aud: string
  sub: string
  iat: number
  exp: number
  kid: "v1"
}

interface PasswordSessionClaims {
  iss: "eidos-publish-password"
  aud: string
  publicationId: string
  accessRevision: number
  iat: number
  exp: number
  kid: "v1"
}

interface PublicationNavigation {
  tableId: string | null
  viewId: string | null
}

export async function routePublicRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url)
  const label = publicationHostLabel(url.hostname, env)
  if (label === null) return publicNotFound()
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    url.pathname.startsWith("/assets/")
  ) {
    return await publicAsset(request, env, url.pathname)
  }
  const tenantId = await resolveTenantId(env, label)
  if (tenantId === null) return publicNotFound()
  const tenant = env.PUBLISH_TENANTS.getByName(tenantId)
  try {
    await refreshTenantEntitlementsIfStale(env, tenantId, tenant)
  } catch {
    return runtimeProblem(
      503,
      "identity_unavailable",
      "Current Publish access is unavailable"
    )
  }

  if (request.method === "GET" && url.pathname === "/_eidos/forms/client.js") {
    return formClientScriptResponse()
  }

  const formDefinitionMatch = /^\/_eidos\/forms\/([^/]+)\/definition$/.exec(
    url.pathname
  )
  if (request.method === "GET" && formDefinitionMatch !== null) {
    const slug = shellSlug(`/${formDefinitionMatch[1] ?? ""}`)
    if (slug === null) return publicNotFound()
    const authorized = await resolveAuthorizedForm(
      request,
      env,
      label,
      tenantId,
      tenant,
      slug
    )
    if (authorized instanceof Response) return authorized
    return await formDefinitionResponse(
      env,
      tenantId,
      authorized.audience,
      authorized.resolved
    )
  }

  const formInitMatch = /^\/_eidos\/forms\/([^/]+)\/submissions\/init$/.exec(
    url.pathname
  )
  if (request.method === "POST" && formInitMatch !== null) {
    const slug = shellSlug(`/${formInitMatch[1] ?? ""}`)
    if (slug === null) return publicNotFound()
    const authorized = await resolveAuthorizedForm(
      request,
      env,
      label,
      tenantId,
      tenant,
      slug
    )
    if (authorized instanceof Response) return authorized
    const access = await tenant.getAccessGrant()
    return await initializeFormSubmission(
      request,
      env,
      tenantId,
      authorized.audience,
      slug,
      authorized.resolved,
      access.collect
    )
  }

  const formAttachmentMatch =
    /^\/_eidos\/forms\/([^/]+)\/submissions\/([^/]+)\/attachments\/([^/]+)$/.exec(
      url.pathname
    )
  if (request.method === "PUT" && formAttachmentMatch !== null) {
    const slug = shellSlug(`/${formAttachmentMatch[1] ?? ""}`)
    if (slug === null) return publicNotFound()
    const authorized = await resolveAuthorizedForm(
      request,
      env,
      label,
      tenantId,
      tenant,
      slug
    )
    if (authorized instanceof Response) return authorized
    return await uploadFormAttachment(
      request,
      env,
      tenantId,
      authorized.audience,
      formAttachmentMatch[2] ?? "",
      formAttachmentMatch[3] ?? "",
      authorized.resolved
    )
  }

  const formCompleteMatch =
    /^\/_eidos\/forms\/([^/]+)\/submissions\/([^/]+)\/complete$/.exec(
      url.pathname
    )
  if (request.method === "POST" && formCompleteMatch !== null) {
    const slug = shellSlug(`/${formCompleteMatch[1] ?? ""}`)
    if (slug === null) return publicNotFound()
    const authorized = await resolveAuthorizedForm(
      request,
      env,
      label,
      tenantId,
      tenant,
      slug
    )
    if (authorized instanceof Response) return authorized
    return await completeFormSubmission(
      request,
      env,
      tenantId,
      authorized.audience,
      authorized.resolved,
      formCompleteMatch[2] ?? ""
    )
  }

  if (request.method === "GET" && url.pathname === "/_eidos/private/exchange") {
    return await exchangePrivateViewer(request, env, tenantId, tenant)
  }

  if (request.method === "POST" && url.pathname === "/_eidos/password") {
    return await exchangePublicationPassword(
      request,
      env,
      label,
      tenantId,
      tenant
    )
  }

  if (request.method === "POST" && url.pathname === "/_eidos/session") {
    return await createRuntimeSession(
      request,
      env,
      ctx,
      label,
      tenantId,
      tenant
    )
  }
  const publishedFileMatch =
    /^\/_eidos\/files\/([^/]+)\/([0-9a-f-]{36})\/([0-9a-f]{64})\/(.+)$/.exec(
      url.pathname
    )
  if (
    publishedFileMatch !== null &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    return await servePublishedFile(
      request,
      env,
      label,
      tenantId,
      tenant,
      publishedFileMatch[1] ?? "",
      publishedFileMatch[2] ?? "",
      publishedFileMatch[3] ?? "",
      publishedFileMatch[4] ?? ""
    )
  }
  const runtimeMatch = /^\/_eidos\/runtime\/([^/]+)\/(api\/.*)$/.exec(
    url.pathname
  )
  if (runtimeMatch !== null) {
    return await proxyRuntime(
      request,
      env,
      ctx,
      label,
      tenantId,
      tenant,
      runtimeMatch[1] ?? "",
      "/" + (runtimeMatch[2] ?? "")
    )
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const slug = shellSlug(url.pathname)
    if (slug !== null) {
      const resolved = await tenant.resolvePublication(slug)
      if (!resolved.ok) return publicNotFound()
      const canonical = canonicalLabel(resolved.value.canonicalHandle, tenantId)
      if (canonical !== label) {
        const redirect = new URL(request.url)
        redirect.hostname = publicationHostname(canonical, env)
        stripRedirectSecrets(redirect)
        return Response.redirect(redirect.toString(), 308)
      }
      if (
        resolved.value.publication.visibility === "private" &&
        !(await privateViewerAuthorized(
          request,
          resolved.value.ownerUserId,
          publicationHostname(canonical, env),
          env.RUNTIME_TICKET_SECRET
        ))
      ) {
        return privateAuthorizationRedirect(request, env, canonical, slug)
      }
      if (
        resolved.value.publication.accessMode === "password" &&
        !(await passwordViewerAuthorized(
          request,
          slug,
          resolved.value.publication.publicationId,
          resolved.value.publication.accessRevision,
          publicationHostname(canonical, env),
          env.PUBLISH_PASSWORD_SESSION_SECRET
        ))
      ) {
        return passwordChallenge(request, slug)
      }
      if (resolved.value.version.servingTarget?.kind === "static") {
        return await serveStaticDocument(
          request,
          env,
          tenant,
          resolved.value.version,
          resolved.value.publication.accessMode !== "public"
        )
      }
      return await publicAsset(
        request,
        env,
        "/index.html",
        slug,
        resolved.value.publication.accessMode !== "public"
      )
    }
  }
  return publicNotFound()
}

async function createRuntimeSession(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  hostLabel: string,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>
): Promise<Response> {
  const body = await boundedSessionBody(request)
  const resolved = await tenant.resolvePublication(body.slug)
  if (!resolved.ok) return publicNotFound()
  const canonical = canonicalLabel(resolved.value.canonicalHandle, tenantId)
  if (canonical !== hostLabel) return publicNotFound()
  if (
    resolved.value.publication.visibility === "private" &&
    !(await privateViewerAuthorized(
      request,
      resolved.value.ownerUserId,
      publicationHostname(canonical, env),
      env.RUNTIME_TICKET_SECRET
    ))
  ) {
    return publicNotFound()
  }
  if (
    resolved.value.publication.accessMode === "password" &&
    !(await passwordViewerAuthorized(
      request,
      body.slug,
      resolved.value.publication.publicationId,
      resolved.value.publication.accessRevision,
      publicationHostname(canonical, env),
      env.PUBLISH_PASSWORD_SESSION_SECRET
    ))
  ) {
    return publicNotFound()
  }
  const version = requireRuntimeVersion(resolved.value.version)
  const descriptor = runtimeDescriptor(
    version,
    tenantId,
    resolved.value.runtimeIdleSeconds,
    env.RUNTIME_SHARD_COUNT
  )
  const now = Math.floor(Date.now() / 1000)
  const claims: RuntimeTicketClaims = {
    iss: "eidos-publish",
    aud: publicationHostname(canonical, env),
    tenantId,
    publicationId: resolved.value.publication.publicationId,
    versionId: version.versionId,
    servingTargetSha256: version.servingTargetSha256!,
    visibility: resolved.value.publication.visibility,
    accessMode: resolved.value.publication.accessMode,
    accessRevision: resolved.value.publication.accessRevision,
    iat: now,
    exp: now + MAX_TICKET_SECONDS,
    kid: "v1",
  }
  const runtime: DurableObjectStub<EidosRuntimeContainer> =
    env.EIDOS_RUNTIMES.getByName(descriptor.shardKey)
  const orchestrationMode: string = env.ORCHESTRATION_MODE
  const state =
    orchestrationMode === "control-only-test" ? null : await runtime.getState()
  const containerReady =
    state?.status === "healthy" || state?.status === "running"
  const ready =
    containerReady && orchestrationMode !== "control-only-test"
      ? await runtime.isVersionReady(descriptor).catch(() => false)
      : false
  const authorized = await tenant.authorizeRuntimeRequest(
    resolved.value.publication.publicationId,
    version.versionId,
    await clientIdentityHash(request, env.RUNTIME_TICKET_SECRET),
    !containerReady && orchestrationMode !== "control-only-test",
    null
  )
  if (!authorized.ok) return runtimeUsageFailure(authorized)
  if (!ready && orchestrationMode !== "control-only-test") {
    ctx.waitUntil(
      runtime
        .wakeVersion(descriptor)
        .then(async () => await tenant.recordRuntimeReady(version.versionId))
        .catch(async (cause: unknown) => {
          await tenant.recordRuntimeFailure(version.versionId)
          console.error(
            JSON.stringify({
              message: "runtime wake failed",
              tenantId,
              publicationId: claims.publicationId,
              versionId: claims.versionId,
              error: cause instanceof Error ? cause.message : String(cause),
            })
          )
        })
    )
  }
  return Response.json(
    {
      status: ready ? "ready" : "starting",
      retryAfterMilliseconds: ready ? 0 : 1000,
      ticket: await signTicket(claims, env.RUNTIME_TICKET_SECRET),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      runtimeBase: `/_eidos/runtime/${body.slug}`,
    },
    {
      status: ready ? 200 : 202,
      headers: {
        "Cache-Control": "private, no-store",
        ...(ready ? {} : { "Retry-After": "1" }),
      },
    }
  )
}

async function proxyRuntime(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  hostLabel: string,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  runtimePath: string
): Promise<Response> {
  if (!SLUG.test(slug)) return publicNotFound()
  if (!allowedRuntimeRequest(request.method, runtimePath))
    return publicNotFound()
  const requestLength = boundedContentLength(
    request.headers.get("content-length")
  )
  if (requestLength !== null && requestLength > MAX_RUNTIME_REQUEST_BYTES) {
    return runtimeProblem(
      413,
      "runtime_request_too_large",
      "Runtime request is too large"
    )
  }
  const token = runtimeAuthorization(request)
  if (token === null)
    return runtimeProblem(
      401,
      "runtime_ticket_required",
      "Runtime ticket is required"
    )
  const claims = await verifyTicket(token, env.RUNTIME_TICKET_SECRET)
  if (
    claims === null ||
    claims.aud !== publicationHostname(hostLabel, env) ||
    claims.tenantId !== tenantId
  ) {
    return runtimeProblem(
      401,
      "invalid_runtime_ticket",
      "Runtime ticket is invalid or expired"
    )
  }
  const resolved = await tenant.resolvePublication(slug)
  if (!resolved.ok) return publicNotFound()
  const version = requireRuntimeVersion(resolved.value.version)
  const descriptor = runtimeDescriptor(
    version,
    tenantId,
    resolved.value.runtimeIdleSeconds,
    env.RUNTIME_SHARD_COUNT
  )
  if (
    claims.publicationId !== resolved.value.publication.publicationId ||
    claims.versionId !== version.versionId ||
    claims.servingTargetSha256 !== version.servingTargetSha256 ||
    claims.visibility !== resolved.value.publication.visibility ||
    claims.accessMode !== resolved.value.publication.accessMode ||
    claims.accessRevision !== resolved.value.publication.accessRevision
  ) {
    return runtimeProblem(
      401,
      "stale_runtime_ticket",
      "Runtime ticket no longer targets the active Version"
    )
  }
  const requestLeaseId = crypto.randomUUID()
  const authorized = await tenant.authorizeRuntimeRequest(
    resolved.value.publication.publicationId,
    version.versionId,
    await clientIdentityHash(request, env.RUNTIME_TICKET_SECRET),
    false,
    requestLeaseId
  )
  if (!authorized.ok) return runtimeUsageFailure(authorized)
  if (request.method === "POST" && runtimePath === "/api/assets/resolve") {
    const body = await boundedAssetResolveBody(request)
    const asset = await tenant.resolvePublishedAsset(
      version.versionId,
      body.entryId
    )
    await tenant.completeRuntimeRequest(requestLeaseId)
    if (!asset.ok) return publicNotFound()
    const name = assetName(asset.value.uri)
    return Response.json(
      {
        ok: true,
        value: {
          leaseId: crypto.randomUUID(),
          entryId: asset.value.entryId,
          purpose: body.purpose,
          mediaType: asset.value.mediaType,
          name,
          size: asset.value.bytes,
          expiresAt: new Date(claims.exp * 1000).toISOString(),
          resourceToken: `/_eidos/files/${slug}/${version.versionId}/${asset.value.sha256}/${asset.value.uri}`,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  }
  if (request.method === "POST" && runtimePath === "/api/assets/release") {
    await request.body?.cancel()
    await tenant.completeRuntimeRequest(requestLeaseId)
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  }
  const headers = runtimeProxyRequestHeaders(request.headers)
  const internal = new URL(`http://127.0.0.1:${RUNTIME_PORT}${runtimePath}`)
  internal.search = new URL(request.url).search
  const proxyRequest = new Request(internal, {
    method: request.method,
    headers,
    body:
      request.body === null
        ? null
        : byteLimitedStream(request.body, MAX_RUNTIME_REQUEST_BYTES),
    redirect: "manual",
  })
  let response: Response
  try {
    response = await env.EIDOS_RUNTIMES.getByName(
      descriptor.shardKey
    ).fetchVersion(descriptor, proxyRequest)
  } catch (cause) {
    await tenant.completeRuntimeRequest(requestLeaseId)
    if (
      cause instanceof PublicRuntimeError &&
      cause.code === "runtime_payload_too_large"
    ) {
      return runtimeProblem(
        413,
        "runtime_request_too_large",
        "Runtime request is too large"
      )
    }
    throw cause
  }
  const responseLength = boundedContentLength(
    response.headers.get("content-length")
  )
  if (responseLength !== null && responseLength > MAX_RUNTIME_RESPONSE_BYTES) {
    await response.body?.cancel()
    await tenant.completeRuntimeRequest(requestLeaseId)
    return runtimeProblem(
      502,
      "runtime_result_too_large",
      "Runtime response exceeds the hosted limit"
    )
  }
  const headersOut = proxyResponseHeaders(response.headers)
  if (response.body === null) {
    await tenant.completeRuntimeRequest(requestLeaseId)
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: headersOut,
    })
  }
  headersOut.delete("Content-Length")
  const limited = limitedRuntimeResponse(
    response.body,
    MAX_RUNTIME_RESPONSE_BYTES,
    ctx,
    async () => await tenant.completeRuntimeRequest(requestLeaseId)
  )
  return new Response(limited, {
    status: response.status,
    statusText: response.statusText,
    headers: headersOut,
  })
}

async function servePublishedFile(
  request: Request,
  env: Env,
  hostLabel: string,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string,
  versionId: string,
  sha256: string,
  uri: string
): Promise<Response> {
  if (!SLUG.test(slug)) return publicNotFound()
  const path = publishedFilePath(uri)
  if (path === null) return publicNotFound()
  const resolved = await tenant.resolvePublication(slug)
  if (!resolved.ok) return publicNotFound()
  const canonical = canonicalLabel(resolved.value.canonicalHandle, tenantId)
  if (
    canonical !== hostLabel ||
    resolved.value.version.versionId !== versionId
  ) {
    return publicNotFound()
  }
  const hostname = publicationHostname(canonical, env)
  if (
    resolved.value.publication.visibility === "private" &&
    !(await privateViewerAuthorized(
      request,
      resolved.value.ownerUserId,
      hostname,
      env.RUNTIME_TICKET_SECRET
    ))
  ) {
    return publicNotFound()
  }
  if (
    resolved.value.publication.accessMode === "password" &&
    !(await passwordViewerAuthorized(
      request,
      slug,
      resolved.value.publication.publicationId,
      resolved.value.publication.accessRevision,
      hostname,
      env.PUBLISH_PASSWORD_SESSION_SECRET
    ))
  ) {
    return publicNotFound()
  }
  const asset = await tenant.resolvePublishedFile(versionId, path)
  if (!asset.ok || asset.value.sha256 !== sha256) return publicNotFound()
  const protectedAsset = resolved.value.publication.accessMode !== "public"
  if (request.method === "HEAD") {
    const object = await env.PUBLISH_OBJECTS.head(asset.value.objectKey)
    if (!validStoredAsset(object, asset.value.bytes, sha256)) {
      return publicNotFound()
    }
    return new Response(null, {
      headers: publishedAssetHeaders(
        asset.value.mediaType,
        assetName(asset.value.path),
        asset.value.bytes,
        protectedAsset
      ),
    })
  }
  const range = new Headers()
  const requestedRange = request.headers.get("range")
  if (requestedRange !== null) range.set("Range", requestedRange)
  const object = await env.PUBLISH_OBJECTS.get(asset.value.objectKey, {
    ...(requestedRange === null ? {} : { range }),
  })
  if (object === null) return publicNotFound()
  if (!validStoredAsset(object, asset.value.bytes, sha256)) {
    await object.body.cancel()
    return publicNotFound()
  }
  const headers = publishedAssetHeaders(
    asset.value.mediaType,
    assetName(asset.value.path),
    asset.value.bytes,
    protectedAsset
  )
  const normalizedRange =
    requestedRange === null ? null : normalizedObjectRange(object.range)
  if (normalizedRange !== null) {
    headers.set(
      "Content-Range",
      `bytes ${normalizedRange.offset}-${normalizedRange.offset + normalizedRange.length - 1}/${asset.value.bytes}`
    )
    headers.set("Content-Length", normalizedRange.length.toString())
  }
  return new Response(object.body, {
    status: normalizedRange === null ? 200 : 206,
    headers,
  })
}

async function serveStaticDocument(
  request: Request,
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  version: PublicationVersionRecord,
  protectedDocument: boolean
): Promise<Response> {
  const target = version.servingTarget
  if (
    version.state !== "ready" ||
    version.targetHealth !== "healthy" ||
    target?.kind !== "static" ||
    version.servingTargetSha256 === null
  ) {
    return publicNotFound()
  }
  const artifact = await tenant.resolvePublishedArtifact(
    version.versionId,
    target.entrypoint
  )
  if (!artifact.ok) return publicNotFound()
  const headers = new Headers({
    "Cache-Control": protectedDocument
      ? "private, no-store"
      : "public, max-age=60",
    "Content-Length": artifact.value.bytes,
    "Content-Security-Policy":
      version.driverId === "org.eidos.driver.form"
        ? formDocumentCsp()
        : MARKDOWN_CSP,
    "Content-Type": artifact.value.mediaType,
    "Cross-Origin-Resource-Policy": "same-origin",
    ETag: `"sha256-${artifact.value.sha256}"`,
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  })
  if (request.method === "HEAD") {
    const object = await env.PUBLISH_OBJECTS.head(artifact.value.objectKey)
    return validStoredAsset(object, artifact.value.bytes, artifact.value.sha256)
      ? new Response(null, { headers })
      : publicNotFound()
  }
  const object = await env.PUBLISH_OBJECTS.get(artifact.value.objectKey)
  if (
    object === null ||
    !validStoredAsset(object, artifact.value.bytes, artifact.value.sha256)
  ) {
    await object?.body.cancel()
    return publicNotFound()
  }
  return new Response(object.body, { headers })
}

function validStoredAsset(
  object: R2Object | null,
  bytes: string,
  sha256: string
): boolean {
  return (
    object !== null &&
    object.size.toString() === bytes &&
    object.customMetadata?.contentBytes === bytes &&
    object.customMetadata.contentSha256 === sha256
  )
}

function publishedAssetHeaders(
  mediaType: string,
  name: string,
  bytes: string,
  protectedAsset: boolean
): Headers {
  const inline = new Set([
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]).has(mediaType)
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": protectedAsset
      ? "private, no-store"
      : "public, max-age=31536000, immutable",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Content-Length": bytes,
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": mediaType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  })
  return headers
}

function normalizedObjectRange(
  range: R2Range | undefined
): { offset: number; length: number } | null {
  if (
    range === undefined ||
    !("offset" in range) ||
    !("length" in range) ||
    range.offset === undefined ||
    range.length === undefined
  ) {
    return null
  }
  return { offset: range.offset, length: range.length }
}

function assetName(uri: string): string {
  const decoded = decodeURIComponent(uri)
  const name = decoded.slice(decoded.lastIndexOf("/") + 1)
  return name.length === 0 ? "attachment" : name.slice(0, 255)
}

function publishedFilePath(uri: string): string | null {
  if (/%2f|%5c/i.test(uri)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(uri)
  } catch {
    return null
  }
  if (
    decoded.length === 0 ||
    decoded !== decoded.normalize("NFC") ||
    decoded.startsWith("/") ||
    decoded.includes("\\") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    /[\u0000-\u001f\u007f]/.test(decoded) ||
    decoded
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") ||
    decoded.split("/").map(encodeURIComponent).join("/") !== uri
  ) {
    return null
  }
  return decoded
}

async function resolveTenantId(
  env: Env,
  label: string
): Promise<string | null> {
  if (PUBLIC_SITE_ID.test(label)) return label
  if (!validHandle(label)) return null
  const handle: DurableObjectStub<PublishHandleDurableObject> =
    env.PUBLISH_HANDLES.getByName(label)
  return await handle.resolve()
}

async function resolveAuthorizedForm(
  request: Request,
  env: Env,
  hostLabel: string,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>,
  slug: string
) {
  const resolved = await tenant.resolvePublication(slug)
  if (!resolved.ok) return publicNotFound()
  const canonical = canonicalLabel(resolved.value.canonicalHandle, tenantId)
  if (
    canonical !== hostLabel ||
    resolved.value.version.driverId !== "org.eidos.driver.form"
  ) {
    return publicNotFound()
  }
  const audience = publicationHostname(canonical, env)
  if (
    resolved.value.publication.visibility === "private" &&
    !(await privateViewerAuthorized(
      request,
      resolved.value.ownerUserId,
      audience,
      env.RUNTIME_TICKET_SECRET
    ))
  ) {
    return publicNotFound()
  }
  if (
    resolved.value.publication.accessMode === "password" &&
    !(await passwordViewerAuthorized(
      request,
      slug,
      resolved.value.publication.publicationId,
      resolved.value.publication.accessRevision,
      audience,
      env.PUBLISH_PASSWORD_SESSION_SECRET
    ))
  ) {
    return publicNotFound()
  }
  return { audience, resolved: resolved.value }
}

function requireRuntimeVersion(
  version: PublicationVersionRecord
): PublicationVersionRecord {
  if (
    version.state !== "ready" ||
    version.targetHealth !== "healthy" ||
    version.servingTarget?.kind !== "runtime" ||
    version.servingTarget.runtimeProfile !== "eidos-serve-publish/1" ||
    version.servingTarget.versionId !== version.versionId ||
    version.servingTargetSha256 === null
  ) {
    throw new PublicRuntimeError("runtime_unavailable")
  }
  return version
}

async function publicAsset(
  request: Request,
  env: Env,
  pathname: string,
  publishSlug?: string,
  privateShell = false
): Promise<Response> {
  const assetUrl = new URL(request.url)
  assetUrl.hostname = env.CONTROL_HOST
  assetUrl.pathname = pathname
  assetUrl.search = ""
  const assetRequest = new Request(assetUrl, {
    method: request.method,
    headers: request.headers,
  })
  const response = await env.ASSETS.fetch(assetRequest)
  const headers = new Headers(response.headers)
  headers.set(
    "Cache-Control",
    pathname === "/index.html"
      ? privateShell
        ? "private, no-store"
        : "public, max-age=60"
      : "public, max-age=31536000, immutable"
  )
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Referrer-Policy", "same-origin")
  headers.set("Content-Security-Policy", PUBLICATION_CSP)
  headers.set("X-Frame-Options", "DENY")
  headers.set("Cross-Origin-Resource-Policy", "same-origin")
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  )
  if (pathname === "/index.html" && publishSlug !== undefined && response.ok) {
    const html = await response.text()
    headers.delete("Content-Length")
    headers.delete("ETag")
    return new Response(
      html.replace(
        "<head>",
        `<head><meta name="eidos-publish-slug" content="${publishSlug}">`
      ),
      { status: response.status, headers }
    )
  }
  return new Response(response.body, { status: response.status, headers })
}

async function exchangePrivateViewer(
  request: Request,
  env: Env,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>
): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  if (
    code === null ||
    !/^[A-Za-z0-9_-]{43}$/.test(code) ||
    url.searchParams.getAll("code").length !== 1 ||
    [...url.searchParams.keys()].some(
      (key) => key !== "code" && key !== "table" && key !== "view"
    )
  ) {
    return publicNotFound()
  }
  const navigation = publicationNavigation(url.searchParams)
  requireExchangeSecret(env.PUBLISH_VIEWER_EXCHANGE_SECRET)
  let response: Response
  try {
    const exchangeUrl = new URL(
      "/api/publish/viewer-authorize",
      env.AUTH_USERINFO_URL
    )
    response = await env.EIDOS_ACCOUNT.fetch(exchangeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Eidos-Publish-Exchange": env.PUBLISH_VIEWER_EXCHANGE_SECRET,
      },
      body: JSON.stringify({ code, host: url.hostname }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    return runtimeProblem(
      503,
      "viewer_authorization_unavailable",
      "Viewer authorization is unavailable"
    )
  }
  if (!response.ok) {
    await response.body?.cancel()
    return publicNotFound()
  }
  const exchanged = await boundedExchangeResponse(response)
  if (exchanged === null) return publicNotFound()
  const resolved = await tenant.resolvePublication(exchanged.publicationSlug)
  if (
    !resolved.ok ||
    resolved.value.publication.visibility !== "private" ||
    resolved.value.ownerUserId !== exchanged.userId
  ) {
    return publicNotFound()
  }
  const canonical = canonicalLabel(resolved.value.canonicalHandle, tenantId)
  if (publicationHostname(canonical, env) !== url.hostname)
    return publicNotFound()
  const now = Math.floor(Date.now() / 1000)
  const viewer: ViewerSessionClaims = {
    iss: "eidos-publish-viewer",
    aud: url.hostname,
    sub: exchanged.userId,
    iat: now,
    exp: now + MAX_TICKET_SECONDS,
    kid: "v1",
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: publicationLocation(exchanged.publicationSlug, navigation),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${VIEWER_COOKIE}=${await signViewerSession(viewer, env.RUNTIME_TICKET_SECRET)}; Max-Age=${MAX_TICKET_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  })
}

function privateAuthorizationRedirect(
  request: Request,
  env: Env,
  canonicalLabelValue: string,
  slug: string
): Response {
  const authorize = new URL(
    "/api/publish/viewer-authorize",
    env.AUTH_USERINFO_URL
  )
  authorize.searchParams.set(
    "host",
    publicationHostname(canonicalLabelValue, env)
  )
  authorize.searchParams.set("slug", slug)
  appendPublicationNavigation(
    authorize.searchParams,
    publicationNavigation(new URL(request.url).searchParams)
  )
  return new Response(null, {
    status: 303,
    headers: {
      Location: authorize.toString(),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}

async function exchangePublicationPassword(
  request: Request,
  env: Env,
  hostLabel: string,
  tenantId: string,
  tenant: DurableObjectStub<PublishTenant>
): Promise<Response> {
  const body = await boundedPasswordBody(request)
  const resolved = await tenant.resolvePublication(body.slug)
  if (!resolved.ok) return publicNotFound()
  const canonical = canonicalLabel(resolved.value.canonicalHandle, tenantId)
  if (
    canonical !== hostLabel ||
    resolved.value.publication.accessMode !== "password"
  ) {
    return publicNotFound()
  }
  const verification = await tenant.verifyPublicationPassword(
    body.slug,
    body.password,
    await clientIdentityHash(request, env.PUBLISH_PASSWORD_SESSION_SECRET)
  )
  if (!verification.ok) {
    return verification.error.status === 429
      ? passwordChallenge(
          request,
          body.slug,
          "Too many attempts. Wait five minutes and try again.",
          429,
          body.navigation
        )
      : passwordChallenge(
          request,
          body.slug,
          "That password is not correct.",
          401,
          body.navigation
        )
  }
  const now = Math.floor(Date.now() / 1000)
  const claims: PasswordSessionClaims = {
    iss: "eidos-publish-password",
    aud: publicationHostname(canonical, env),
    publicationId: verification.value.publicationId,
    accessRevision: verification.value.accessRevision,
    iat: now,
    exp: now + MAX_PASSWORD_SESSION_SECONDS,
    kid: "v1",
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: publicationLocation(body.slug, body.navigation),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${passwordCookieName(body.slug)}=${await signPasswordSession(claims, env.PUBLISH_PASSWORD_SESSION_SECRET)}; Max-Age=${MAX_PASSWORD_SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  })
}

async function passwordViewerAuthorized(
  request: Request,
  slug: string,
  publicationId: string,
  accessRevision: number,
  audience: string,
  secret: string
): Promise<boolean> {
  const token = cookieValue(
    request.headers.get("cookie"),
    passwordCookieName(slug)
  )
  if (token === null) return false
  const claims = await verifyPasswordSession(token, secret)
  return (
    claims !== null &&
    claims.aud === audience &&
    claims.publicationId === publicationId &&
    claims.accessRevision === accessRevision
  )
}

function passwordCookieName(slug: string): string {
  return PASSWORD_COOKIE_PREFIX + slug
}

function passwordChallenge(
  request: Request,
  slug: string,
  error = "",
  status = 401,
  navigation = publicationNavigation(new URL(request.url).searchParams)
): Response {
  const headers = passwordHeaders()
  if (request.method === "HEAD") return new Response(null, { status, headers })
  const errorMarkup =
    error.length === 0
      ? ""
      : `<p role="alert" class="error">${escapeHtml(error)}</p>`
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Password required · Eidos Publish</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f3ed; color: #171714; }
    main { width: min(28rem, calc(100vw - 2rem)); border-top: 2px solid currentColor; padding-top: 1.5rem; }
    .eyebrow { margin: 0; font: 600 .7rem/1.2 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; color: #5d5b54; }
    h1 { margin: .75rem 0 0; font: 500 2rem/1.05 ui-serif, Georgia, serif; letter-spacing: -.03em; }
    .path { margin: .75rem 0 0; font: .78rem/1.4 ui-monospace, monospace; color: #5d5b54; }
    form { margin-top: 2rem; }
    label { display: block; font-size: .8rem; font-weight: 600; }
    input { width: 100%; margin-top: .6rem; min-height: 2.75rem; border: 1px solid #858177; border-radius: 0; background: #fff; color: #171714; padding: .7rem .8rem; font: inherit; }
    input:focus { outline: 2px solid #315f54; outline-offset: 2px; }
    button { width: 100%; min-height: 2.75rem; margin-top: .9rem; border: 0; border-radius: 0; background: #171714; color: #fff; font: 600 .85rem/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
    .error { margin: .9rem 0 0; color: #a2372d; font-size: .8rem; }
    footer { margin-top: 2rem; border-top: 1px solid #c9c5ba; padding-top: 1rem; font: .7rem/1.5 ui-monospace, monospace; color: #77736a; }
    @media (prefers-color-scheme: dark) { body { background: #191917; color: #eeece5; } input { background: #242420; color: #eeece5; border-color: #77736a; } button { background: #eeece5; color: #191917; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Eidos Publish</p>
    <h1>Password required</h1>
    <p class="path">/${slug}</p>
    ${errorMarkup}
    <form method="post" action="/_eidos/password">
      <input type="hidden" name="slug" value="${slug}">
      ${navigationHiddenInput("table", navigation.tableId)}
      ${navigationHiddenInput("view", navigation.viewId)}
      <label for="password">Publication password</label>
      <input id="password" name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required autofocus>
      <button type="submit">Open publication</button>
    </form>
    <footer>This publication is protected by its publisher.</footer>
  </main>
</body>
</html>`
  return new Response(html, { status, headers })
}

function passwordHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": PASSWORD_CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Resource-Policy": "same-origin",
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function publicationNavigation(
  parameters: URLSearchParams
): PublicationNavigation {
  return {
    tableId: uniqueEidosFileId(parameters, "table"),
    viewId: uniqueEidosFileId(parameters, "view"),
  }
}

function uniqueEidosFileId(
  parameters: URLSearchParams,
  name: string
): string | null {
  const values = parameters.getAll(name)
  const value = values[0]
  return values.length === 1 && value !== undefined && EIDOS_FILE_ID.test(value)
    ? value
    : null
}

function appendPublicationNavigation(
  parameters: URLSearchParams,
  navigation: PublicationNavigation
): void {
  if (navigation.tableId !== null) {
    parameters.set("table", navigation.tableId)
  }
  if (navigation.viewId !== null) {
    parameters.set("view", navigation.viewId)
  }
}

function publicationLocation(
  slug: string,
  navigation: PublicationNavigation
): string {
  const parameters = new URLSearchParams()
  appendPublicationNavigation(parameters, navigation)
  const search = parameters.toString()
  return `/${slug}${search.length === 0 ? "" : `?${search}`}`
}

function navigationHiddenInput(name: string, value: string | null): string {
  return value === null
    ? ""
    : `<input type="hidden" name="${name}" value="${value}">`
}

async function privateViewerAuthorized(
  request: Request,
  ownerUserId: string,
  audience: string,
  secret: string
): Promise<boolean> {
  const token = cookieValue(request.headers.get("cookie"), VIEWER_COOKIE)
  if (token === null) return false
  const claims = await verifyViewerSession(token, secret)
  return (
    claims !== null && claims.aud === audience && claims.sub === ownerUserId
  )
}

async function boundedExchangeResponse(
  response: Response
): Promise<{ userId: string; publicationSlug: string } | null> {
  const text = await response.text()
  if (encoder.encode(text).byteLength > 2048) return null
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 2 &&
    typeof record.userId === "string" &&
    record.userId.length > 0 &&
    record.userId.length <= 256 &&
    typeof record.publicationSlug === "string" &&
    SLUG.test(record.publicationSlug)
    ? { userId: record.userId, publicationSlug: record.publicationSlug }
    : null
}

async function boundedPasswordBody(request: Request): Promise<{
  slug: string
  password: string
  navigation: PublicationNavigation
}> {
  const contentType = request.headers.get("content-type") ?? ""
  const length = request.headers.get("content-length")
  if (
    !contentType
      .toLowerCase()
      .startsWith("application/x-www-form-urlencoded") ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024))
  ) {
    throw new PublicRuntimeError("invalid_password_request")
  }
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > 1024) {
    throw new PublicRuntimeError("invalid_password_request")
  }
  const text = decoder.decode(bytes)
  const form = new URLSearchParams(text)
  if (
    [...form.keys()].some(
      (key) =>
        key !== "slug" &&
        key !== "password" &&
        key !== "table" &&
        key !== "view"
    ) ||
    form.getAll("slug").length !== 1 ||
    form.getAll("password").length !== 1 ||
    form.getAll("table").length > 1 ||
    form.getAll("view").length > 1
  ) {
    throw new PublicRuntimeError("invalid_password_request")
  }
  const slug = form.get("slug")
  const password = form.get("password")
  if (
    slug === null ||
    !SLUG.test(slug) ||
    password === null ||
    password.length === 0 ||
    password.length > 256
  ) {
    throw new PublicRuntimeError("invalid_password_request")
  }
  const navigation = publicationNavigation(form)
  if (
    (form.has("table") && navigation.tableId === null) ||
    (form.has("view") && navigation.viewId === null)
  ) {
    throw new PublicRuntimeError("invalid_password_request")
  }
  return { slug, password, navigation }
}

async function boundedSessionBody(request: Request): Promise<{ slug: string }> {
  const length = request.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) {
    throw new PublicRuntimeError("invalid_session_request")
  }
  const text = await request.text()
  if (encoder.encode(text).byteLength > 1024)
    throw new PublicRuntimeError("invalid_session_request")
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new PublicRuntimeError("invalid_session_request")
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as { slug?: unknown }).slug !== "string" ||
    !SLUG.test((value as { slug: string }).slug)
  ) {
    throw new PublicRuntimeError("invalid_session_request")
  }
  return { slug: (value as { slug: string }).slug }
}

async function boundedAssetResolveBody(request: Request): Promise<{
  entryId: string
  purpose: "thumbnail" | "preview" | "download"
}> {
  const length = request.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) {
    throw new PublicRuntimeError("invalid_asset_request")
  }
  const text = await request.text()
  if (encoder.encode(text).byteLength > 1024) {
    throw new PublicRuntimeError("invalid_asset_request")
  }
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new PublicRuntimeError("invalid_asset_request")
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  ) {
    throw new PublicRuntimeError("invalid_asset_request")
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.entryId !== "string" ||
    !EIDOS_FILE_ID.test(record.entryId) ||
    (record.purpose !== "thumbnail" &&
      record.purpose !== "preview" &&
      record.purpose !== "download")
  ) {
    throw new PublicRuntimeError("invalid_asset_request")
  }
  return { entryId: record.entryId, purpose: record.purpose }
}

async function signTicket(
  claims: RuntimeTicketClaims,
  secret: string
): Promise<string> {
  requireTicketSecret(secret)
  const payload = base64Url(encoder.encode(JSON.stringify(claims)))
  return payload + "." + base64Url(await hmac(payload, secret))
}

async function signViewerSession(
  claims: ViewerSessionClaims,
  secret: string
): Promise<string> {
  requireTicketSecret(secret)
  const payload = base64Url(encoder.encode(JSON.stringify(claims)))
  return payload + "." + base64Url(await hmac(payload, secret))
}

async function signPasswordSession(
  claims: PasswordSessionClaims,
  secret: string
): Promise<string> {
  requirePasswordSessionSecret(secret)
  const payload = base64Url(encoder.encode(JSON.stringify(claims)))
  return payload + "." + base64Url(await hmac(payload, secret))
}

async function verifyTicket(
  token: string,
  secret: string
): Promise<RuntimeTicketClaims | null> {
  requireTicketSecret(secret)
  const [payload, signature, extra] = token.split(".")
  if (payload === undefined || signature === undefined || extra !== undefined)
    return null
  const expected = base64Url(await hmac(payload, secret))
  if (!constantTimeEqual(signature, expected)) return null
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(base64UrlDecode(payload))) as unknown
  } catch {
    return null
  }
  if (!validClaims(value)) return null
  const now = Math.floor(Date.now() / 1000)
  return value.iat > now + 30 ||
    value.exp <= now ||
    value.exp - value.iat > MAX_TICKET_SECONDS
    ? null
    : value
}

async function verifyViewerSession(
  token: string,
  secret: string
): Promise<ViewerSessionClaims | null> {
  requireTicketSecret(secret)
  const [payload, signature, extra] = token.split(".")
  if (payload === undefined || signature === undefined || extra !== undefined)
    return null
  const expected = base64Url(await hmac(payload, secret))
  if (!constantTimeEqual(signature, expected)) return null
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(base64UrlDecode(payload))) as unknown
  } catch {
    return null
  }
  if (!validViewerSessionClaims(value)) return null
  const now = Math.floor(Date.now() / 1000)
  return value.iat > now + 30 ||
    value.exp <= now ||
    value.exp - value.iat > MAX_TICKET_SECONDS
    ? null
    : value
}

async function verifyPasswordSession(
  token: string,
  secret: string
): Promise<PasswordSessionClaims | null> {
  requirePasswordSessionSecret(secret)
  const [payload, signature, extra] = token.split(".")
  if (payload === undefined || signature === undefined || extra !== undefined)
    return null
  const expected = base64Url(await hmac(payload, secret))
  if (!constantTimeEqual(signature, expected)) return null
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(base64UrlDecode(payload))) as unknown
  } catch {
    return null
  }
  if (!validPasswordSessionClaims(value)) return null
  const now = Math.floor(Date.now() / 1000)
  return value.iat > now + 30 ||
    value.exp <= now ||
    value.exp - value.iat > MAX_PASSWORD_SESSION_SECONDS
    ? null
    : value
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret).slice().buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload).slice().buffer
    )
  )
}

async function clientIdentityHash(
  request: Request,
  secret: string
): Promise<string> {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown"
  return base64Url(await hmac(`runtime-client:${address}`, secret))
}

function validClaims(value: unknown): value is RuntimeTicketClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const claim = value as Record<string, unknown>
  return (
    Object.keys(claim).length === 12 &&
    claim.iss === "eidos-publish" &&
    claim.kid === "v1" &&
    typeof claim.aud === "string" &&
    typeof claim.tenantId === "string" &&
    typeof claim.publicationId === "string" &&
    typeof claim.versionId === "string" &&
    typeof claim.servingTargetSha256 === "string" &&
    (claim.visibility === "public" || claim.visibility === "private") &&
    (claim.accessMode === "public" ||
      claim.accessMode === "password" ||
      claim.accessMode === "private") &&
    Number.isSafeInteger(claim.accessRevision) &&
    (claim.accessRevision as number) >= 0 &&
    Number.isSafeInteger(claim.iat) &&
    Number.isSafeInteger(claim.exp)
  )
}

function validPasswordSessionClaims(
  value: unknown
): value is PasswordSessionClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const claim = value as Record<string, unknown>
  return (
    Object.keys(claim).length === 7 &&
    claim.iss === "eidos-publish-password" &&
    claim.kid === "v1" &&
    typeof claim.aud === "string" &&
    typeof claim.publicationId === "string" &&
    Number.isSafeInteger(claim.accessRevision) &&
    (claim.accessRevision as number) > 0 &&
    Number.isSafeInteger(claim.iat) &&
    Number.isSafeInteger(claim.exp)
  )
}

function validViewerSessionClaims(
  value: unknown
): value is ViewerSessionClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const claim = value as Record<string, unknown>
  return (
    Object.keys(claim).length === 6 &&
    claim.iss === "eidos-publish-viewer" &&
    claim.kid === "v1" &&
    typeof claim.aud === "string" &&
    typeof claim.sub === "string" &&
    Number.isSafeInteger(claim.iat) &&
    Number.isSafeInteger(claim.exp)
  )
}

function canonicalLabel(handle: string | null, tenantId: string): string {
  return handle ?? tenantId
}

function stripRedirectSecrets(url: URL): void {
  for (const key of ["access", "authorization", "code", "password", "token"]) {
    url.searchParams.delete(key)
  }
}

function shellSlug(pathname: string): string | null {
  const match = /^\/([^/]+)\/?$/.exec(pathname)
  return match !== null && match[1] !== undefined && SLUG.test(match[1])
    ? match[1]
    : null
}

function validHandle(value: string): boolean {
  return (
    /^[a-z](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(value) && !value.startsWith("u-")
  )
}

function runtimeAuthorization(request: Request): string | null {
  const value = request.headers.get("authorization")
  return value?.startsWith("EidosRuntime ")
    ? value.slice("EidosRuntime ".length)
    : null
}

function cookieValue(header: string | null, name: string): string | null {
  if (header === null) return null
  for (const item of header.split(";")) {
    const [key, ...rest] = item.trim().split("=")
    if (key === name && rest.length > 0) return rest.join("=")
  }
  return null
}

function proxyRequestHeaders(source: Headers): Headers {
  const headers = new Headers()
  source.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (
      !HOP_BY_HOP.has(lower) &&
      lower !== "authorization" &&
      lower !== "cookie" &&
      lower !== "host" &&
      !lower.startsWith("cf-") &&
      !lower.startsWith("x-eidos-internal-")
    ) {
      headers.append(name, value)
    }
  })
  return headers
}

export function runtimeProxyRequestHeaders(source: Headers): Headers {
  const headers = proxyRequestHeaders(source)
  headers.set("Host", `127.0.0.1:${RUNTIME_PORT}`)
  headers.set("Origin", `http://127.0.0.1:${RUNTIME_PORT}`)
  return headers
}

function proxyResponseHeaders(source: Headers): Headers {
  const headers = new Headers()
  source.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (
      !HOP_BY_HOP.has(lower) &&
      lower !== "set-cookie" &&
      !lower.startsWith("x-eidos-internal-")
    ) {
      headers.append(name, value)
    }
  })
  headers.set("Cache-Control", "private, no-store")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Referrer-Policy", "same-origin")
  headers.set("Content-Security-Policy", PUBLICATION_CSP)
  headers.set("X-Frame-Options", "DENY")
  headers.set("Cross-Origin-Resource-Policy", "same-origin")
  return headers
}

function allowedRuntimeRequest(method: string, path: string): boolean {
  return (
    (method === "GET" && path === "/api/manifest") ||
    (method === "POST" &&
      (path === "/api/runtime/open" ||
        path === "/api/runtime/call" ||
        path === "/api/runtime/close" ||
        path === "/api/assets/resolve" ||
        path === "/api/assets/release"))
  )
}

function boundedContentLength(value: string | null): number | null {
  if (value === null || !/^(?:0|[1-9][0-9]*)$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function byteLimitedStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number
): ReadableStream<Uint8Array> {
  let bytes = 0
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength
        if (bytes > maxBytes) {
          throw new PublicRuntimeError("runtime_payload_too_large")
        }
        controller.enqueue(chunk)
      },
    })
  )
}

function limitedRuntimeResponse(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
  ctx: ExecutionContext,
  complete: () => Promise<void>
): ReadableStream<Uint8Array> {
  const transform = new TransformStream<Uint8Array, Uint8Array>()
  ctx.waitUntil(
    byteLimitedStream(source, maxBytes)
      .pipeTo(transform.writable)
      .catch(() => undefined)
      .finally(complete)
  )
  return transform.readable
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

function requireTicketSecret(secret: string): void {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error("RUNTIME_TICKET_SECRET must contain at least 32 bytes")
  }
}

function requirePasswordSessionSecret(secret: string): void {
  if (encoder.encode(secret ?? "").byteLength < 32) {
    throw new Error(
      "PUBLISH_PASSWORD_SESSION_SECRET must contain at least 32 bytes"
    )
  }
}

function requireExchangeSecret(secret: string): void {
  if (encoder.encode(secret).byteLength < 32) {
    throw new Error(
      "PUBLISH_VIEWER_EXCHANGE_SECRET must contain at least 32 bytes"
    )
  }
}

function publicNotFound(): Response {
  return new Response("Publication not found", {
    status: 404,
    headers: {
      "Cache-Control": "public, max-age=30",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function runtimeProblem(
  status: number,
  code: string,
  message: string
): Response {
  return Response.json(
    { error: { code, message, retryable: status >= 500 } },
    { status, headers: { "Cache-Control": "private, no-store" } }
  )
}

function runtimeUsageFailure(
  result: Exclude<DurableResult<UsagePeriodRecord>, { ok: true }>
): Response {
  return runtimeProblem(
    result.error.status,
    result.error.code,
    result.error.message
  )
}

export class PublicRuntimeError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "PublicRuntimeError"
    this.code = code
  }
}
