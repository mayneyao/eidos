import { Container } from "@cloudflare/containers"

import { canonicalSha256 } from "./canonical"
import type {
  PublicationVersionRecord,
  ReadyReceipt,
  RuntimeServingTarget,
  ValidationReceipt,
} from "./contracts"

const SUPERVISOR_PORT = 8420
const SUPERVISOR_HEALTH_PATH = "/__supervisor/health"
const SOURCE_BYTES_PER_SECOND = 4n * 1024n * 1024n
const MIN_SOURCE_STARTUP_SECONDS = 60n
const MAX_SOURCE_STARTUP_SECONDS = 900n
const VERSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const SHARD_GENERATION = "runtime-pool-v1"
const MAX_SHARDS = 1024
const VERSION_READINESS_CACHE_MILLISECONDS = 10_000

export interface RuntimeSourceDescriptor {
  tenantId: string
  versionId: string
  shardKey: string
  sourceObjectKey: string
  sourceBytes: string
  sourceSha256: string
  sourceManifestSha256: string
  driverId: "org.eidos.driver.eidos"
  driverVersion: "1.0"
  runtimeIdleSeconds: number
}

export interface RuntimePrepareResult {
  target: RuntimeServingTarget
  targetSha256: string
  readyReceipt: ReadyReceipt
}

export interface RuntimeVersionState {
  containerReady: boolean
  versionReady: boolean
}

interface SupervisorVersionStatus {
  versionId: string
  sourceBytes: string
  sourceSha256: string
}

export class RuntimeVersionReadinessCache {
  private readonly readyUntil = new Map<string, number>()

  has(versionId: string, now = Date.now()): boolean {
    const deadline = this.readyUntil.get(versionId)
    if (deadline === undefined) return false
    if (deadline > now) return true
    this.readyUntil.delete(versionId)
    return false
  }

  mark(versionId: string, now = Date.now()): void {
    this.readyUntil.set(versionId, now + VERSION_READINESS_CACHE_MILLISECONDS)
  }

  delete(versionId: string): void {
    this.readyUntil.delete(versionId)
  }

  clear(): void {
    this.readyUntil.clear()
  }
}

export class EidosRuntimeContainer extends Container<Env> {
  override defaultPort = SUPERVISOR_PORT
  override requiredPorts = [SUPERVISOR_PORT]
  override sleepAfter: string | number = "60s"
  override enableInternet = false
  override pingEndpoint = `127.0.0.1:${SUPERVISOR_PORT}${SUPERVISOR_HEALTH_PATH}`

