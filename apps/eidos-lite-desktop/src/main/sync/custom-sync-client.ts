import type {
  EidosSyncEncryption,
  EidosSyncRepository,
  EidosSyncRepositoryList,
} from "../../shared/contracts"
import { normalizeCloudSpaceDisplayName } from "./cloud-space-name"
import { OfficialSyncError, syncEncryption } from "./official-sync-client"

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/
const MAX_JSON_BYTES = 1024 * 1024

export class CustomSyncError extends OfficialSyncError {
  constructor(message: string, code = "invalid-response", status?: number) {
    super(message, code, status)
    this.name = "CustomSyncError"
  }
}

export function customSyncOrigin(
  value: string,
  allowLoopbackHttp = false
): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new CustomSyncError(
      "Enter a valid HTTPS server address.",
      "invalid-server"
    )
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    (url.protocol !== "https:" &&
      !(allowLoopbackHttp && loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new CustomSyncError(
      "Use an HTTPS server origin without a path, query or credentials.",
      "invalid-server"
    )
  }
  return url.origin
}

export function customSyncRepositoryName(
  remoteUrl: string,
  origin: string
): string | null {
  try {
    const url = new URL(remoteUrl)
    const parts = url.pathname.split("/")
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 3 ||
      parts[1] !== "personal" ||
      !NAME.test(parts[2] ?? "")
    )
      return null
    return parts[2] ?? null
  } catch {
    return null
  }
}

export interface CustomSyncProvisionResult {
  created: boolean
  namespace: "personal"
  repository: string
  remoteUrl: string
  encryption: EidosSyncEncryption
}

/** The personal template's management contract; credentials never follow redirects. */
export class CustomSyncClient {
  readonly origin: string
  private discovery: Promise<void> | undefined

  constructor(
    origin: string,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
    allowLoopbackHttp = false
  ) {
    this.origin = customSyncOrigin(origin, allowLoopbackHttp)
  }

  async discover(): Promise<void> {
    if (!this.discovery) {
      this.discovery = this.readDiscovery().catch((error: unknown) => {
        this.discovery = undefined
        throw error
      })
    }
    return this.discovery
  }

  private async readDiscovery(): Promise<void> {
    const value = record(await this.requestJson("/.well-known/graft"))
    const auth = record(value.authentication)
    const management = record(value.management)
    if (
      value.protocol !== "graft-remote" ||
      value.version !== 1 ||
      value.remote_url_template !== `${this.origin}/personal/{repository}` ||
      auth.scheme !== "bearer" ||
      auth.authority !== this.origin ||
      management.repositories !== `${this.origin}/api/graft/repositories`
    ) {
      throw new CustomSyncError(
        "The server returned incompatible or untrusted discovery metadata.",
        "invalid-discovery"
      )
    }
  }

  async listRepositories(token: string): Promise<EidosSyncRepositoryList> {
    await this.discover()
    const value = record(
      await this.requestJson("/api/graft/repositories", {}, token)
    )
    if (value.namespace !== "personal" || !Array.isArray(value.repositories))
      throw invalidResponse()
    const repositories = value.repositories.map(
      (entry: unknown): EidosSyncRepository => {
        const item = record(entry)
        if (
          typeof item.name !== "string" ||
          !NAME.test(item.name) ||
          typeof item.remote_url !== "string" ||
          customSyncRepositoryName(item.remote_url, this.origin) !==
            item.name ||
          !Number.isSafeInteger(item.created_at) ||
          Number(item.created_at) < 0
        )
          throw invalidResponse()
        const displayName = normalizeCloudSpaceDisplayName(
          item.display_name ?? item.name
        )
        if (displayName === null) throw invalidResponse()
        const encryption = syncEncryption(item.encryption)
        return {
          name: item.name,
          displayName,
          createdAtMs: Number(item.created_at),
          remoteUrl: item.remote_url,
          ...(encryption ? { encryption } : {}),
        }
      }
    )
    if (
      new Set(repositories.map((item) => item.remoteUrl)).size !==
      repositories.length
    )
      throw invalidResponse()
    return { namespace: "personal", repositories }
  }

