import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { SecretEncryption } from "../account/credential-store"
import {
  CustomSyncClient,
  CustomSyncError,
  customSyncOrigin,
  customSyncRepositoryName,
} from "./custom-sync-client"

export interface CustomSyncServerProfile {
  id: string
  name: string
  origin: string
  credentialAvailable: boolean
}
export interface CustomSyncServerInput {
  id?: string
  name: string
  origin: string
  token?: string
}
interface StoredServer extends CustomSyncServerProfile {
  token: string
}
export interface CustomSyncAccess {
  serverId: string
  origin: string
  subject: "personal"
  accessToken: string
  assertCurrent(): void
}
interface Options {
  requireAccess(): Promise<void>
  fetchImpl?: typeof globalThis.fetch
  allowLoopbackHttp?: boolean
}

/** Separate from official account storage; all on-disk credentials are OS-encrypted. */
export class CustomSyncServers {
  private loaded: Promise<StoredServer[]> | undefined
  private tail: Promise<unknown> = Promise.resolve()
  private readonly revisions = new Map<string, number>()

  constructor(
    private readonly filePath: string,
    private readonly encryption: SecretEncryption,
    private readonly options: Options
  ) {}

  async list(): Promise<CustomSyncServerProfile[]> {
    return (await this.read()).map(({ id, name, origin }) => ({
      id,
      name,
      origin,
      credentialAvailable: true,
    }))
  }

  save(input: CustomSyncServerInput): Promise<CustomSyncServerProfile> {
    return this.serialize(async () => {
      await this.options.requireAccess()
      if (
        !input ||
        typeof input !== "object" ||
        typeof input.origin !== "string" ||
        typeof input.name !== "string" ||
        (input.id !== undefined && typeof input.id !== "string") ||
        (input.token !== undefined && typeof input.token !== "string")
      )
        throw new CustomSyncError(
          "Invalid custom server settings.",
          "invalid-server"
        )
      const origin = customSyncOrigin(
        input.origin.trim(),
        this.options.allowLoopbackHttp
      )
      const name = input.name.trim()
      if (!name || [...name].length > 80 || /\p{Cc}/u.test(name))
        throw new CustomSyncError(
          "Use a server name of 1–80 characters.",
          "invalid-server"
        )
      const servers = await this.read()
      const previous = input.id
        ? servers.find((item) => item.id === input.id)
        : undefined
      if (input.id && !previous)
        throw new CustomSyncError(
          "The custom server no longer exists.",
          "remote-not-found"
        )
      if (previous && previous.origin !== origin)
        throw new CustomSyncError(
          "Add a separate server to change its address. Existing connections keep their server identity.",
          "invalid-server"
        )
      if (
        servers.some(
          (item) => item.origin === origin && item.id !== previous?.id
        )
      )
        throw new CustomSyncError(
          "This server is already saved.",
          "invalid-server"
        )
      const token = input.token || previous?.token
      if (!token || token.length < 32 || token.length > 512 || /\s/.test(token))
        throw new CustomSyncError(
          "Enter the server's access key with at least 32 characters.",
          "invalid-credential"
        )
      const next = {
        id: previous?.id ?? randomUUID(),
        name,
        origin,
        token,
        credentialAvailable: true,
      }
      await this.client(origin).listRepositories(token)
      await this.write([...servers.filter((item) => item.id !== next.id), next])
      this.revisions.set(next.id, (this.revisions.get(next.id) ?? 0) + 1)
      return { id: next.id, name, origin, credentialAvailable: true }
    })
  }

