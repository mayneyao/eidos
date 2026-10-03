import http from "node:http"
import https from "node:https"
import { networkInterfaces, hostname } from "node:os"
import {
  createHash,
  randomBytes,
  randomUUID,
  X509Certificate,
} from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createRequire } from "node:module"
import QRCode from "qrcode"
import { createGraftRemoteHandler } from "@eidos.space/graft-remote"
import { PeerObjectStore } from "./object-store"
import { PeerAdvertisement } from "./peer-discovery"
import type { SpaceSession } from "../space/space-session"
import type * as Selfsigned from "selfsigned"
import type { AddressInfo } from "node:net"
import type { ReadableStream } from "node:stream/web"

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const secret = () => randomBytes(32).toString("base64url")
const { generate } = createRequire(import.meta.url)(
  "selfsigned"
) as typeof Selfsigned
type Device = { id: string; name: string; tokenHash: string }
type Invitation = {
  ticket: string
  expires: number
  name?: string
  token?: string
  deviceId?: string
}
export type PeerStatus = {
  running: boolean
  invitation?: string
  qr?: string
  pending?: string
  devices: { id: string; name: string }[]
  error?: string
}

export class PeerService {
  private static readonly hosts = new Map<
    string,
    {
      ready: Promise<{ private: string; cert: string }>
      devices: Device[]
      write: Promise<void>
      services: Set<PeerService>
    }
  >()
  private host!: {
    ready: Promise<{ private: string; cert: string }>
    devices: Device[]
    write: Promise<void>
    services: Set<PeerService>
  }
  private tls?: https.Server
  private advertisement?: PeerAdvertisement
  private loopback?: http.Server
  private store?: PeerObjectStore
  private invitation?: Invitation
  private fingerprint = ""
  private address = ""
  private localUrl = ""
  private readonly localToken = secret()
  private seeded = false
  private activeSync: Promise<void> | null = null
  private readonly requests = new Set<Promise<void>>()
  private stopping = false
  private readonly directory: string
  private readonly deviceDirectory: string
  constructor(
    private readonly session: SpaceSession,
    userData: string
  ) {
    this.directory = path.join(userData, "peer-sync", session.canonical.id)
    this.deviceDirectory = path.join(userData, "peer-sync", "device")
  }
  async start(): Promise<PeerStatus> {
    if (this.tls) return this.invite()
    this.stopping = false
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    let host = PeerService.hosts.get(this.deviceDirectory)
    if (!host) {
      const state = {
        ready: Promise.resolve({ private: "", cert: "" }),
        devices: [] as Device[],
        write: Promise.resolve(),
        services: new Set<PeerService>(),
      }
      state.ready = this.loadDeviceIdentity().then(async (identity) => {
        try {
          state.devices = JSON.parse(
            await fs.readFile(
              path.join(this.deviceDirectory, "devices.json"),
              "utf8"
            )
          )
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        return identity
      })
      PeerService.hosts.set(this.deviceDirectory, state)
      host = state
    }
    this.host = host
    const identity = await host.ready
    this.fingerprint = new X509Certificate(identity.cert).fingerprint256
      .replaceAll(":", "")
      .toLowerCase()
    this.seeded = await fs.stat(path.join(this.directory, "seeded")).then(
      () => true,
      () => false
    )
    this.store = new PeerObjectStore(this.directory)
    return this.startServers(identity)
  }
  private async loadDeviceIdentity() {
    await fs.mkdir(this.deviceDirectory, { recursive: true, mode: 0o700 })
    const identityPath = path.join(this.deviceDirectory, "identity.json")
    let identity: { private: string; cert: string }
    try {
      identity = JSON.parse(await fs.readFile(identityPath, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      identity = await generate(
        [{ name: "commonName", value: "Eidos device sync" }],
        { keySize: 2048, algorithm: "sha256" }
      )
      await fs.writeFile(
        identityPath,
        JSON.stringify({ private: identity.private, cert: identity.cert }),
        { mode: 0o600, flag: "wx" }
      )
    }
    return identity
  }
  private async startServers(identity: {
    private: string
    cert: string
  }): Promise<PeerStatus> {
    const handle = (
      request: http.IncomingMessage,
      response: http.ServerResponse
    ) => {
      const task = this.handle(request, response)
        .catch(() => {
          if (response.destroyed) return
          if (!response.headersSent)
            response.writeHead(500, { "Content-Type": "application/json" })
          response.end(
            JSON.stringify({
              error: "Device sync request failed; local files are unchanged",
            })
          )
        })
        .finally(() => this.requests.delete(task))
      this.requests.add(task)
    }
    this.loopback = http.createServer(handle)
    await new Promise<void>((resolve, reject) => {
      this.loopback!.once("error", reject)
      this.loopback!.listen(0, "127.0.0.1", resolve)
    })
    this.localUrl = `graft+http://127.0.0.1:${(this.loopback.address() as AddressInfo).port}/peer/space`
    this.tls = https.createServer(
      { key: identity.private, cert: identity.cert, minVersion: "TLSv1.2" },
      handle
    )
    const portFile = path.join(this.directory, "port")
    const port = await fs.readFile(portFile, "utf8").then(
      (value) => Number(value),
      () => 0
    )
    await new Promise<void>((resolve, reject) => {
      this.tls!.once("error", reject)
      this.tls!.listen(port, "0.0.0.0", resolve)
    })
    await fs.writeFile(
      portFile,
      String((this.tls.address() as AddressInfo).port),
      { mode: 0o600 }
    )
    const ip = Object.values(networkInterfaces())
      .flat()
      .find(
        (entry) => entry && entry.family === "IPv4" && !entry.internal
      )?.address
    if (!ip) {
      await this.close()
      throw new Error("Connect this computer to a local network first")
    }
    this.address = `https://${ip}:${(this.tls.address() as AddressInfo).port}`
    this.host.services.add(this)
    this.advertisement = new PeerAdvertisement(
      (this.tls.address() as AddressInfo).port,
      this.fingerprint,
      this.session.canonical.id
    )
    this.advertisement.start()
    return this.invite()
  }
  async invite(): Promise<PeerStatus> {
    this.invitation = { ticket: secret(), expires: Date.now() + 5 * 60_000 }
    const value =
      "eidos-peer:" +
      Buffer.from(
        JSON.stringify({
          version: 1,
          url: this.address,
          fingerprint: this.fingerprint,
          ticket: this.invitation.ticket,
          space: this.session.canonical.id,
          name: hostname(),
        })
      ).toString("base64url")
    return {
      ...this.status(),
      invitation: value,
      qr: await QRCode.toDataURL(value, { width: 280, margin: 2 }),
    }
  }
  status(): PeerStatus {
    return {
      running: Boolean(this.tls),
      pending:
        this.invitation &&
        this.invitation.expires > Date.now() &&
        !this.invitation.token
          ? this.invitation.name
          : undefined,
      devices: (this.host?.devices ?? []).map(({ id, name }) => ({ id, name })),
    }
  }
  async approve(allow: boolean) {
    const invitation = this.invitation
    if (
      !invitation?.name ||
      invitation.expires < Date.now() ||
      invitation.token
    )
      throw new Error("Pairing request expired")
    if (!allow) {
      this.invitation = undefined
      return this.status()
    }
    invitation.token = secret()
    invitation.deviceId = randomUUID()
    this.host.devices.push({
      id: invitation.deviceId,
      name: invitation.name,
      tokenHash: digest(invitation.token),
    })
    await this.saveDevices()
    return this.status()
  }
  async revoke(id: string) {
    this.host.devices = this.host.devices.filter((device) => device.id !== id)
    for (const service of this.host.services)
      if (service.invitation?.deviceId === id) service.invitation = undefined
    await this.saveDevices()
    return this.status()
  }
  private async saveDevices() {
    const task = this.host.write.then(async () => {
      const file = path.join(this.deviceDirectory, "devices.json")
      await fs.writeFile(file + ".tmp", JSON.stringify(this.host.devices), {
        mode: 0o600,
      })
      await fs.rename(file + ".tmp", file)
    })
    this.host.write = task.catch(() => {})
    await task
  }
  private synchronize() {
    if (!this.activeSync) {
      const task = this.session
        .syncPeerRemote(this.localUrl, this.localToken, this.seeded)
        .then(async () => {
          await fs.writeFile(path.join(this.directory, "seeded"), "1", {
            mode: 0o600,
          })
          this.seeded = true
        })
      this.activeSync = task.finally(() => {
        this.activeSync = null
      })
    }
    return this.activeSync
  }
  private async handle(
    incoming: http.IncomingMessage,
    response: http.ServerResponse
  ) {
    const url = new URL(incoming.url ?? "/", "https://peer.invalid")
    const bearer = incoming.headers.authorization?.replace(/^Bearer /, "") ?? ""
    const local =
      incoming.socket.localAddress === "127.0.0.1" && bearer === this.localToken
    const authorized =
      local ||
      this.host.devices.some((device) => device.tokenHash === digest(bearer))
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      response.end(JSON.stringify(value))
    }
    if (this.stopping && !local)
      return json(503, { error: "Device sync is stopping" })
    if (url.pathname === "/pair" && incoming.method === "POST") {
      const invitation = this.invitation
      if (
        !invitation ||
        invitation.expires < Date.now() ||
        bearer !== invitation.ticket
      )
        return json(403, { error: "Pairing code expired" })
      if (invitation.token) {
        this.invitation = undefined
        return json(200, {
          state: "approved",
          token: invitation.token,
          deviceId: invitation.deviceId,
        })
      }
      let body = ""
      for await (const chunk of incoming) {
        body += chunk
        if (body.length > 4096) return json(413, { error: "Request too large" })
      }
      const name = (JSON.parse(body) as { name?: unknown }).name
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        return json(400, { error: "Invalid device name" })
      if (invitation.name && invitation.name !== name)
        return json(409, { error: "Another device is pairing" })
      invitation.name = name
      return json(202, { state: "pending" })
    }
    if (!authorized) return json(401, { error: "Device is not authorized" })
    if (url.pathname === "/spaces" && incoming.method === "POST") {
      return json(200, {
        spaces: [...this.host.services]
          .filter((service) => !service.stopping)
          .map((service) => ({
            id: service.session.canonical.id,
            name: path.basename(service.session.canonical.root),
            url: `https://${incoming.socket.localAddress?.replace(/^::ffff:/, "") || new URL(service.address).hostname}:${(service.tls!.address() as AddressInfo).port}`,
          })),
      })
    }
    if (url.pathname === "/sync" && incoming.method === "POST") {
      try {
        await this.synchronize()
        return json(200, { state: "ready" })
      } catch (error) {
        return json(409, {
          error:
            error instanceof Error
              ? error.message
              : "Device histories require review",
        })
      }
    }
    const parts = url.pathname.split("/").slice(1).map(decodeURIComponent)
    if (parts[0] !== "peer" || parts[1] !== "space")
      return json(404, { error: "Not found" })
    const handler = createGraftRemoteHandler({
      backend: () => this.store!,
      limits: { maxRequestBytes: 256 * 1024 * 1024 },
    })
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      ...(!["GET", "HEAD"].includes(incoming.method ?? "GET")
        ? { body: Readable.toWeb(incoming), duplex: "half" }
        : {}),
    } as RequestInit)
    const result = await handler({
      request,
      route: {
        namespace: "peer",
        repository: "space",
        operation: parts[2],
        objectPath: parts.slice(3).join("/") || undefined,
      },
      adapterContext: undefined,
    })
    response.writeHead(result.status, Object.fromEntries(result.headers))
    if (result.body)
      await pipeline(
        Readable.fromWeb(result.body as unknown as ReadableStream<Uint8Array>),
        response
      )
    else response.end()
  }
  async close() {
    this.stopping = true
    this.advertisement?.close()
    this.advertisement = undefined
    this.host?.services.delete(this)
    this.invitation = undefined
    // Let accepted repository operations finish before closing their object store.
    await this.activeSync?.catch(() => {})
    for (const server of [this.tls, this.loopback])
      if (server) {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    this.tls = undefined
    this.loopback = undefined
    await Promise.allSettled([...this.requests])
    this.store?.close()
    this.store = undefined
  }
}
