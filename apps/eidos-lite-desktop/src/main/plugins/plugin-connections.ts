import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import https from "node:https"
import { lookup } from "node:dns/promises"
import { allowedIPv4 } from "./plugin-network"

export interface CredentialCipher {
  available(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

export function connectionHttpError(status: number, body: string, key: string) {
  let detail = ""
  try {
    const value = JSON.parse(body)
    const message =
      value?.error?.message ??
      value?.message ??
      (typeof value?.error === "string" ? value.error : "")
    if (typeof message === "string") detail = message
  } catch {
    /* Do not expose arbitrary HTML error pages. */
  }
  // Providers occasionally echo credentials in validation errors.
  detail = detail
    .split(key)
    .join("[redacted]")
    .replace(/Bearer\s+[^\s"',;]+/gi, "Bearer [redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 1000)
  return new Error(`Connection HTTP ${status}${detail ? `: ${detail}` : ""}`)
}

export function connectionClientHeaders(
  url: URL,
  scope: string[],
  sessionId?: string
): Record<string, string> {
  return {
    "User-Agent": "EidosLite-PluginConnections/1.0",
    ...(url.origin === "https://opencode.ai" &&
    url.pathname.startsWith("/zen/go/")
      ? {
          "x-opencode-session": createHash("sha256")
            .update(JSON.stringify([scope, sessionId ?? "connection"]))
            .digest("hex"),
        }
      : {}),
  }
}

/** The plugin never receives a key. Credentials are scoped to Space/plugin/URL. */
export class PluginConnections {
  constructor(
    private directory: string,
    private cipher: CredentialCipher
  ) {}
  private file(scope: string[]) {
    return path.join(
      this.directory,
      createHash("sha256").update(JSON.stringify(scope)).digest("hex")
    )
  }
  async configured(scope: string[]) {
    try {
      await fs.access(this.file(scope))
      return true
    } catch {
      return false
    }
  }
  private async profile(scope: string[]) {
    if (!this.cipher.available())
      throw new Error("Secure credential storage is unavailable")
    return JSON.parse(
      this.cipher.decrypt(await fs.readFile(this.file(scope)))
    ) as { url: string; model: string; key: string }
  }
  async configuration(scope: string[]) {
    if (!(await this.configured(scope)))
      return { configured: false, url: "", model: "" }
    const profile = await this.profile(scope)
    return { configured: true, url: profile.url, model: profile.model }
  }
  async configure(scope: string[], value: unknown) {
    if (value === null) return this.save(scope, null)
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid connection configuration")
    const input = value as Record<string, unknown>
    if (
      typeof input.url !== "string" ||
      input.url.length > 2048 ||
      typeof input.model !== "string" ||
      !input.model.trim() ||
      input.model.length > 200 ||
      typeof input.key !== "string"
    )
      throw new Error("Endpoint, model and API key are required")
    const url = new URL(input.url.trim())
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Use a public HTTPS endpoint without credentials or query parameters"
      )
    let key = input.key.trim()
    if (!key) {
      const previous = await this.profile(scope)
      if (previous.url !== url.href)
        throw new Error("Enter an API key for the new endpoint")
      key = previous.key
    }
    if (!key || key.length > 4096 || /[\r\n]/.test(key))
      throw new Error("Invalid API key")
    await this.save(
      scope,
      JSON.stringify({ url: url.href, model: input.model.trim(), key })
    )
  }
  async save(scope: string[], key: string | null) {
    if (key === null) {
      await fs.rm(this.file(scope), { force: true })
      return
    }
    if (!key.trim() || key.length > 8192 || /[\r\n]/.test(key))
      throw new Error("Invalid API key")
    if (!this.cipher.available())
      throw new Error("Secure credential storage is unavailable")
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temp = `${this.file(scope)}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temp, this.cipher.encrypt(key.trim()), { mode: 0o600 })
      await fs.rename(temp, this.file(scope))
    } finally {
      await fs.rm(temp, { force: true })
    }
  }
  async request(
    scope: string[],
    urlText: string,
    body: unknown,
    signal: AbortSignal,
    configurable = false,
    sessionId?: string
  ) {
    if (!this.cipher.available())
      throw new Error("Secure credential storage is unavailable")
    const profile = configurable
      ? await this.profile(scope).catch(() => {
          throw new Error(
            "Configure endpoint, model and API key in plugin settings first"
          )
        })
      : undefined
    const url = new URL(profile?.url ?? urlText)
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new Error("Invalid connection URL")
    if (profile && (!body || typeof body !== "object" || Array.isArray(body)))
      throw new Error("Expected a JSON object")
    const serialized = JSON.stringify(
      profile ? { ...(body as object), model: profile.model } : body
    )
    if (!serialized || Buffer.byteLength(serialized) > 1024 * 1024)
      throw new Error("Request exceeds 1 MiB")
    let key: string
    try {
      key =
        profile?.key ?? this.cipher.decrypt(await fs.readFile(this.file(scope)))
    } catch {
      throw new Error("Configure the connection API key first")
    }
    const { address } = await lookup(url.hostname, { family: 4 })
    if (!allowedIPv4(address))
      throw new Error("Private network connections are not allowed")
    signal.throwIfAborted()
    return new Promise<unknown>((resolve, reject) => {
      const request = https.request(
        url,
        {
          method: "POST",
          signal,
          lookup: (_host, options, callback) =>
            options.all
              ? callback(null, [{ address, family: 4 }])
              : callback(null, address, 4),
          headers: {
            ...connectionClientHeaders(url, scope, sessionId),
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(serialized),
          },
        },
        (response) => {
          const status = response.statusCode ?? 0
          const failed = status < 200 || status >= 300
          const limit = failed ? 64 * 1024 : 4 * 1024 * 1024
          let size = 0
          const chunks: Buffer[] = []
          response.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > limit)
              response.destroy(new Error("Connection response exceeds limit"))
            else chunks.push(chunk)
          })
          response.on("error", () =>
            reject(
              new Error(
                failed
                  ? `Connection HTTP ${status}: error response could not be read`
                  : "Connection response failed"
              )
            )
          )
          response.on("end", () => {
            if (failed) {
              reject(
                connectionHttpError(
                  status,
                  Buffer.concat(chunks).toString("utf8"),
                  key
                )
              )
              return
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
            } catch {
              reject(new Error("Connection returned invalid JSON"))
            }
          })
        }
      )
      const timer = setTimeout(
        () => request.destroy(new Error("Connection timed out")),
        configurable ? 90000 : 25000
      )
      request.on("close", () => clearTimeout(timer))
      request.on("error", () =>
        reject(
          new Error(
            signal.aborted ? "Action cancelled" : "Connection request failed"
          )
        )
      )
      request.end(serialized)
    })
  }
}