  private readonly stateReady: Promise<void>
  private controlToken = ""
  private readonly preparations = new Map<string, Promise<void>>()
  private readonly descriptors = new Map<string, RuntimeSourceDescriptor>()
  private readonly readyVersions = new RuntimeVersionReadinessCache()

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.stateReady = this.ctx.blockConcurrencyWhile(async () => {
      const [storedToken, storedIdleSeconds] = await Promise.all([
        this.ctx.storage.get<string>("supervisor-control-token"),
        this.ctx.storage.get<number>("runtime-shard-idle-seconds"),
      ])
      this.controlToken = storedToken ?? randomToken()
      if (storedToken === undefined) {
        await this.ctx.storage.put(
          "supervisor-control-token",
          this.controlToken
        )
      }
      if (storedIdleSeconds !== undefined) {
        this.sleepAfter = `${boundedIdleSeconds(storedIdleSeconds)}s`
      }
      this.applySupervisorEnvironment()
    })
  }

  async validateSource(
    input: RuntimeSourceDescriptor
  ): Promise<ValidationReceipt> {
    await this.configure(input)
    await this.ensureVersionReady(input)

    const manifest = await this.runtimeJson(input.versionId, "/api/manifest")
    if (
      manifest.mode !== "publish" ||
      manifest.access !== "read" ||
      manifest.network !== "publish-container"
    ) {
      throw new RuntimePreparationError(
        "runtime_profile_mismatch",
        "Runtime did not negotiate the Publish profile"
      )
    }
    const opened = await this.runtimeJson(
      input.versionId,
      "/api/runtime/open",
      {
        method: "POST",
        body: JSON.stringify({ access: "read" }),
      }
    )
    requireOkEnvelope(opened, "runtime_open_failed")
    const validation = await this.runtimeJson(
      input.versionId,
      "/api/runtime/call",
      {
        method: "POST",
        body: JSON.stringify({
          method: "validate",
          request: { level: "semantic", diagnosticsLimit: 100 },
          context: {
            requestId: `publish-validate-${input.versionId}`,
            deadlineMilliseconds: 30_000,
          },
        }),
      }
    )
    const value = requireOkEnvelope(validation, "source_validation_failed")
    if (!isRecord(value) || value.valid !== true) {
      throw new RuntimePreparationError(
        "invalid_eidos_file",
        "Eidos semantic validation failed"
      )
    }
    return {
      sourceManifestSha256: input.sourceManifestSha256,
      driverId: input.driverId,
      driverVersion: input.driverVersion,
      valid: true,
      diagnostics: [],
    }
  }

  async probePrepared(
    input: RuntimeSourceDescriptor
  ): Promise<RuntimePrepareResult> {
    await this.configure(input)
    await this.ensureVersionReady(input)
    const manifest = await this.runtimeJson(input.versionId, "/api/manifest")
    if (manifest.mode !== "publish" || manifest.access !== "read") {
      throw new RuntimePreparationError(
        "runtime_probe_failed",
        "Runtime readiness probe failed"
      )
    }
    const target: RuntimeServingTarget = {
      kind: "runtime",
      runtimeProfile: "eidos-serve-publish/1",
      instanceKey: input.shardKey,
      versionId: input.versionId,
      sourceManifestSha256: input.sourceManifestSha256,
    }
    const targetSha256 = await canonicalSha256(target)
    return {
      target,
      targetSha256,
      readyReceipt: {
        sourceManifestSha256: input.sourceManifestSha256,
        driverId: input.driverId,
        driverVersion: input.driverVersion,
        servingTargetSha256: targetSha256,
        readyAt: new Date().toISOString(),
        conformance: [],
      },
    }
  }

  async getVersionState(
    input: RuntimeSourceDescriptor
  ): Promise<RuntimeVersionState> {
    await this.configure(input)
    const state = await this.getState()
    const containerReady =
      state.status === "healthy" || state.status === "running"
    if (!containerReady) {
      this.readyVersions.delete(input.versionId)
      return { containerReady: false, versionReady: false }
    }
    if (this.readyVersions.has(input.versionId)) {
      return { containerReady: true, versionReady: true }
    }
    await this.ensureSupervisorReady()
    const versionReady = await this.supervisorHasVersion(input)
    if (versionReady) this.readyVersions.mark(input.versionId)
    return { containerReady: true, versionReady }
  }

  async wakeVersion(input: RuntimeSourceDescriptor): Promise<void> {
    await this.configure(input)
    await this.ensureVersionReady(input)
  }

  async fetchVersion(
    input: RuntimeSourceDescriptor,
    request: Request
  ): Promise<Response> {
    await this.configure(input)
    await this.ensureVersionReady(input)
    const incoming = new URL(request.url)
    const target = new URL(
      `http://127.0.0.1:${SUPERVISOR_PORT}/v/${input.versionId}${incoming.pathname}`
    )
    target.search = incoming.search
    const headers = new Headers(request.headers)
    headers.set("X-Eidos-Supervisor-Token", this.controlToken)
    headers.set("Host", `127.0.0.1:${SUPERVISOR_PORT}`)
    return await this.containerFetch(
      target,
      {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      },
      SUPERVISOR_PORT
    )
  }

  async retireVersion(versionId: string): Promise<void> {
    await this.stateReady
    if (!VERSION_ID.test(versionId)) return
    this.readyVersions.delete(versionId)
    this.descriptors.delete(versionId)
    await this.ctx.storage.delete(descriptorStorageKey(versionId))
    const state = await this.getState()
    if (state.status !== "healthy" && state.status !== "running") return
    const response = await this.supervisorFetch(
      `/__supervisor/versions/${versionId}`,
      { method: "DELETE" }
    )
    await response.body?.cancel()
  }

  override async fetch(_request: Request): Promise<Response> {
    return new Response("Direct Runtime access is not available", {
      status: 404,
    })
  }

  override onStop(): void {
    this.readyVersions.clear()
  }

  override onError(error: unknown): unknown {
    this.readyVersions.clear()
    return super.onError(error)
  }

  private async configure(input: RuntimeSourceDescriptor): Promise<void> {
    await this.stateReady
    validateDescriptor(input)
    const key = descriptorStorageKey(input.versionId)
    const existing =
      this.descriptors.get(input.versionId) ??
      (await this.ctx.storage.get<RuntimeSourceDescriptor>(key))
    if (existing !== undefined && !sameImmutableRuntime(existing, input)) {
      throw new RuntimePreparationError(
        "runtime_descriptor_conflict",
        "Runtime Version is already bound to different immutable source"
      )
    }
    if (
      existing === undefined ||
      existing.runtimeIdleSeconds !== input.runtimeIdleSeconds
    ) {
      await this.ctx.storage.put(key, input)
    }
    this.descriptors.set(input.versionId, input)
    const currentIdleSeconds = parseSleepAfterSeconds(this.sleepAfter)
    const idleSeconds = Math.max(
      boundedIdleSeconds(input.runtimeIdleSeconds),
      currentIdleSeconds
    )
    if (idleSeconds !== currentIdleSeconds) {
      this.sleepAfter = `${idleSeconds}s`
      await this.ctx.storage.put("runtime-shard-idle-seconds", idleSeconds)
    }
  }

  private async ensureVersionReady(
    descriptor: RuntimeSourceDescriptor
  ): Promise<void> {
    if (this.readyVersions.has(descriptor.versionId)) return
    const existing = this.preparations.get(descriptor.versionId)
    if (existing !== undefined) return await existing
    const preparing = this.prepareVersion(descriptor)
      .then(() => this.readyVersions.mark(descriptor.versionId))
      .finally(() => {
        this.preparations.delete(descriptor.versionId)
      })
    this.preparations.set(descriptor.versionId, preparing)
    return await preparing
  }

  private async prepareVersion(
    descriptor: RuntimeSourceDescriptor
  ): Promise<void> {
    await this.ensureSupervisorReady()
    if (await this.supervisorHasVersion(descriptor)) return

    const object = await this.env.PUBLISH_OBJECTS.get(
      descriptor.sourceObjectKey
    )
    if (
      object === null ||
      object.size.toString() !== descriptor.sourceBytes ||
      object.customMetadata?.contentBytes !== descriptor.sourceBytes ||
      object.customMetadata.contentSha256 !== descriptor.sourceSha256
    ) {
      await object?.body.cancel()
      await this.markSourceUnavailable(descriptor)
      throw new RuntimePreparationError(
        "source_unavailable",
        "Immutable source is unavailable"
      )
    }

    const response = await this.supervisorFetch(
      `/__supervisor/versions/${descriptor.versionId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/vnd.eidos+sqlite3",
          "Content-Length": descriptor.sourceBytes,
          "X-Eidos-Source-Bytes": descriptor.sourceBytes,
          "X-Eidos-Source-SHA256": descriptor.sourceSha256,
          "X-Eidos-Startup-Timeout": sourceStartupTimeoutSeconds(
            descriptor.sourceBytes
          ).toString(),
        },
        body: object.body,
      }
    )
    if (!response.ok) {
      const message = await boundedSupervisorError(response)
      throw new RuntimePreparationError(
        response.status === 507
          ? "runtime_pool_saturated"
          : "runtime_prepare_failed",
        message
      )
    }
    await response.body?.cancel()
  }

  private async supervisorHasVersion(
    descriptor: RuntimeSourceDescriptor
  ): Promise<boolean> {
    const response = await this.supervisorFetch(
      `/__supervisor/versions/${descriptor.versionId}`
    )
    if (response.status === 404) {
      await response.body?.cancel()
      return false
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new RuntimePreparationError(
        "runtime_status_failed",
        `Runtime Supervisor returned HTTP ${response.status}`
      )
    }
    const value: unknown = await response.json()
    if (!isSupervisorVersionStatus(value)) {
      throw new RuntimePreparationError(
        "runtime_protocol_error",
        "Runtime Supervisor returned an invalid Version status"
      )
    }
    if (
      value.versionId !== descriptor.versionId ||
      value.sourceBytes !== descriptor.sourceBytes ||
      value.sourceSha256 !== descriptor.sourceSha256
    ) {
      throw new RuntimePreparationError(
        "runtime_descriptor_conflict",
        "Runtime Supervisor has different immutable Version bytes"
      )
    }
    return true
  }

  private async ensureSupervisorReady(): Promise<void> {
    await this.stateReady
    await this.startAndWaitForPorts({
      ports: [SUPERVISOR_PORT],
      cancellationOptions: {
        instanceGetTimeoutMS: 30_000,
        portReadyTimeoutMS: 60_000,
        waitInterval: 250,
      },
      startOptions: { envVars: this.envVars, enableInternet: false },
    })
  }

  private async supervisorFetch(
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    const headers = new Headers(init?.headers)
    headers.set("Host", `127.0.0.1:${SUPERVISOR_PORT}`)
    headers.set("X-Eidos-Supervisor-Token", this.controlToken)
    return await this.containerFetch(
      `http://127.0.0.1:${SUPERVISOR_PORT}${path}`,
      { ...init, headers },
      SUPERVISOR_PORT
    )
  }

  private async runtimeJson(
    versionId: string,
    path: string,
    init?: RequestInit
  ): Promise<Record<string, unknown>> {
    const headers = new Headers(init?.headers)
    headers.set("Content-Type", "application/json")
    const response = await this.supervisorFetch(`/v/${versionId}${path}`, {
      ...init,
      headers,
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new RuntimePreparationError(
        "runtime_http_error",
        `Runtime returned HTTP ${response.status}`
      )
    }
    const value: unknown = await response.json()
    if (!isRecord(value)) {
      throw new RuntimePreparationError(
        "runtime_protocol_error",
        "Runtime returned an invalid response"
      )
    }
    return value
  }

  private applySupervisorEnvironment(): void {
    this.envVars = {
      EIDOS_SUPERVISOR_PORT: SUPERVISOR_PORT.toString(),
      EIDOS_SUPERVISOR_TOKEN: this.controlToken,
      EIDOS_RUNTIME_MAX_ACTIVE: this.env.RUNTIME_MAX_ACTIVE_VERSIONS,
      EIDOS_RUNTIME_MAX_CACHE_BYTES: this.env.RUNTIME_MAX_CACHE_BYTES,
      EIDOS_RUNTIME_MAX_INFLIGHT: this.env.RUNTIME_MAX_INFLIGHT_REQUESTS,
    }
  }

  private async markSourceUnavailable(
    descriptor: RuntimeSourceDescriptor
  ): Promise<void> {
    await this.env.PUBLISH_TENANTS.getByName(
      descriptor.tenantId
    ).markTargetUnhealthy(descriptor.versionId, "source_unavailable")
    console.error(
      JSON.stringify({
        message: "immutable Publish source is unavailable",
        tenantId: descriptor.tenantId,
        versionId: descriptor.versionId,
        shardKey: descriptor.shardKey,
      })
    )
  }
}

