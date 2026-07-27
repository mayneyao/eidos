import { Inject, Injectable } from "../../common/di"
import { CredentialsManager } from "./credentials"

export const EIDOS_GRAFT_REMOTE_ORIGIN = "https://sync.eidos.space"

const MANAGEMENT_TIMEOUT_MS = 30_000
const REPOSITORY_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/

export interface GraftRemoteDiscovery {
  service: "eidos-graft-remote"
  protocol: "graft-remote"
  version: 1
  remote_url_template: string
  authentication: {
    scheme: "bearer"
    authority: string
  }
}

export interface OfficialGraftRepository {
  name: string
  createdAt: number
  remoteUrl: string
}

export interface OfficialGraftRepositoryList {
  namespace: string
  repositories: OfficialGraftRepository[]
}

export interface OfficialGraftRepositoryProvision {
  created: boolean
  namespace: string
  repository: string
  remoteUrl: string
}

export class EidosSyncError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = "EidosSyncError"
  }
}

type Fetch = typeof globalThis.fetch

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requestError(status: number): EidosSyncError {
  switch (status) {
    case 401:
      return new EidosSyncError(
        "Your Eidos Sync session expired. Sign in to eidos.space again.",
        status
      )
    case 403:
      return new EidosSyncError(
        "Eidos Sync denied access to this repository. Check the signed-in account.",
        status
      )
    case 404:
      return new EidosSyncError(
        "The Eidos Sync repository was not found. Reconnect the Space to provision it.",
        status
      )
    case 409:
      return new EidosSyncError(
        "The remote changed concurrently. Fetch the latest state before trying again.",
        status
      )
    case 426:
      return new EidosSyncError(
        "Eidos Sync requires a newer Desktop or Graft protocol version.",
        status
      )
    case 503:
      return new EidosSyncError(
        "Eidos Sync is temporarily unavailable. Try again after the service recovers.",
        status
      )
    default:
      return new EidosSyncError(
        `Eidos Sync request failed with HTTP ${status}.`,
        status
      )
  }
}

function normalizedRemoteUrl(value: string): URL | null {
  const httpUrl = value.startsWith("graft+https://")
    ? `https://${value.slice("graft+https://".length)}`
    : value
  try {
    return new URL(httpUrl)
  } catch {
    return null
  }
}

export function isOfficialGraftRemoteUrl(
  value: unknown,
  origin = EIDOS_GRAFT_REMOTE_ORIGIN
): value is string {
  if (typeof value !== "string") return false
  if (!value.startsWith("https://") && !value.startsWith("graft+https://")) {
    return false
  }
  const url = normalizedRemoteUrl(value)
  if (!url || url.username || url.password || url.search || url.hash)
    return false
  const expectedOrigin = new URL(origin).origin
  const segments = url.pathname.split("/").filter(Boolean)
  return url.origin === expectedOrigin && segments.length === 2
}

export function graftRemoteHttpStatus(error: unknown): number | undefined {
  if (error instanceof EidosSyncError) return error.status
  const message = error instanceof Error ? error.message : String(error)
  for (const status of [401, 403, 404, 409, 426, 503]) {
    if (
      new RegExp(
        `(?:HTTP\\s*|status(?:=|:|\\s)|remote(?: server)? returned\\s*)${status}\\b`,
        "i"
      ).test(message)
    ) {
      return status
    }
  }
  if (/unauthorized/i.test(message)) return 401
  if (/forbidden/i.test(message)) return 403
  return undefined
}

export function isEmptyGraftRemoteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /remote\s+.+\s+has no branch\s+/i.test(message) ||
    /Eidos Sync has no versions yet/i.test(message)
  )
}

export function actionableGraftRemoteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (isEmptyGraftRemoteError(error)) {
    return new EidosSyncError(
      "Eidos Sync has no versions yet. Push versions to initialize the remote branch."
    )
  }
  const status = graftRemoteHttpStatus(error)
  return status
    ? requestError(status)
    : error instanceof Error
      ? error
      : new Error(message)
}

export class OfficialGraftRemoteClient {
  private readonly origin: string

  constructor(
    origin = EIDOS_GRAFT_REMOTE_ORIGIN,
    private readonly fetchImpl: Fetch = globalThis.fetch
  ) {
    this.origin = new URL(origin).origin
  }

