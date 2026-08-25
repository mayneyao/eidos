import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"
import { app } from "electron"

import type {
  EidosPublicationBinding,
  EidosPublicationBindingsRequest,
  EidosPublishProgress,
  EidosPublishCollectRequest,
  EidosPublishCollectResponse,
  EidosPublishCollectResult,
  EidosPublishRequest,
  EidosPublishResponse,
  EidosPublishResult,
} from "../../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"
import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "../sync/sync-control-plane"
import {
  PublicationRegistry,
  type PublicationFileObservation,
  type PublicationRegistryScope,
  type PublicationSourceObservation,
  type StoredPublicationBinding,
} from "./publication-registry"

const REQUEST_ID = /^[0-9a-f-]{16,64}$/i
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const PUBLICATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const PUBLISHABLE_EXTENSION = /\.(?:eidos|md|markdown)$/i
const MAX_RESULT_BYTES = 1024 * 1024

interface CliError {
  error?: { code?: unknown; message?: unknown }
}

interface CliProgress {
  type?: unknown
  kind?: unknown
  message?: unknown
  label?: unknown
  currentBytes?: unknown
  totalBytes?: unknown
  percent?: unknown
}

interface CollectorTakeoverResponse {
  collectorGeneration?: unknown
}

interface RemotePublicationRecord {
  publicationId?: unknown
  slug?: unknown
  visibility?: unknown
  accessMode?: unknown
  showBranding?: unknown
  currentVersionId?: unknown
}

interface RemoteVersionRecord {
  versionId?: unknown
  state?: unknown
  targetHealth?: unknown
  sourceManifestSha256?: unknown
  driverId?: unknown
  driverVersion?: unknown
}

interface IncrementalPublishSource {
  deltaPath: string
  baseSourceSha256: string
}

function requestSourceKind(
  request: EidosPublishRequest
): EidosPublicationBinding["sourceKind"] {
  if (request.formView) return "form"
  return request.relativePath.toLowerCase().endsWith(".eidos")
    ? "eidos-file"
    : "markdown"
}

function safeAttachmentPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 1_024 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  )
}

async function observeFile(
  filePath: string
): Promise<PublicationFileObservation> {
  const stats = await fs.stat(filePath, { bigint: true })
  if (!stats.isFile()) throw new Error("Publish source input is not a file")
  return {
    bytes: stats.size.toString(),
    modifiedNs: stats.mtimeNs.toString(),
    changedNs: stats.ctimeNs.toString(),
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
  }
}

export async function observePublishSource(
  sourcePath: string,
  attachmentPaths: string[],
  source?: PublicationFileObservation,
  graftSnapshot?: PublicationSourceObservation["graftSnapshot"]
): Promise<PublicationSourceObservation> {
  if (attachmentPaths.length > 50_000) {
    throw new Error("Publish attachment observation exceeds its limit")
  }
  const attachmentRoot = path.dirname(sourcePath)
  const attachments: PublicationSourceObservation["attachments"] = []
  const sortedPaths = [...attachmentPaths].sort()
  for (let offset = 0; offset < sortedPaths.length; offset += 64) {
    const batch = await Promise.all(
      sortedPaths.slice(offset, offset + 64).map(async (attachmentPath) => {
        if (!safeAttachmentPath(attachmentPath)) {
          throw new Error("Publish engine returned an invalid attachment path")
        }
        const absolutePath = path.resolve(
          attachmentRoot,
          ...attachmentPath.split("/")
        )
        const relative = path.relative(attachmentRoot, absolutePath)
        if (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          throw new Error("Publish attachment escapes its source directory")
        }
        return { path: attachmentPath, ...(await observeFile(absolutePath)) }
      })
    )
    attachments.push(...batch)
  }
  return {
    spec: "eidos.publish/local-observation@1",
    source: source ?? (await observeFile(sourcePath)),
    attachments,
    ...(graftSnapshot ? { graftSnapshot } : {}),
  }
}

function sameObservation(
  left: PublicationSourceObservation,
  right: PublicationSourceObservation
): boolean {
  return (
    JSON.stringify({ source: left.source, attachments: left.attachments }) ===
    JSON.stringify({ source: right.source, attachments: right.attachments })
  )
}