export function runtimeShardName(
  tenantId: string,
  configuredShardCount: string
): string {
  const shardCount = Number(configuredShardCount)
  if (
    !Number.isInteger(shardCount) ||
    shardCount < 1 ||
    shardCount > MAX_SHARDS
  ) {
    throw new RuntimePreparationError(
      "runtime_pool_configuration_invalid",
      "Runtime shard count must be an integer between 1 and 1024"
    )
  }
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(tenantId)) {
    hash = Math.imul(hash ^ byte, 0x01000193)
  }
  const index = (hash >>> 0) % shardCount
  return `${SHARD_GENERATION}-${index.toString().padStart(4, "0")}`
}

export function runtimeDescriptor(
  version: PublicationVersionRecord,
  tenantId: string,
  runtimeIdleSeconds: number,
  configuredShardCount: string
): RuntimeSourceDescriptor {
  if (
    version.driverId !== "org.eidos.driver.eidos" ||
    version.driverVersion !== "1.0"
  ) {
    throw new RuntimePreparationError(
      "unsupported_driver",
      "Version Driver is not installed"
    )
  }
  return {
    tenantId,
    versionId: version.versionId,
    shardKey: runtimeShardName(tenantId, configuredShardCount),
    sourceObjectKey: version.entrypointObjectKey,
    sourceBytes: version.entrypoint.bytes,
    sourceSha256: version.entrypoint.sha256,
    sourceManifestSha256: version.sourceManifestSha256,
    driverId: "org.eidos.driver.eidos",
    driverVersion: "1.0",
    runtimeIdleSeconds,
  }
}