  async provisionRepository(
    name: string,
    displayName: string,
    token: string
  ): Promise<CustomSyncProvisionResult> {
    checkName(name)
    const normalized = checkedDisplayName(displayName)
    await this.discover()
    const value = record(
      await this.requestJson(
        `/api/graft/repositories/${name}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: normalized,
            encryption: "encrypted-remote-v1",
          }),
        },
        token
      )
    )
    if (
      typeof value.created !== "boolean" ||
      value.namespace !== "personal" ||
      value.repository !== name ||
      typeof value.remote_url !== "string" ||
      customSyncRepositoryName(value.remote_url, this.origin) !== name
    )
      throw invalidResponse()
    const encryption = syncEncryption(value.encryption)
    if (!encryption)
      throw new CustomSyncError(
        "The server did not create an encrypted repository.",
        "invalid-response"
      )
    await this.verifyRepository(value.remote_url, token, encryption)
    return {
      created: value.created,
      namespace: "personal",
      repository: name,
      remoteUrl: value.remote_url,
      encryption,
    }
  }

  async verifyRepository(
    remoteUrl: string,
    token: string,
    expected?: EidosSyncEncryption
  ): Promise<EidosSyncEncryption> {
    const name = customSyncRepositoryName(remoteUrl, this.origin)
    if (!name)
      throw new CustomSyncError(
        "The repository does not belong to this server.",
        "access-denied"
      )
    await this.discover()
    const value = record(await this.requestJson(`/personal/${name}`, {}, token))
    const encryption = syncEncryption(value.encryption)
    if (
      value.protocol !== "graft-remote" ||
      value.version !== 1 ||
      !encryption ||
      (expected && encryption.uuid !== expected.uuid)
    ) {
      throw new CustomSyncError(
        "The repository encryption identity changed or is unsupported.",
        "invalid-response"
      )
    }
    return encryption
  }

  async renameRepository(
    name: string,
    displayName: string,
    token: string
  ): Promise<void> {
    checkName(name)
    const normalized = checkedDisplayName(displayName)
    await this.discover()
    const value = record(
      await this.requestJson(
        `/api/graft/repositories/${name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: normalized }),
        },
        token
      )
    )
    if (
      value.namespace !== "personal" ||
      value.repository !== name ||
      value.display_name !== normalized ||
      typeof value.remote_url !== "string" ||
      customSyncRepositoryName(value.remote_url, this.origin) !== name
    )
      throw invalidResponse()
  }

  private async requestJson(
    path: string,
    init: RequestInit = {},
    token?: string
  ): Promise<unknown> {
    const url = new URL(path, this.origin)
    if (url.origin !== this.origin || url.username || url.password)
      throw invalidResponse()
    const headers = new Headers(init.headers)
    headers.set("Accept", "application/json")
    headers.set("Graft-Protocol", "1")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    const timeout = AbortSignal.timeout(30_000)
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers,
        redirect: "manual",
        signal: timeout,
      })
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status >= 300 && response.status < 400)
          throw new CustomSyncError(
            "The server redirected the request. Use its final HTTPS origin.",
            "invalid-discovery",
            response.status
          )
        const code =
          response.status === 401
            ? "authentication-required"
            : response.status === 403
              ? "access-denied"
              : response.status === 404
                ? "remote-not-found"
                : response.status === 409
                  ? "remote-conflict"
                  : response.status === 429
                    ? "rate-limited"
                    : response.status >= 500
                      ? "service-unavailable"
                      : "request-failed"
        throw new CustomSyncError(
          response.status === 401
            ? "The server access key was rejected. Update it and try again."
            : `The custom server returned HTTP ${response.status}.`,
          code,
          response.status
        )
      }
      if (!response.body) throw invalidResponse()
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > MAX_JSON_BYTES) {
            await reader.cancel()
            throw invalidResponse()
          }
          chunks.push(chunk.value)
        }
      } finally {
        reader.releaseLock()
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      ) as unknown
    } catch (error) {
      if (error instanceof OfficialSyncError) throw error
      throw new CustomSyncError(
        timeout.aborted
          ? "The custom server request timed out."
          : "The custom server could not be reached or returned invalid JSON.",
        timeout.aborted ? "request-timeout" : "service-unavailable"
      )
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw invalidResponse()
  return value as Record<string, unknown>
}
function invalidResponse() {
  return new CustomSyncError("The custom server returned an invalid response.")
}
function checkName(value: string) {
  if (!NAME.test(value))
    throw new CustomSyncError(
      "Use 1–64 letters, digits, '.', '_' or '-' for the repository name.",
      "invalid-repository-name"
    )
}
function checkedDisplayName(value: string) {
  const normalized = normalizeCloudSpaceDisplayName(value)
  if (normalized === null)
    throw new CustomSyncError(
      "Use a Space name of 1–80 characters without control characters.",
      "invalid-display-name"
    )
  return normalized
}