function hasReusableCachedResult(
  binding: StoredPublicationBinding
): binding is StoredPublicationBinding & {
  lastResult: EidosPublishResult
  publishFingerprint: string
} {
  const result = binding.lastResult
  return (
    result?.published === true &&
    result.ready === true &&
    result.fingerprintSpec === "eidos.publish/source-bundle@1" &&
    result.publishFingerprint === binding.publishFingerprint &&
    result.publicationId === binding.publicationId &&
    result.publicationSlug === binding.slug &&
    result.versionId === binding.currentVersionId &&
    result.driverId === binding.driverId &&
    Array.isArray(result.attachmentPaths) &&
    result.attachmentPaths.every(safeAttachmentPath)
  )
}

export function requiredPublishRequest(value: unknown): EidosPublishRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Publish request")
  }
  const request = value as Record<string, unknown>
  if (
    typeof request.requestId !== "string" ||
    !REQUEST_ID.test(request.requestId) ||
    typeof request.relativePath !== "string" ||
    !PUBLISHABLE_EXTENSION.test(request.relativePath) ||
    typeof request.slug !== "string" ||
    !SLUG.test(request.slug) ||
    (request.accessMode !== "unchanged" &&
      request.accessMode !== "public" &&
      request.accessMode !== "password" &&
      request.accessMode !== "private") ||
    (request.branding !== "unchanged" &&
      request.branding !== "show" &&
      request.branding !== "hide")
  ) {
    throw new Error("Invalid Publish request")
  }
  if (
    request.formView !== undefined &&
    (typeof request.formView !== "string" ||
      request.formView.length === 0 ||
      Buffer.byteLength(request.formView, "utf8") > 1_024 ||
      /[\u0000-\u001f\u007f]/.test(request.formView) ||
      !request.relativePath.toLowerCase().endsWith(".eidos"))
  ) {
    throw new Error("A valid Form View requires an Eidos File")
  }
  if (
    request.formView !== undefined &&
    ((request.formRespondentAccess !== "anyone" &&
      request.formRespondentAccess !== "signed_in") ||
      typeof request.formAllowMultipleResponses !== "boolean" ||
      (request.formRespondentAccess === "anyone" &&
        !request.formAllowMultipleResponses))
  ) {
    throw new Error("Invalid published Form response access")
  }
  if (
    request.formView === undefined &&
    (request.formRespondentAccess !== undefined ||
      request.formAllowMultipleResponses !== undefined)
  ) {
    throw new Error("Form response access requires a Form View")
  }
  const password = request.password
  if (request.accessMode === "password") {
    const passwordCharacters =
      typeof password === "string" ? Array.from(password).length : 0
    if (
      typeof password !== "string" ||
      passwordCharacters < 8 ||
      passwordCharacters > 128 ||
      Buffer.byteLength(password, "utf8") > 256 ||
      /[\u0000-\u001f\u007f]/.test(password)
    ) {
      throw new Error(
        "Publish password must contain 8 to 128 characters, at most 256 UTF-8 bytes, and no control characters"
      )
    }
  } else if (password !== undefined) {
    throw new Error("A Publish password requires password access")
  }
  return {
    requestId: request.requestId,
    relativePath: request.relativePath,
    slug: request.slug,
    accessMode: request.accessMode,
    branding: request.branding,
    ...(typeof request.formView === "string"
      ? { formView: request.formView }
      : {}),
    ...(request.formRespondentAccess === "anyone" ||
    request.formRespondentAccess === "signed_in"
      ? { formRespondentAccess: request.formRespondentAccess }
      : {}),
    ...(typeof request.formAllowMultipleResponses === "boolean"
      ? { formAllowMultipleResponses: request.formAllowMultipleResponses }
      : {}),
    ...(typeof password === "string" ? { password } : {}),
  }
}

export function requiredPublishCollectRequest(
  value: unknown
): EidosPublishCollectRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Publish Collect request")
  }
  const request = value as Record<string, unknown>
  if (
    typeof request.requestId !== "string" ||
    !REQUEST_ID.test(request.requestId) ||
    typeof request.relativePath !== "string" ||
    !request.relativePath.toLowerCase().endsWith(".eidos") ||
    typeof request.publicationId !== "string" ||
    !PUBLICATION_ID.test(request.publicationId)
  ) {
    throw new Error("Invalid Publish Collect request")
  }
  return {
    requestId: request.requestId,
    relativePath: request.relativePath,
    publicationId: request.publicationId,
  }
}