export function sourceStartupTimeoutSeconds(sourceBytes: string): number {
  const bytes = BigInt(sourceBytes)
  const transferSeconds =
    (bytes + SOURCE_BYTES_PER_SECOND - 1n) / SOURCE_BYTES_PER_SECOND
  const budgetSeconds = transferSeconds + 30n
  return Number(
    budgetSeconds < MIN_SOURCE_STARTUP_SECONDS
      ? MIN_SOURCE_STARTUP_SECONDS
      : budgetSeconds > MAX_SOURCE_STARTUP_SECONDS
        ? MAX_SOURCE_STARTUP_SECONDS
        : budgetSeconds
  )
}

export class RuntimePreparationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "RuntimePreparationError"
    this.code = code
  }
}

function validateDescriptor(descriptor: RuntimeSourceDescriptor): void {
  if (
    descriptor.tenantId.length === 0 ||
    descriptor.tenantId.length > 256 ||
    !VERSION_ID.test(descriptor.versionId) ||
    !descriptor.shardKey.startsWith(`${SHARD_GENERATION}-`) ||
    !/^(?:0|[1-9][0-9]*)$/.test(descriptor.sourceBytes) ||
    !SHA256.test(descriptor.sourceSha256) ||
    !SHA256.test(descriptor.sourceManifestSha256)
  ) {
    throw new RuntimePreparationError(
      "invalid_runtime_descriptor",
      "Runtime descriptor is invalid"
    )
  }
}