  remove(id: string): Promise<void> {
    return this.serialize(async () => {
      const servers = await this.read()
      await this.write(servers.filter((item) => item.id !== id))
      this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1)
    })
  }

  async context(serverId: string): Promise<CustomSyncAccess> {
    await this.options.requireAccess()
    const server = (await this.read()).find((item) => item.id === serverId)
    if (!server)
      throw new CustomSyncError(
        "The custom server was removed. Add it again to reconnect.",
        "authentication-required"
      )
    const revision = this.revisions.get(serverId) ?? 0
    return {
      serverId,
      origin: server.origin,
      subject: "personal",
      accessToken: server.token,
      assertCurrent: () => {
        if (revision !== (this.revisions.get(serverId) ?? 0))
          throw new CustomSyncError(
            "The custom server credentials changed. Try again with the current connection.",
            "authentication-required"
          )
      },
    }
  }

  async resolve(remoteUrl: string): Promise<CustomSyncAccess | null> {
    const server = (await this.read()).find(
      (item) => customSyncRepositoryName(remoteUrl, item.origin) !== null
    )
    return server ? this.context(server.id) : null
  }

  async repositories(serverId: string) {
    const context = await this.context(serverId)
    const result = await this.client(context.origin).listRepositories(
      context.accessToken
    )
    context.assertCurrent()
    return result
  }

  async provision(serverId: string, name: string, displayName: string) {
    const context = await this.context(serverId)
    const result = await this.client(context.origin).provisionRepository(
      name,
      displayName,
      context.accessToken
    )
    context.assertCurrent()
    return result
  }

  async verify(remoteUrl: string, expectedUuid?: string) {
    const context = await this.resolve(remoteUrl)
    if (!context)
      throw new CustomSyncError(
        "No saved custom server owns this repository.",
        "access-denied"
      )
    const encryption = await this.client(context.origin).verifyRepository(
      remoteUrl,
      context.accessToken
    )
    if (expectedUuid && encryption.uuid !== expectedUuid)
      throw new CustomSyncError(
        "The repository encryption identity changed.",
        "invalid-response"
      )
    context.assertCurrent()
    return { ...context, encryption }
  }

  /** Validate identity and repository membership using one discovery and parallel reads. */
  async verifyAccess(remoteUrl: string, expectedUuid?: string) {
    const context = await this.resolve(remoteUrl)
    if (!context)
      throw new CustomSyncError(
        "No saved custom server owns this repository.",
        "access-denied"
      )
    const client = this.client(context.origin)
    const [encryption, listed] = await Promise.all([
      client.verifyRepository(remoteUrl, context.accessToken),
      client.listRepositories(context.accessToken),
    ])
    if (expectedUuid && encryption.uuid !== expectedUuid)
      throw new CustomSyncError(
        "The repository encryption identity changed.",
        "invalid-response"
      )
    if (!listed.repositories.some((entry) => entry.remoteUrl === remoteUrl))
      throw new CustomSyncError(
        "This repository is not available on the custom server.",
        "remote-not-found"
      )
    context.assertCurrent()
    return { ...context, encryption }
  }

  async rename(
    serverId: string,
    name: string,
    displayName: string
  ): Promise<void> {
    const context = await this.context(serverId)
    await this.client(context.origin).renameRepository(
      name,
      displayName,
      context.accessToken
    )
    context.assertCurrent()
  }

  private client(origin: string) {
    return new CustomSyncClient(
      origin,
      this.options.fetchImpl,
      this.options.allowLoopbackHttp
    )
  }

  private read(): Promise<StoredServer[]> {
    if (!this.loaded)
      this.loaded = this.load().catch((error: unknown) => {
        this.loaded = undefined
        throw error
      })
    return this.loaded
  }
  private async load(): Promise<StoredServer[]> {
    let bytes: Buffer
    try {
      bytes = await fs.readFile(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw new CustomSyncError(
        "Custom server settings could not be read.",
        "credential-unavailable"
      )
    }
    if (!this.encryption.isAvailable())
      throw new CustomSyncError(
        "System credential encryption is unavailable.",
        "credential-unavailable"
      )
    try {
      if (bytes.length > 2 * MAX_STORE_BYTES) throw new Error("oversize")
      const value: unknown = JSON.parse(this.encryption.decrypt(bytes))
      if (!isStore(value, this.options.allowLoopbackHttp))
        throw new Error("invalid")
      return value.servers
    } catch {
      throw new CustomSyncError(
        "Saved custom server credentials are invalid. Reconnect the server.",
        "credential-unavailable"
      )
    }
  }
  private async write(servers: StoredServer[]): Promise<void> {
    if (!this.encryption.isAvailable())
      throw new CustomSyncError(
        "System credential encryption is unavailable. Access keys will not be saved as plaintext.",
        "credential-unavailable"
      )
    const text = JSON.stringify({ version: 1, servers })
    if (Buffer.byteLength(text) > MAX_STORE_BYTES)
      throw new CustomSyncError(
        "Too many custom server profiles.",
        "invalid-server"
      )
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    })
    try {
      await fs.writeFile(temporary, this.encryption.encrypt(text), {
        flag: "wx",
        mode: 0o600,
      })
      await fs.rename(temporary, this.filePath)
      this.loaded = Promise.resolve(servers)
    } catch (error) {
      await fs.unlink(temporary).catch(() => undefined)
      throw error
    }
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(operation, operation)
    this.tail = task.catch(() => undefined)
    return task
  }
}

const MAX_STORE_BYTES = 1024 * 1024
function isStore(
  value: unknown,
  allowLoopbackHttp = false
): value is { version: 1; servers: StoredServer[] } {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("servers" in value) ||
    !Array.isArray(value.servers)
  )
    return false
  const ids = new Set<string>(),
    origins = new Set<string>()
  return value.servers.every((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !("origin" in item) ||
      typeof item.origin !== "string" ||
      !("name" in item) ||
      typeof item.name !== "string" ||
      !("token" in item) ||
      typeof item.token !== "string" ||
      item.token.length < 32 ||
      item.token.length > 512 ||
      /\s/.test(item.token) ||
      !item.id ||
      ids.has(item.id) ||
      origins.has(item.origin) ||
      customSyncOrigin(item.origin, allowLoopbackHttp) !== item.origin
    )
      return false
    ids.add(item.id)
    origins.add(item.origin)
    return true
  })
}