  async discover(): Promise<GraftRemoteDiscovery> {
    const value = await this.requestJson("/.well-known/graft")
    if (
      !isObject(value) ||
      value.service !== "eidos-graft-remote" ||
      value.protocol !== "graft-remote" ||
      value.version !== 1 ||
      typeof value.remote_url_template !== "string" ||
      !isObject(value.authentication) ||
      value.authentication.scheme !== "bearer" ||
      typeof value.authentication.authority !== "string"
    ) {
      throw new EidosSyncError(
        "Eidos Sync returned invalid discovery metadata."
      )
    }
    return value as unknown as GraftRemoteDiscovery
  }

  async listRepositories(token: string): Promise<OfficialGraftRepositoryList> {
    const value = await this.requestJson("/api/graft/repositories", {}, token)
    if (
      !isObject(value) ||
      typeof value.namespace !== "string" ||
      !Array.isArray(value.repositories)
    ) {
      throw new EidosSyncError(
        "Eidos Sync returned an invalid repository list."
      )
    }
    const repositories = value.repositories.map((entry) => {
      if (
        !isObject(entry) ||
        typeof entry.name !== "string" ||
        typeof entry.created_at !== "number" ||
        !isOfficialGraftRemoteUrl(entry.remote_url, this.origin)
      ) {
        throw new EidosSyncError(
          "Eidos Sync returned an invalid repository entry."
        )
      }
      return {
        name: entry.name,
        createdAt: entry.created_at,
        remoteUrl: entry.remote_url,
      }
    })
    return { namespace: value.namespace, repositories }
  }

  async provisionRepository(
    repository: string,
    token: string
  ): Promise<OfficialGraftRepositoryProvision> {
    if (!REPOSITORY_NAME.test(repository)) {
      throw new EidosSyncError(
        "Repository name must use 1-64 letters, digits, '.', '_' or '-'."
      )
    }
    await this.discover()
    const value = await this.requestJson(
      `/api/graft/repositories/${encodeURIComponent(repository)}`,
      { method: "PUT" },
      token
    )
    if (
      !isObject(value) ||
      typeof value.created !== "boolean" ||
      typeof value.namespace !== "string" ||
      value.repository !== repository ||
      !isOfficialGraftRemoteUrl(value.remote_url, this.origin)
    ) {
      throw new EidosSyncError(
        "Eidos Sync returned an invalid provision response."
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
    const timeout = setTimeout(() => controller.abort(), MANAGEMENT_TIMEOUT_MS)
    const headers = new Headers(init.headers)
    headers.set("Accept", "application/json")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    try {
      const response = await this.fetchImpl(new URL(pathname, this.origin), {
        ...init,
        headers,
        signal: controller.signal,
      })
      if (!response.ok) throw requestError(response.status)
      try {
        return (await response.json()) as unknown
      } catch {
        throw new EidosSyncError("Eidos Sync returned malformed JSON.")
      }
    } catch (error) {
      if (error instanceof EidosSyncError) throw error
      if ((error as Error)?.name === "AbortError") {
        throw new EidosSyncError("Eidos Sync request timed out.")
      }
      throw new EidosSyncError("Eidos Sync could not be reached.")
    } finally {
      clearTimeout(timeout)
    }
  }
}

@Injectable()
export class OfficialGraftRemoteService {
  private readonly client = new OfficialGraftRemoteClient()

  constructor(
    @Inject(CredentialsManager) private readonly credentials: CredentialsManager
  ) {}

  discover(): Promise<GraftRemoteDiscovery> {
    return this.client.discover()
  }

  listRepositories(): Promise<OfficialGraftRepositoryList> {
    return this.withAccessToken((token) => this.client.listRepositories(token))
  }

  provisionRepository(
    repository: string
  ): Promise<OfficialGraftRepositoryProvision> {
    return this.withAccessToken((token) =>
      this.client.provisionRepository(repository, token)
    )
  }

  async getAccessToken(): Promise<string> {
    const token = await this.credentials.getAccessToken()
    if (!token) throw requestError(401)
    return token
  }

  async refreshAccessToken(): Promise<string> {
    const tokens = await this.credentials.refreshTokens()
    if (!tokens?.access_token) throw requestError(401)
    return tokens.access_token
  }

  private async withAccessToken<T>(
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    const token = await this.getAccessToken()
    try {
      return await operation(token)
    } catch (error) {
      if (graftRemoteHttpStatus(error) !== 401)
        throw actionableGraftRemoteError(error)
      const refreshed = await this.refreshAccessToken()
      try {
        return await operation(refreshed)
      } catch (retryError) {
        throw actionableGraftRemoteError(retryError)
      }
    }
  }
}