function sameImmutableRuntime(
  existing: RuntimeSourceDescriptor,
  input: RuntimeSourceDescriptor
): boolean {
  return (
    existing.versionId === input.versionId &&
    existing.shardKey === input.shardKey &&
    existing.tenantId === input.tenantId &&
    existing.sourceObjectKey === input.sourceObjectKey &&
    existing.sourceBytes === input.sourceBytes &&
    existing.sourceSha256 === input.sourceSha256 &&
    existing.sourceManifestSha256 === input.sourceManifestSha256 &&
    existing.driverId === input.driverId &&
    existing.driverVersion === input.driverVersion
  )
}

function descriptorStorageKey(versionId: string): string {
  return `runtime-descriptor/${versionId}`
}

function boundedIdleSeconds(value: number): number {
  return Math.max(1, Math.min(Math.floor(value), 3600))
}

function parseSleepAfterSeconds(value: string | number): number {
  if (typeof value === "number") return boundedIdleSeconds(value)
  const matched = /^(\d+)s$/.exec(value)
  return matched === null ? 60 : boundedIdleSeconds(Number(matched[1]))
}

async function boundedSupervisorError(response: Response): Promise<string> {
  const text = await response.text()
  return new TextEncoder().encode(text).byteLength <= 4096
    ? text || `Runtime Supervisor returned HTTP ${response.status}`
    : `Runtime Supervisor returned HTTP ${response.status}`
}

function isSupervisorVersionStatus(
  value: unknown
): value is SupervisorVersionStatus {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    typeof value.versionId === "string" &&
    typeof value.sourceBytes === "string" &&
    typeof value.sourceSha256 === "string"
  )
}

function requireOkEnvelope(
  value: Record<string, unknown>,
  code: string
): unknown {
  if (value.ok !== true) {
    throw new RuntimePreparationError(code, "Runtime operation failed")
  }
  return value.value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
