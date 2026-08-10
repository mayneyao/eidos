import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"

const REQUEST_TIMEOUT_MS = 30_000

export type SyncDevicePlatform = "macos" | "windows" | "linux" | "unknown"
export type SyncAccessMode = "read_write" | "read_only" | "blocked"

export interface SyncDeviceRegistration {
  stableDeviceId: string
  displayName: string
  platform: SyncDevicePlatform
  appVersion: string
}

export interface RegisteredSyncDevice {
  id: string
  displayName: string
  platform: SyncDevicePlatform
  appVersion: string | null
  status: "active"
  version: number
}

export interface SyncAccessGrant {
  version: 1
  revision: number
  service: "eidos_sync"
  access: SyncAccessMode
  quotaBytes: number
  deviceLimit: number
}

export interface SyncAuthorization {
  subject: string
  access: SyncAccessGrant | null
}

export class AccountSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message)
    this.name = "AccountSyncError"
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AccountSyncError(
      "The Eidos Sync account service returned invalid JSON.",
      "invalid-response"
    )
  }
  return value as Record<string, unknown>
}

function string(value: Record<string, unknown>, key: string): string {
  const result = value[key]
  if (typeof result !== "string" || !result) {
    throw new AccountSyncError(
      "The Eidos Sync account service returned an invalid response.",
      "invalid-response"
    )
  }
  return result
}

function safeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null
}

function parseDevice(value: unknown): RegisteredSyncDevice {
  const device = object(object(value).device)
  const platform = device.platform
  const status = device.status
  const version = safeInteger(device.version)
  const appVersion = device.appVersion
  if (
    !["macos", "windows", "linux", "unknown"].includes(String(platform)) ||
    status !== "active" ||
    version === null ||
    (appVersion !== null && typeof appVersion !== "string")
  ) {
    throw new AccountSyncError(
      "The Eidos Sync device response is invalid.",
      "invalid-response"
    )
  }
  return {
    id: string(device, "id"),
    displayName: string(device, "displayName"),
    platform: platform as SyncDevicePlatform,
    appVersion: appVersion as string | null,
    status,
    version,
  }
}

function parseAccess(value: unknown): SyncAccessGrant {
  const grant = object(value)
  const revision = safeInteger(grant.revision)
  const quotaBytes = safeInteger(grant.quotaBytes)
  const deviceLimit = safeInteger(grant.deviceLimit)
  if (
    grant.version !== 1 ||
    grant.service !== "eidos_sync" ||
    !["read_write", "read_only", "blocked"].includes(String(grant.access)) ||
    revision === null ||
    quotaBytes === null ||
    deviceLimit === null
  ) {
    throw new AccountSyncError(
      "The Eidos Sync access grant is invalid.",
      "invalid-response"
    )
  }
  return {
    version: 1,
    revision,
    service: "eidos_sync",
    access: grant.access as SyncAccessMode,
    quotaBytes,
    deviceLimit,
  }
}

export class AccountSyncClient {
  constructor(
    private readonly environment: EidosLiteServiceEnvironment,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch
  ) {}

  async registerDevice(
    accessToken: string,
    registration: SyncDeviceRegistration
  ): Promise<RegisteredSyncDevice> {
    return parseDevice(
      await this.requestJson("/api/sync/devices/register", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      })
    )
  }

  async authorization(accessToken: string): Promise<SyncAuthorization> {
    const value = object(
      await this.requestJson("/api/sync/userinfo", accessToken)
    )
    return {
      subject: string(value, "sub"),
      access:
        value.sync_access === undefined ? null : parseAccess(value.sync_access),
    }
  }

  private async requestJson(
    pathname: string,
    accessToken: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const endpoint = new URL(pathname, this.environment.accountOrigin)
    if (endpoint.origin !== this.environment.accountOrigin) {
      throw new AccountSyncError(
        "The Eidos Sync account endpoint crossed environments.",
        "environment-mismatch"
      )
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(endpoint, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...init.headers,
        },
        redirect: "manual",
        signal: controller.signal,
      })
      if (!response.ok) {
        throw this.httpError(response.status)
      }
      try {
        return (await response.json()) as unknown
      } catch {
        throw new AccountSyncError(
          "The Eidos Sync account service returned malformed JSON.",
          "invalid-response",
          response.status
        )
      }
    } catch (error) {
      if (error instanceof AccountSyncError) throw error
      if ((error as Error)?.name === "AbortError") {
        throw new AccountSyncError(
          "The Eidos Sync account request timed out.",
          "timeout"
        )
      }
      throw new AccountSyncError(
        "The Eidos Sync account service could not be reached.",
        "unavailable"
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  private httpError(status: number): AccountSyncError {
    if (status === 401) {
      return new AccountSyncError(
        "Your Eidos Sync device session is not authorized. Sign in again.",
        "authentication-required",
        status
      )
    }
    if (status === 409) {
      return new AccountSyncError(
        "This Eidos Sync device could not be registered. It may have been revoked.",
        "device-conflict",
        status
      )
    }
    return new AccountSyncError(
      status === 503
        ? "The Eidos Sync account service is temporarily unavailable."
        : `Eidos Sync account request failed with HTTP ${status}.`,
      status === 503 ? "unavailable" : "request-failed",
      status
    )
  }
}