export function requiredPublicationBindingsRequest(
  value: unknown
): EidosPublicationBindingsRequest {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Publication bindings request")
  }
  const request = value as Record<string, unknown>
  if (
    Object.keys(request).some((key) => key !== "relativePath") ||
    (request.relativePath !== undefined &&
      (typeof request.relativePath !== "string" ||
        request.relativePath.length === 0 ||
        Buffer.byteLength(request.relativePath, "utf8") > 4_096 ||
        /[\u0000-\u001f\u007f]/.test(request.relativePath)))
  ) {
    throw new Error("Invalid Publication bindings request")
  }
  return typeof request.relativePath === "string"
    ? { relativePath: request.relativePath }
    : {}
}

export function parsePublishProgress(
  requestId: string,
  line: string
): EidosPublishProgress | null {
  let value: CliProgress
  try {
    value = JSON.parse(line) as CliProgress
  } catch {
    return null
  }
  if (value.type !== "publish-progress") return null
  if (value.kind === "stage" && typeof value.message === "string") {
    return { requestId, kind: "stage", message: value.message }
  }
  if (
    value.kind === "bytes" &&
    typeof value.label === "string" &&
    typeof value.currentBytes === "string" &&
    typeof value.totalBytes === "string" &&
    typeof value.percent === "number" &&
    Number.isInteger(value.percent) &&
    value.percent >= 0 &&
    value.percent <= 100
  ) {
    return {
      requestId,
      kind: "bytes",
      label: value.label,
      currentBytes: value.currentBytes,
      totalBytes: value.totalBytes,
      percent: value.percent,
    }
  }
  return null
}

function publishEngineCandidates(): string[] {
  const executable = process.platform === "win32" ? "eidos.exe" : "eidos"
  const override = app.isPackaged ? null : process.env.EIDOS_LITE_PUBLISH_ENGINE
  return [
    ...(override ? [path.resolve(override)] : []),
    ...(app.isPackaged
      ? [path.join(process.resourcesPath, "publish-engine", executable)]
      : []),
    path.resolve(app.getAppPath(), "../cli/target/debug", executable),
    path.resolve(app.getAppPath(), "../cli/target/release", executable),
    path.resolve(process.cwd(), "apps/cli/target/debug", executable),
    path.resolve(process.cwd(), "apps/cli/target/release", executable),
    path.resolve(process.cwd(), "../cli/target/debug", executable),
    path.resolve(process.cwd(), "../cli/target/release", executable),
  ]
}

async function publishEnginePath(): Promise<string> {
  for (const candidate of publishEngineCandidates()) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Try the next deterministic development or packaged location.
    }
  }
  throw Object.assign(
    new Error(
      "The Eidos Publish engine is unavailable. Rebuild Eidos Lite or run cargo build in apps/cli."
    ),
    { code: "publish-engine-unavailable" }
  )
}

function cliArguments(
  request: EidosPublishRequest,
  snapshotPath: string,
  attachmentRoot: string,
  publishOrigin: string,
  incrementalSource?: IncrementalPublishSource
): string[] {
  const args = [
    "--json",
    "publish",
    snapshotPath,
    "--slug",
    request.slug,
    "--publish-origin",
    publishOrigin,
    "--attachment-root",
    attachmentRoot,
    "--progress-json",
  ]
  if (request.accessMode === "public") args.push("--remove-password")
  if (request.accessMode === "password") args.push("--password")
  if (request.accessMode === "private") {
    args.push("--visibility", "private")
  }
  if (request.branding === "hide") args.push("--hide-branding")
  if (request.branding === "show") args.push("--show-branding")
  if (request.formView) args.push("--form-view", request.formView)
  if (request.formRespondentAccess) {
    args.push(
      "--form-respondents",
      request.formRespondentAccess === "signed_in" ? "signed-in" : "anyone"
    )
  }
  if (request.formAllowMultipleResponses === false) {
    args.push("--one-response-per-user")
  }
  if (incrementalSource) {
    args.push(
      "--graft-delta",
      incrementalSource.deltaPath,
      "--graft-base-sha256",
      incrementalSource.baseSourceSha256
    )
  }
  return args
}

export function collectCliArguments(
  filePath: string,
  attachmentRoot: string,
  publicationId: string,
  collectorId: string,
  publishOrigin: string,
  collectorGeneration?: number
): string[] {
  const args = [
    "--json",
    "collect",
    filePath,
    "--publication",
    publicationId,
    "--publish-origin",
    publishOrigin,
    "--attachment-root",
    attachmentRoot,
    "--collector-id",
    collectorId,
  ]
  if (collectorGeneration !== undefined) {
    args.push("--collector-generation", String(collectorGeneration))
  }
  return args
}

