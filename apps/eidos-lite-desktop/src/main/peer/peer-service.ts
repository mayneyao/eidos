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
import { Readable, Transform } from "node:stream"
import { PeerTransferTracker } from "./peer-transfer"
import type { PeerTransferDetail } from "../../shared/contracts"
import { pipeline } from "node:stream/promises"
import { createRequire } from "node:module"
import QRCode from "qrcode"
import {
  createGraftRemoteHandler,
  GraftProtocolError,
} from "@eidos.space/graft-remote"
import { PeerObjectStore } from "./object-store"
import { PeerAdvertisement } from "./peer-discovery"
import type { SpaceSession } from "../space/space-session"
import type * as Selfsigned from "selfsigned"
import type { AddressInfo } from "node:net"
import { TransformStream, type ReadableStream } from "node:stream/web"

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const secret = () => randomBytes(32).toString("base64url")
const { generate } = createRequire(import.meta.url)(
  "selfsigned"
) as typeof Selfsigned
type Device = {
  id: string
  name: string
  tokenHash: string
  lastSeenAt?: number
}
type Invitation = {
  id: string
  ticket: string
  expires: number
  name?: string
  token?: string
  deviceId?: string
  rejected?: boolean
}
export type PeerPairingRequest = { id: string; name: string; expires: number }
export type PeerStatus = {
  transfers?: PeerTransferDetail[]
  running: boolean
  invitation?: string
  qr?: string
  pending?: string
  devices: { id: string; name: string; lastSeenAt?: number }[]
  deviceName?: string
  error?: string
  activity?: {
    device?: string
    state: "syncing" | "completed" | "review" | "failed"
    updatedAt: number
  }
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
  private incomingStores = new Map<string, PeerObjectStore>()
  private invitation?: Invitation
  private fingerprint = ""
  private address = ""
  private localUrl = ""
  private readonly localToken = secret()
  private activity: PeerStatus["activity"]
  private readonly transfers = new Map<string, number>()
  private readonly transferDetails = new PeerTransferTracker()
  private seeded = false
  private remote = ""
  // Versioned export cache repairs older caches seeded with unrelated tracking refs.
  private get exportDirectory() {
    return path.join(this.directory, "export-v2")
  }
  private activeSync: Promise<void> | null = null
  private readonly requests = new Set<Promise<void>>()
  private stopping = false
  private readonly directory: string
  private readonly deviceDirectory: string
  constructor(
    private readonly session: SpaceSession | null,
    userData: string,
    private readonly pairingChanged: (
      request: PeerPairingRequest | null
    ) => void = () => {},
    // Main-process copy follows the Settings language; keys are the English source strings.
    private readonly translate: (message: string) => string = (message) =>
      message
  ) {
    this.directory = path.join(
      userData,
      "peer-sync",
      session?.canonical.id ?? "gateway"
    )
    this.deviceDirectory = path.join(userData, "peer-sync", "device")
  }
  ownsSession(session: SpaceSession): boolean {
    return this.session === session
  }
  async start(pair = true): Promise<PeerStatus> {
    if (this.session?.isClosed)
      throw new Error(
        this.translate("Reopen this Space, then turn on LAN sync.")
      )
    if (this.tls) return pair ? this.invite() : this.status()
    this.stopping = false
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const identity = await this.initializeHost()
    this.fingerprint = new X509Certificate(identity.cert).fingerprint256
      .replaceAll(":", "")
      .toLowerCase()
    await fs.mkdir(this.exportDirectory, { recursive: true, mode: 0o700 })
    const identityFile = path.join(this.exportDirectory, "remote-id")
    let remoteId: string
    try {
      remoteId = await fs.readFile(identityFile, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      remoteId = randomUUID()
      await fs.writeFile(identityFile, remoteId, { mode: 0o600, flag: "wx" })
    }
    this.remote = `eidos-peer-${remoteId}`
    this.seeded = await fs.stat(path.join(this.exportDirectory, "seeded")).then(
      () => true,
      () => false
    )
    this.store = new PeerObjectStore(this.exportDirectory)
    const status = await this.startServers(identity)
    return pair ? this.invite() : status
  }
  private async initializeHost() {
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
    return host.ready
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
      this.session?.canonical.id ?? "device"
    )
    this.advertisement.start()
    return this.status()
  }
  async invite(): Promise<PeerStatus> {
    this.pairingChanged(null)
    this.invitation = {
      id: randomUUID(),
      ticket: secret(),
      expires: Date.now() + 5 * 60_000,
    }
    const value =
      "eidos-peer:" +
      Buffer.from(
        JSON.stringify({
          version: 1,
          url: this.address,
          fingerprint: this.fingerprint,
          ticket: this.invitation.ticket,
          space: this.session?.canonical.id ?? "device",
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
      transfers: this.transferDetails.snapshot(),
      running: Boolean(this.tls),
      deviceName: hostname(),
      activity: this.transfers.size
        ? {
            device: [...this.transfers.keys()].join("、"),
            state: "syncing",
            updatedAt: Date.now(),
          }
        : this.activity,
      pending:
        this.invitation &&
        this.invitation.expires > Date.now() &&
        !this.invitation.token &&
        !this.invitation.rejected
          ? this.invitation.name
          : undefined,
      devices: (this.host?.devices ?? []).map(({ id, name, lastSeenAt }) => ({
        id,
        name,
        lastSeenAt,
      })),
    }
  }
  async knownStatus(): Promise<PeerStatus> {
    if (this.host) return this.status()
    try {
      const devices: Device[] = JSON.parse(
        await fs.readFile(
          path.join(this.deviceDirectory, "devices.json"),
          "utf8"
        )
      )
      return {
        ...this.status(),
        devices: devices.map(({ id, name, lastSeenAt }) => ({
          id,
          name,
          lastSeenAt,
        })),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      return this.status()
    }
  }
  async approve(allow: boolean, requestId?: string) {
    const invitation = this.invitation
    if (
      !invitation?.name ||
      invitation.expires <= Date.now() ||
      invitation.token ||
      invitation.rejected ||
      (requestId !== undefined && invitation.id !== requestId)
    )
      throw new Error("Pairing request expired")
    if (!allow) {
      invitation.rejected = true
      this.pairingChanged(null)
      return this.status()
    }
    invitation.token = secret()
    invitation.deviceId = randomUUID()
    this.pairingChanged(null)
    this.host.devices.push({
      id: invitation.deviceId,
      name: invitation.name,
      tokenHash: digest(invitation.token),
    })
    await this.saveDevices()
    return this.status()
  }
  async revoke(id: string) {
    await this.initializeHost()
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
  private incomingStore(id: string) {
    let store = this.incomingStores.get(id)
    if (!store) {
      store = new PeerObjectStore(
        path.join(this.directory, "incoming", id),
        this.store
      )
      this.incomingStores.set(id, store)
    }
    return store
  }
  private synchronize(deviceId?: string) {
    // Do not coalesce requests from different devices: each incoming head
    // must be fetched and reviewed. SpaceSession serializes repository work.
    const session = this.session
    if (!session) throw new Error("Device gateway has no Space")
    const task = (this.activeSync ?? Promise.resolve())
      .catch(() => {})
      .then(() =>
        session.syncPeerRemote(
          this.localUrl,
          this.localToken,
          deviceId ? true : this.seeded,
          deviceId
            ? this.localUrl.replace("/peer/space", `/incoming/${deviceId}`)
            : undefined,
          this.remote,
          deviceId ? `${this.remote}-${deviceId}` : this.remote
        )
      )
      .then(async () => {
        await fs.writeFile(path.join(this.exportDirectory, "seeded"), "1", {
          mode: 0o600,
        })
        this.seeded = true
      })
    const active = task.finally(() => {
      if (this.activeSync === active) this.activeSync = null
    })
    this.activeSync = active
    return this.activeSync
  }
  private async handle(
    incoming: http.IncomingMessage,
    response: http.ServerResponse
  ) {
    // Compatibility for the currently published Graft SDK, whose repository
    // executor can leave pooled connections idle between synchronous calls.
    // Remove this relay policy when adopting Graft's continuously driven IO pool.
    const url = new URL(incoming.url ?? "/", "https://peer.invalid")
    // Keep artifact pooling so small files do not each require a TLS handshake.
    if (
      ((incoming.method === "GET" || incoming.method === "HEAD") &&
        !url.pathname.includes("/raw/store/files/")) ||
      url.pathname.endsWith("/read-bundle")
    )
      response.setHeader("Connection", "close")
    const bearer = incoming.headers.authorization?.replace(/^Bearer /, "") ?? ""
    const local =
      incoming.socket.localAddress === "127.0.0.1" && bearer === this.localToken
    const device = this.host.devices.find(
      (device) => device.tokenHash === digest(bearer)
    )
    const authorized = local || Boolean(device)
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      response.end(JSON.stringify(value))
    }
    if (this.stopping && !local)
      return json(503, { error: "Device sync is stopping" })
    if (url.pathname === "/pair/cancel" && incoming.method === "POST") {
      if (!this.invitation || bearer !== this.invitation.ticket)
        return json(403, { error: "Pairing code expired" })
      // A cancelled wait must not revoke an already accepted device.
      if (!this.invitation.token) {
        this.invitation = undefined
        this.pairingChanged(null)
      }
      return json(200, { state: "cancelled" })
    }
    if (url.pathname === "/pair" && incoming.method === "POST") {
      const invitation = this.invitation
      if (
        !invitation ||
        invitation.expires < Date.now() ||
        bearer !== invitation.ticket
      )
        return json(403, { error: "Pairing code expired" })
      if (invitation.rejected) return json(200, { state: "rejected" })
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
      if (this.invitation !== invitation || invitation.expires <= Date.now())
        return json(403, { error: "Pairing code expired" })
      if (invitation.rejected) return json(200, { state: "rejected" })
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        return json(400, { error: "Invalid device name" })
      if (invitation.name && invitation.name !== name)
        return json(409, { error: "Another device is pairing" })
      if (!invitation.name) {
        invitation.name = name
        this.pairingChanged({
          id: invitation.id,
          name,
          expires: invitation.expires,
        })
      }
      return json(202, { state: "pending" })
    }
    if (!authorized) return json(401, { error: "Device is not authorized" })
    const transfer =
      device && this.session && !local && url.pathname !== "/spaces"
        ? this.transferDetails.begin(
            device.id,
            device.name,
            url.pathname === "/sync"
              ? "merging"
              : url.pathname.startsWith("/peer/incoming")
                ? "receiving"
                : "sending"
          )
        : undefined
    if (transfer) {
      const finish = () =>
        transfer.finish(
          !response.writableFinished
            ? "Connection closed before transfer finished"
            : response.statusCode >= 400
              ? `HTTP ${response.statusCode}`
              : undefined
        )
      response.once("finish", finish)
      response.once("close", finish)
    }
    if (device) device.lastSeenAt = Date.now()
    if (device && this.session && url.pathname !== "/spaces") {
      const name = device.name
      this.transfers.set(name, (this.transfers.get(name) ?? 0) + 1)
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        const count = (this.transfers.get(name) ?? 1) - 1
        if (count) this.transfers.set(name, count)
        else this.transfers.delete(name)
        if (
          this.activity?.state !== "review" &&
          this.activity?.state !== "failed"
        )
          this.activity = {
            device: name,
            state:
              response.writableFinished && response.statusCode < 400
                ? "completed"
                : "failed",
            updatedAt: Date.now(),
          }
      }
      response.once("finish", finish)
      response.once("close", finish)
    }
    if (url.pathname === "/spaces" && incoming.method === "POST") {
      return json(200, {
        spaces: [...this.host.services]
          .filter(
            (service) =>
              !service.stopping && service.session && !service.session.isClosed
          )
          .map((service) => ({
            id: service.session!.canonical.id,
            name: path.basename(service.session!.canonical.root),
            url: `https://${incoming.socket.localAddress?.replace(/^::ffff:/, "") || new URL(service.address).hostname}:${(service.tls!.address() as AddressInfo).port}`,
          })),
      })
    }
    if (url.pathname === "/sync" && incoming.method === "POST") {
      if (!this.session || this.session.isClosed)
        return json(409, {
          // Phone hosts match this substring to show their own localized copy.
          error: "Space is closed. Open it and turn on device sync.",
        })
      try {
        let body = ""
        for await (const chunk of incoming) {
          transfer?.received(Buffer.byteLength(chunk))
          body += chunk
          if (body.length > 4096)
            return json(413, { error: "Request too large" })
        }
        const publish = body
          ? (JSON.parse(body) as { incoming?: unknown }).incoming === true
          : false
        if (publish && !device)
          return json(400, { error: "A paired device is required" })
        if (
          this.seeded &&
          (await this.session.getSyncMergeStatus()).state === "merging"
        ) {
          this.activity = {
            device: device?.name,
            state: "review",
            updatedAt: Date.now(),
          }
          return json(200, { state: "needs_review", protocol: 2 })
        }
        this.activity = {
          device: device?.name,
          state: "syncing",
          updatedAt: Date.now(),
        }
        await this.synchronize(publish ? device!.id : undefined)
        this.activity = {
          ...this.activity,
          state: "completed",
          updatedAt: Date.now(),
        }
        return json(200, { state: "ready", protocol: 2 })
      } catch (error) {
        transfer?.fail(
          error instanceof Error
            ? error.message
            : "Device histories require review"
        )
        this.activity = {
          device: device?.name,
          state: "failed",
          updatedAt: Date.now(),
        }
        if (
          (await this.session.getSyncMergeStatus().catch(() => undefined))
            ?.state === "merging"
        ) {
          this.activity = {
            device: device?.name,
            state: "review",
            updatedAt: Date.now(),
          }
          return json(200, { state: "needs_review", protocol: 2 })
        }
        return json(409, {
          error:
            error instanceof Error
              ? error.message
              : "Device histories require review",
        })
      }
    }
    if (!this.session)
      return json(404, { error: "Choose an offered Space first" })
    const parts = url.pathname.split("/").slice(1).map(decodeURIComponent)
    let backend = this.store!
    if (parts[0] === "peer" && parts[1] === "incoming" && device) {
      backend = this.incomingStore(device.id)
    } else if (
      parts[0] === "incoming" &&
      local &&
      this.host.devices.some((entry) => entry.id === parts[1])
    ) {
      backend = this.incomingStore(parts[1])
    } else if (parts[0] !== "peer" || parts[1] !== "space")
      return json(404, { error: "Not found" })
    const handler = createGraftRemoteHandler({
      authorize: ({ action }) => {
        if (action === "write" && !local && backend === this.store)
          throw new GraftProtocolError(
            403,
            "reviewed_history_read_only",
            "Reviewed history is read-only; publish to the device incoming remote"
          )
      },
      backend: () => backend,
      limits: { maxRequestBytes: 256 * 1024 * 1024 },
    })
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      ...(!["GET", "HEAD"].includes(incoming.method ?? "GET")
        ? {
            body: Readable.toWeb(incoming).pipeThrough(
              new TransformStream({
                transform(chunk: Uint8Array, controller) {
                  transfer?.received(chunk.byteLength)
                  controller.enqueue(chunk)
                },
              })
            ),
            duplex: "half",
          }
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
    // A rejected streaming upload can leave unread bytes in the request. Do
    // not let its client reuse that connection for the verification GET.
    // Preserve pooling for successful uploads and ordinary file reads.
    if (
      result.status >= 400 &&
      !["GET", "HEAD"].includes(incoming.method ?? "GET")
    )
      response.setHeader("Connection", "close")
    response.writeHead(result.status, Object.fromEntries(result.headers))
    if (result.body)
      await pipeline(
        Readable.fromWeb(result.body as unknown as ReadableStream<Uint8Array>),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            transfer?.sent(chunk.byteLength)
            callback(null, chunk)
          },
        }),
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
    this.pairingChanged(null)
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
    for (const store of this.incomingStores.values()) store.close()
    this.incomingStores.clear()
  }
}
