import type { EidosLiteServiceEnvironment } from "../../shared/service-environment"
import { isOfficialRemoteUrl } from "../graft/graft-client"

const REQUEST_TIMEOUT_MS = 30_000
const REPOSITORY_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/

export interface OfficialSyncRepository {
  name: string
  createdAtMs: number
  remoteUrl: string
}

export interface OfficialSyncRepositoryList {
  namespace: string
  repositories: OfficialSyncRepository[]
}

export interface OfficialSyncProvisionResult {
  created: boolean
  namespace: string
  repository: string
  remoteUrl: string
}

export class OfficialSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = "OfficialSyncError"
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OfficialSyncError(
      "Eidos Sync returned invalid JSON.",
      "invalid-response"
    )
  }
  return value as Record<string, unknown>
}

function requestError(
  status: number,
  retryAfterMs?: number
): OfficialSyncError {
  switch (status) {
    case 401:
      return new OfficialSyncError(
        "Your Eidos Sync session expired. Sign in again.",
        "authentication-required",
        status
      )
    case 403:
      return new OfficialSyncError(
        "This account or device cannot access Eidos Sync.",
        "access-denied",
        status
      )
    case 404:
      return new OfficialSyncError(
        "The requested Hosted Space was not found.",
        "remote-not-found",
        status
      )
    case 409:
      return new OfficialSyncError(
        "The Eidos Sync repository changed concurrently.",
        "remote-conflict",
        status
      )
    case 426:
      return new OfficialSyncError(
        "Eidos Sync requires a newer Eidos Lite or Graft version.",
        "protocol-version-mismatch",
        status
      )
    case 413:
      return new OfficialSyncError(
        "The Eidos Sync storage quota was exceeded.",
        "quota-exceeded",
        status
      )
    case 429:
      return new OfficialSyncError(
        "Eidos Sync asked this device to retry later.",
        "rate-limited",
        status,
        retryAfterMs
      )
    case 500:
      return new OfficialSyncError(
        "Eidos Sync could not persist the Remote update.",
        "remote-persistence-failed",
        status
      )
    case 502:
    case 503:
    case 504:
      return new OfficialSyncError(
        "Eidos Sync is temporarily unavailable.",
        "service-unavailable",
        status
      )
    default:
      return new OfficialSyncError(
        `Eidos Sync request failed with HTTP ${status}.`,
        "request-failed",
        status
      )
  }
}

export class OfficialSyncClient {
  constructor(
    private readonly environment: EidosLiteServiceEnvironment,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch
  ) {}

  async discover(): Promise<void> {
    const value = object(await this.requestJson("/.well-known/graft"))
    if (
      value.service !== "eidos-graft-remote" ||
      value.protocol !== "graft-remote" ||
      value.version !== 1 ||
      value.remote_url_template !==
        `${this.environment.syncRemoteOrigin}/{namespace}/{repository}` ||
      object(value.authentication).scheme !== "bearer" ||
      object(value.authentication).authority !== this.environment.accountOrigin
    ) {
      throw new OfficialSyncError(
        "Eidos Sync returned untrusted discovery metadata.",
        "invalid-discovery"
      )
    }
  }

  async listRepositories(token: string): Promise<OfficialSyncRepositoryList> {
    const value = object(
      await this.requestJson("/api/graft/repositories", {}, token)
    )
    if (
      typeof value.namespace !== "string" ||
      !Array.isArray(value.repositories)
    ) {
      throw new OfficialSyncError(
        "Eidos Sync returned an invalid repository list.",
        "invalid-response"
      )
    }
    const repositories = value.repositories.map((entry) => {
      const repository = object(entry)
      if (
        typeof repository.name !== "string" ||
        typeof repository.created_at !== "number" ||
        typeof repository.remote_url !== "string" ||
        !isOfficialRemoteUrl(
          repository.remote_url,
          this.environment.syncRemoteOrigin
        )
      ) {
        throw new OfficialSyncError(
          "Eidos Sync returned an invalid repository entry.",
          "invalid-response"
        )
      }
      return {
        name: repository.name,
        createdAtMs: repository.created_at,
        remoteUrl: repository.remote_url,
      }
    })
    return { namespace: value.namespace, repositories }
  }

  async provisionRepository(
    repository: string,
    token: string
  ): Promise<OfficialSyncProvisionResult> {
    if (!REPOSITORY_NAME.test(repository)) {
      throw new OfficialSyncError(
        "Repository name must use 1–64 letters, digits, '.', '_' or '-'.",
        "invalid-repository-name"
      )
    }
    await this.discover()
    const value = object(
      await this.requestJson(
        `/api/graft/repositories/${encodeURIComponent(repository)}`,
        { method: "PUT" },
        token
      )
    )
    if (
      typeof value.created !== "boolean" ||
      typeof value.namespace !== "string" ||
      value.repository !== repository ||
      typeof value.remote_url !== "string" ||
      !isOfficialRemoteUrl(value.remote_url, this.environment.syncRemoteOrigin)
    ) {
      throw new OfficialSyncError(
        "Eidos Sync returned an invalid provision response.",
        "invalid-response"
      )
    }
    return {
      created: value.created,
      namespace: value.namespace,
      repository,
      remoteUrl: value.remote_url,
    }
  }

  private async requestJson(
    pathname: string,
    init: RequestInit = {},
    token?: string
  ): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const headers = new Headers(init.headers)
    headers.set("Accept", "application/json")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    try {
      const response = await this.fetchImpl(
        new URL(pathname, this.environment.syncRemoteOrigin),
        { ...init, headers, signal: controller.signal }
      )
      if (!response.ok) {
        throw requestError(
          response.status,
          retryAfterMilliseconds(response.headers.get("Retry-After"))
        )
      }
      try {
        return (await response.json()) as unknown
      } catch {
        throw new OfficialSyncError(
          "Eidos Sync returned malformed JSON.",
          "invalid-response"
        )
      }
    } catch (error) {
      if (error instanceof OfficialSyncError) throw error
      if ((error as Error)?.name === "AbortError") {
        throw new OfficialSyncError(
          "Eidos Sync request timed out.",
          "request-timeout"
        )
      }
      throw new OfficialSyncError(
        "Eidos Sync could not be reached.",
        "service-unavailable"
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000)
  }
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined
}