function failureFrom(
  error: unknown
): Extract<EidosPublishResponse, { ok: false }> {
  const source = error instanceof Error ? error : new Error(String(error))
  const service = /\(([^,()]+), HTTP (\d{3})\)$/.exec(source.message)
  const authenticationRequired =
    service?.[2] === "401" || /sign in/i.test(source.message)
  return {
    ok: false,
    failure: {
      code:
        service?.[1] ||
        (authenticationRequired
          ? "authentication-required"
          : typeof (source as Error & { code?: unknown }).code === "string"
            ? (source as Error & { code: string }).code
            : "publish-failed"),
      message: source.message,
      ...(service?.[2] ? { status: Number(service[2]) } : {}),
    },
  }
}

async function boundedResponseJson(
  response: Response,
  maximumBytes = 64 * 1024
): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > maximumBytes) {
        await reader.cancel()
        throw Object.assign(
          new Error("Publish service response is too large"),
          {
            code: "publish-service-invalid-response",
          }
        )
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw Object.assign(new Error("Publish service returned invalid JSON"), {
      code: "publish-service-invalid-response",
    })
  }
}

export class EidosPublishEngine {
  private readonly children = new Set<ChildProcess>()
  private readonly registries = new Map<string, PublicationRegistry>()

  constructor(
    private readonly services: EidosLiteServiceEnvironment,
    private readonly account: Pick<
      SyncControlPlane,
      "accountAccessToken" | "accountSubject"
    >
  ) {}

  async publish(
    session: SpaceSession,
    request: EidosPublishRequest,
    onProgress: (progress: EidosPublishProgress) => void
  ): Promise<EidosPublishResponse> {
    let temporaryDirectory: string | null = null
    try {
      const [accessToken, accountId] = await Promise.all([
        this.account.accountAccessToken(),
        this.account.accountSubject(),
      ])
      const registry = this.registry(session)
      const scope = this.scope(session, accountId)
      const sourcePath = session.resolveUserPath(request.relativePath)
      onProgress({
        requestId: request.requestId,
        kind: "stage",
        message: "checking local Publish fingerprint",
      })
      const existing = registry
        .list(scope, request.relativePath)
        .find(
          (binding) =>
            binding.slug === request.slug &&
            binding.sourceKind === requestSourceKind(request) &&
            binding.formViewId === (request.formView ?? null)
        )
      if (
        request.accessMode === "unchanged" &&
        request.branding === "unchanged" &&
        request.formView === undefined &&
        existing?.localObservation &&
        existing.publishFingerprint &&
        hasReusableCachedResult(existing)
      ) {
        try {
          const currentObservation = await observePublishSource(
            sourcePath,
            existing.localObservation.attachments.map(
              (attachment) => attachment.path
            )
          )
          if (sameObservation(existing.localObservation, currentObservation)) {
            const remote = await this.remoteCurrentBinding(
              existing,
              accessToken
            )
            if (remote) {
              const result: EidosPublishResult = {
                ...existing.lastResult,
                published: true,
                ready: true,
                versionCreated: false,
                visibility: remote.visibility,
                accessMode: remote.accessMode,
                showBranding: remote.showBranding,
                url: remote.url,
              }
              registry.upsertPublished(
                scope,
                request,
                result,
                currentObservation
              )
              onProgress({
                requestId: request.requestId,
                kind: "stage",
                message: "content unchanged; current Version reused",
              })
              return { ok: true, result }
            }
          }
        } catch {
          // Missing or changed local inputs fall through to an exact Publish.
        }
      }

      const executable = await publishEnginePath()
      const sourceBeforeSnapshot = await observeFile(sourcePath)
      temporaryDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-lite-publish-")
      )
      const snapshotPath = path.join(
        temporaryDirectory,
        request.relativePath.toLowerCase().endsWith(".eidos")
          ? "source.eidos"
          : "source.md"
      )
      const deltaPath = path.join(temporaryDirectory, "source.graft-delta")
      onProgress({
        requestId: request.requestId,
        kind: "stage",
        message: "preparing a consistent local snapshot",
      })
      const capturedSnapshot = await session.createPublishSourceSnapshot(
        request.relativePath,
        snapshotPath,
        existing?.localObservation?.graftSnapshot?.token,
        deltaPath
      )
      if (capturedSnapshot) {
        onProgress({
          requestId: request.requestId,
          kind: "stage",
          message: capturedSnapshot.reusedSnapshot
            ? "reusing the current Graft snapshot"
            : `captured ${capturedSnapshot.changedPages} changed SQLite pages`,
        })
      }
      const sourceAfterSnapshot = await observeFile(sourcePath)
      const publishedSourceObservation =
        JSON.stringify(sourceBeforeSnapshot) ===
        JSON.stringify(sourceAfterSnapshot)
          ? sourceAfterSnapshot
          : sourceBeforeSnapshot
      const attachmentRoot = path.dirname(sourcePath)
      const incrementalSource =
        capturedSnapshot?.deltaOutput === deltaPath &&
        !capturedSnapshot.reusedSnapshot &&
        capturedSnapshot.deltaBytes !== undefined &&
        capturedSnapshot.deltaBytes < capturedSnapshot.bytes &&
        capturedSnapshot.deltaBaseContentFingerprint ===
          existing?.localObservation?.graftSnapshot?.contentFingerprint &&
        existing?.sourceSha256 !== undefined &&
        SHA256.test(existing.sourceSha256) &&
        capturedSnapshot.deltaBaseSha256 === existing.sourceSha256 &&
        capturedSnapshot.deltaTargetSha256 === capturedSnapshot.sha256
          ? {
              deltaPath,
              baseSourceSha256: existing.sourceSha256,
            }
          : undefined
      const response = await this.runCli(
        executable,
        snapshotPath,
        attachmentRoot,
        accessToken,
        request,
        incrementalSource,
        onProgress
      )
      if (response.ok) {
        let localObservation: PublicationSourceObservation | null = null
        try {
          localObservation = await observePublishSource(
            sourcePath,
            response.result.attachmentPaths,
            publishedSourceObservation,
            capturedSnapshot
              ? {
                  token: capturedSnapshot.snapshotToken,
                  contentFingerprint: capturedSnapshot.contentFingerprint,
                }
              : undefined
          )
        } catch {
          // Publish remains successful; status stays unknown until republished.
        }
        registry.upsertPublished(
          scope,
          request,
          response.result,
          localObservation
        )
        if (response.result.driverId === "org.eidos.driver.form") {
          const collectorId = this.collectorId(
            session,
            response.result.publicationId
          )
          try {
            const collectorGeneration = await this.claimCollector(
              response.result.publicationId,
              collectorId,
              request.requestId,
              accessToken
            )
            registry.recordCollectorOwnership(
              scope,
              response.result.publicationId,
              collectorId,
              collectorGeneration
            )
          } catch (error) {
            const failure = failureFrom(error)
            try {
              registry.recordCollectionFailure(
                scope,
                response.result.publicationId,
                failure.failure.code,
                failure.failure.message
              )
            } catch {
              // The immutable Version is already active and the source binding
              // is durable; Collector activation remains independently retryable.
            }
          }
        }
      }
      return response
    } catch (error) {
      return failureFrom(error)
    } finally {
      if (temporaryDirectory) {
        await fs
          .rm(temporaryDirectory, { recursive: true, force: true })
          .catch(() => undefined)
      }
    }
  }

  async collect(
    session: SpaceSession,
    request: EidosPublishCollectRequest
  ): Promise<EidosPublishCollectResponse> {
    let registryContext:
      | {
          registry: PublicationRegistry
          scope: PublicationRegistryScope
        }
      | undefined
    try {
      const [accessToken, accountId, executable] = await Promise.all([
        this.account.accountAccessToken(),
        this.account.accountSubject(),
        publishEnginePath(),
      ])
      registryContext = {
        registry: this.registry(session),
        scope: this.scope(session, accountId),
      }
      registryContext.registry.recordCollectionAttempt(
        registryContext.scope,
        request.publicationId
      )
      const collectorId = this.collectorId(session, request.publicationId)
      const result = await session.collectPublishedFormResponses(
        request.relativePath,
        (filePath, attachmentRoot, signal) =>
          this.runCollectCli(
            executable,
            filePath,
            attachmentRoot,
            request.publicationId,
            collectorId,
            accessToken,
            signal,
            undefined
          )
      )
      registryContext.registry.recordCollectionSuccess(
        registryContext.scope,
        result
      )
      return { ok: true, result }
    } catch (error) {
      const failure = failureFrom(error)
      if (registryContext) {
        try {
          registryContext.registry.recordCollectionFailure(
            registryContext.scope,
            request.publicationId,
            failure.failure.code,
            failure.failure.message
          )
        } catch {
          // Preserve the original collection failure.
        }
      }
      return failure
    }
  }

  async listBindings(
    session: SpaceSession,
    request: EidosPublicationBindingsRequest
  ): Promise<EidosPublicationBinding[]> {
    const accountId = await this.account.accountSubject()
    const stored = this.registry(session).list(
      this.scope(session, accountId),
      request.relativePath
    )
    return await Promise.all(
      stored.map(async ({ localObservation, lastResult: _, ...binding }) => {
        if (!localObservation || !binding.publishFingerprint) return binding
        try {
          const current = await observePublishSource(
            session.resolveUserPath(binding.relativePath),
            localObservation.attachments.map((attachment) => attachment.path)
          )
          return {
            ...binding,
            contentStatus: sameObservation(localObservation, current)
              ? ("current" as const)
              : ("changed" as const),
          }
        } catch {
          return { ...binding, contentStatus: "unknown" as const }
        }
      })
    )
  }

  remapBindings(session: SpaceSession, source: string, target: string): void {
    this.registry(session).remapSourcePaths(
      session.canonical.id,
      source,
      target
    )
  }

  close(): void {
    for (const child of this.children) child.kill()
    this.children.clear()
    for (const registry of this.registries.values()) registry.close()
    this.registries.clear()
  }

  private registry(session: SpaceSession): PublicationRegistry {
    let registry = this.registries.get(session.canonical.id)
    if (!registry) {
      registry = new PublicationRegistry(session.publishStatePath())
      this.registries.set(session.canonical.id, registry)
    }
    return registry
  }

  private scope(
    session: SpaceSession,
    accountId: string
  ): PublicationRegistryScope {
    return {
      serviceOrigin: new URL(this.services.publishOrigin).origin,
      accountId,
      spaceId: session.canonical.id,
    }
  }

  private collectorId(session: SpaceSession, publicationId: string): string {
    return `eidos-lite-${createHash("sha256")
      .update(session.canonical.id)
      .update("\0")
      .update(publicationId)
      .digest("hex")
      .slice(0, 32)}`
  }

  private async claimCollector(
    publicationId: string,
    collectorId: string,
    requestId: string,
    accessToken: string
  ): Promise<number> {
    const response = await fetch(
      new URL(
        `/api/forms/${publicationId}/collector/takeover`,
        this.services.publishOrigin
      ),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `lite-publish-${requestId}`,
        },
        body: JSON.stringify({ collectorId }),
        signal: AbortSignal.timeout(30_000),
      }
    )
    const value = await boundedResponseJson(response)
    if (!response.ok) {
      const problem =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {}
      const code =
        typeof problem.code === "string"
          ? problem.code
          : "collector-claim-failed"
      const message =
        typeof problem.message === "string"
          ? problem.message
          : "Could not activate the local Form Collector"
      throw Object.assign(
        new Error(`${message} (${code}, HTTP ${response.status})`),
        { code }
      )
    }
    const collector = value as CollectorTakeoverResponse
    if (
      !Number.isSafeInteger(collector?.collectorGeneration) ||
      (collector.collectorGeneration as number) < 0
    ) {
      throw Object.assign(
        new Error("Publish service returned invalid Collector ownership"),
        { code: "publish-service-invalid-response" }
      )
    }
    return collector.collectorGeneration as number
  }

  private async remoteCurrentBinding(
    binding: StoredPublicationBinding,
    accessToken: string
  ): Promise<{
    visibility: EidosPublishResult["visibility"]
    accessMode: EidosPublishResult["accessMode"]
    showBranding: boolean
    url: string
  } | null> {
    if (!binding.publishFingerprint) return null
    const tenantResponse = await fetch(
      new URL("/api/tenant", this.services.publishOrigin),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!tenantResponse.ok) return null
    const tenant = await boundedResponseJson(tenantResponse, MAX_RESULT_BYTES)
    if (!tenant || typeof tenant !== "object" || Array.isArray(tenant)) {
      return null
    }
    const record = tenant as Record<string, unknown>
    const canonicalHost = record.canonicalHost
    const publications = record.publications
    if (typeof canonicalHost !== "string" || !Array.isArray(publications)) {
      return null
    }
    const publication = publications.find((candidate) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return false
      }
      const value = candidate as RemotePublicationRecord
      return (
        value.publicationId === binding.publicationId &&
        value.slug === binding.slug
      )
    }) as RemotePublicationRecord | undefined
    if (
      !publication ||
      publication.currentVersionId !== binding.currentVersionId ||
      (publication.visibility !== "public" &&
        publication.visibility !== "private") ||
      (publication.accessMode !== "public" &&
        publication.accessMode !== "password" &&
        publication.accessMode !== "private") ||
      typeof publication.showBranding !== "boolean"
    ) {
      return null
    }
    const versionResponse = await fetch(
      new URL(
        `/api/publications/${binding.slug}/versions/${binding.currentVersionId}`,
        this.services.publishOrigin
      ),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!versionResponse.ok) return null
    const version = (await boundedResponseJson(
      versionResponse
    )) as RemoteVersionRecord | null
    if (
      !version ||
      version.versionId !== binding.currentVersionId ||
      version.state !== "ready" ||
      version.targetHealth !== "healthy" ||
      version.sourceManifestSha256 !== binding.publishFingerprint ||
      version.driverId !== binding.driverId ||
      version.driverVersion !== "1.0"
    ) {
      return null
    }
    return {
      visibility: publication.visibility,
      accessMode: publication.accessMode,
      showBranding: publication.showBranding,
      url: `https://${canonicalHost}/${binding.slug}`,
    }
  }

  private async runCli(
    executable: string,
    snapshotPath: string,
    attachmentRoot: string,
    accessToken: string,
    request: EidosPublishRequest,
    incrementalSource: IncrementalPublishSource | undefined,
    onProgress: (progress: EidosPublishProgress) => void
  ): Promise<EidosPublishResponse> {
    const child = spawn(
      executable,
      cliArguments(
        request,
        snapshotPath,
        attachmentRoot,
        this.services.publishOrigin,
        incrementalSource
      ),
      {
        env: {
          ...process.env,
          EIDOS_PUBLISH_TOKEN: accessToken,
          ...(request.password
            ? { EIDOS_PUBLISH_PASSWORD: request.password }
            : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    )
    this.children.add(child)
    let stdout = ""
    let cliFailure: Error | null = null
    if (!child.stdout || !child.stderr) {
      child.kill()
      return failureFrom(
        Object.assign(new Error("Publish engine streams are unavailable"), {
          code: "publish-engine-unavailable",
        })
      )
    }
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      if (stdout.length > MAX_RESULT_BYTES) child.kill()
    })
    const lines = readline.createInterface({ input: child.stderr })
    lines.on("line", (line) => {
      const progress = parsePublishProgress(request.requestId, line)
      if (progress) {
        onProgress(progress)
        return
      }
      try {
        const value = JSON.parse(line) as CliError
        if (
          value.error &&
          typeof value.error.message === "string" &&
          typeof value.error.code === "string"
        ) {
          cliFailure = Object.assign(new Error(value.error.message), {
            code: value.error.code,
          })
        }
      } catch {
        // Never forward arbitrary subprocess stderr to the renderer or logs.
      }
    })
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject)
        child.once("close", resolve)
      })
      if (stdout.length > MAX_RESULT_BYTES) {
        throw Object.assign(
          new Error("Publish engine returned too much data"),
          {
            code: "publish-engine-invalid-output",
          }
        )
      }
      if (exitCode !== 0) {
        throw cliFailure ?? new Error(`Publish engine exited with ${exitCode}`)
      }
      const result = JSON.parse(stdout) as EidosPublishResult
      if (
        result.published !== true ||
        result.ready !== true ||
        typeof result.versionCreated !== "boolean" ||
        result.fingerprintSpec !== "eidos.publish/source-bundle@1" ||
        typeof result.publishFingerprint !== "string" ||
        !SHA256.test(result.publishFingerprint) ||
        (result.driverId !== "org.eidos.driver.eidos" &&
          result.driverId !== "org.eidos.driver.markdown" &&
          result.driverId !== "org.eidos.driver.form") ||
        (result.mediaType !== "application/vnd.eidos+sqlite3" &&
          result.mediaType !== "text/markdown" &&
          result.mediaType !== "application/vnd.eidos.form+json") ||
        (result.driverId === "org.eidos.driver.form"
          ? !result.formPolicy ||
            (result.formPolicy.respondentAccess !== "anyone" &&
              result.formPolicy.respondentAccess !== "signed_in") ||
            typeof result.formPolicy.allowMultipleResponses !== "boolean" ||
            !Number.isSafeInteger(result.formPolicy.revision) ||
            result.formPolicy.revision < 0 ||
            (result.formPolicy.respondentAccess === "anyone" &&
              !result.formPolicy.allowMultipleResponses)
          : result.formPolicy !== null) ||
        typeof result.publicationId !== "string" ||
        typeof result.url !== "string" ||
        typeof result.versionId !== "string" ||
        typeof result.sourceBytes !== "string" ||
        typeof result.sourceSha256 !== "string" ||
        !SHA256.test(result.sourceSha256) ||
        !Number.isSafeInteger(result.attachmentFiles) ||
        !Number.isSafeInteger(result.attachmentReferences) ||
        !Array.isArray(result.attachmentPaths) ||
        result.attachmentPaths.length !== result.attachmentFiles ||
        result.attachmentPaths.some(
          (attachmentPath) =>
            typeof attachmentPath !== "string" ||
            !safeAttachmentPath(attachmentPath)
        ) ||
        typeof result.attachmentBytes !== "string" ||
        typeof result.bundleBytes !== "string" ||
        typeof result.deduplicatedBytes !== "string"
      ) {
        throw Object.assign(
          new Error("Publish engine returned an invalid result"),
          {
            code: "publish-engine-invalid-output",
          }
        )
      }
      return { ok: true, result }
    } catch (error) {
      return failureFrom(error)
    } finally {
      lines.close()
      this.children.delete(child)
    }
  }

  private async runCollectCli(
    executable: string,
    filePath: string,
    attachmentRoot: string,
    publicationId: string,
    collectorId: string,
    accessToken: string,
    signal: AbortSignal,
    collectorGeneration?: number
  ): Promise<EidosPublishCollectResult> {
    const child = spawn(
      executable,
      collectCliArguments(
        filePath,
        attachmentRoot,
        publicationId,
        collectorId,
        this.services.publishOrigin,
        collectorGeneration
      ),
      {
        env: { ...process.env, EIDOS_PUBLISH_TOKEN: accessToken },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    )
    this.children.add(child)
    const abort = () => child.kill()
    signal.addEventListener("abort", abort, { once: true })
    let stdout = ""
    let cliFailure: Error | null = null
    if (!child.stdout || !child.stderr) {
      child.kill()
      throw Object.assign(
        new Error("Publish Collector engine streams are unavailable"),
        { code: "publish-engine-unavailable" }
      )
    }
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      if (stdout.length > MAX_RESULT_BYTES) child.kill()
    })
    const lines = readline.createInterface({ input: child.stderr })
    lines.on("line", (line) => {
      try {
        const value = JSON.parse(line) as CliError
        if (
          value.error &&
          typeof value.error.message === "string" &&
          typeof value.error.code === "string"
        ) {
          cliFailure = Object.assign(new Error(value.error.message), {
            code: value.error.code,
          })
        }
      } catch {
        // Never forward arbitrary subprocess stderr to the renderer or logs.
      }
    })
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject)
        child.once("close", resolve)
      })
      if (signal.aborted) throw new Error("Form collection was cancelled")
      if (stdout.length > MAX_RESULT_BYTES) {
        throw Object.assign(
          new Error("Publish Collector returned too much data"),
          { code: "publish-engine-invalid-output" }
        )
      }
      if (exitCode !== 0) {
        throw (
          cliFailure ?? new Error(`Publish Collector exited with ${exitCode}`)
        )
      }
      const result = JSON.parse(stdout) as EidosPublishCollectResult
      if (
        result.collected !== true ||
        result.publicationId !== publicationId ||
        result.collectorId !== collectorId ||
        !Number.isSafeInteger(result.collectorGeneration) ||
        !Number.isSafeInteger(result.importedSubmissions) ||
        !Number.isSafeInteger(result.replayedSubmissions)
      ) {
        throw Object.assign(
          new Error("Publish Collector returned an invalid result"),
          { code: "publish-engine-invalid-output" }
        )
      }
      return result
    } finally {
      signal.removeEventListener("abort", abort)
      lines.close()
      this.children.delete(child)
    }
  }
}
