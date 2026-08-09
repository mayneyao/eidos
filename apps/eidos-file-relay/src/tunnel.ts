import { DurableObject } from "cloudflare:workers"

import { RelayHttpError } from "./auth"
import {
  base64ToBytes,
  bytesToBase64,
  connectorMessage,
  forwardedRequestHeaders,
  forwardedResponseHeaders,
  RELAY_CONCURRENT_REQUESTS_MAX,
  RELAY_PROTOCOL_VERSION,
  RELAY_REQUEST_BYTES_MAX,
  type RelayCancelMessage,
  type RelayRequestMessage,
} from "./protocol"

const CONNECTOR_TICKET_TTL_MS = 5 * 60_000
const BROWSER_SESSION_TTL_SECONDS = 12 * 60 * 60
const BROWSER_SESSIONS_MAX = 64
const BROWSER_AUTH_ATTEMPT_TTL_MS = 5 * 60_000
const BROWSER_AUTH_ATTEMPTS_MAX = 16
const BROWSER_GRANT_TTL_MS = 60_000
const BROWSER_GRANTS_MAX = 16
const RESPONSE_START_TIMEOUT_MS = 30_000
const SESSION_COOKIE = "__Host-eidos_relay_session"

type BrowserAccess = "account" | "share"

interface TunnelStateRow {
  [key: string]: SqlStorageValue
  owner_user_id: string
  generation: string
  connector_hash: string | null
  connector_expires_at: number
  access_hash: string
  browser_access: string
}

interface SessionRow {
  [key: string]: SqlStorageValue
  token_hash: string
}

interface BrowserAuthAttemptRow {
  [key: string]: SqlStorageValue
  verifier: string
  expires_at: number
}

interface BrowserGrantRow {
  [key: string]: SqlStorageValue
  ticket_hash: string
}

interface ConnectorAttachment {
  role: "connector"
  generation: string
}

interface PendingRequest {
  resolveStart(response: Response): void
  controller: ReadableStreamDefaultController<Uint8Array>
  stream: ReadableStream<Uint8Array>
  bodyAllowed: boolean
  started: boolean
  timeout: ReturnType<typeof setTimeout>
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  })
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")
}

async function tokenHash(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  )
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function hexBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/u.test(value)) return null
  const bytes = new Uint8Array(32)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function validToken(
  value: string,
  expectedHash: string
): Promise<boolean> {
  const actual = hexBytes(await tokenHash(value))
  const expected = hexBytes(expectedHash)
  const subtle = crypto.subtle
  const timingSafeEqual =
    "timingSafeEqual" in subtle && typeof subtle.timingSafeEqual === "function"
      ? subtle.timingSafeEqual.bind(subtle)
      : null
  return (
    actual !== null &&
    expected !== null &&
    timingSafeEqual !== null &&
    timingSafeEqual(actual, expected)
  )
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization")
  if (!value?.startsWith("Bearer ")) return null
  const token = value.slice("Bearer ".length)
  return token.length > 0 && token.length <= 8 * 1024 ? token : null
}

function cookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const member of header.split(";")) {
    const separator = member.indexOf("=")
    if (separator === -1) continue
    if (member.slice(0, separator).trim() === name) {
      return member.slice(separator + 1).trim()
    }
  }
  return null
}

function sessionCookie(session: string): string {
  return (
    `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; ` +
    `SameSite=Strict; Max-Age=${BROWSER_SESSION_TTL_SECONDS}`
  )
}

function browserAccess(state: TunnelStateRow): BrowserAccess {
  return state.browser_access === "account" ? "account" : "share"
}

function trustedBrowserRequest(
  request: Request,
  publicOrigin: string
): boolean {
  const origin = request.headers.get("origin")
  return origin === null || origin === publicOrigin
}

async function boundedBody(request: Request): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > RELAY_REQUEST_BYTES_MAX
  ) {
    throw new RelayHttpError(
      413,
      "request_too_large",
      "Relay requests are limited to 4 MiB in this preview"
    )
  }
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > RELAY_REQUEST_BYTES_MAX) {
      await reader.cancel()
      throw new RelayHttpError(
        413,
        "request_too_large",
        "Relay requests are limited to 4 MiB in this preview"
      )
    }
    chunks.push(value)
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function attachment(webSocket: WebSocket): ConnectorAttachment | null {
  const value = webSocket.deserializeAttachment()
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).role !== "connector" ||
    typeof (value as Record<string, unknown>).generation !== "string"
  ) {
    return null
  }
  return value as ConnectorAttachment
}

export class TunnelDurableObject extends DurableObject<Env> {
  private readonly pending = new Map<string, PendingRequest>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS tunnel_state (" +
        "singleton INTEGER PRIMARY KEY CHECK (singleton = 1)," +
        "owner_user_id TEXT NOT NULL," +
        "generation TEXT NOT NULL," +
        "connector_hash TEXT," +
        "connector_expires_at INTEGER NOT NULL," +
        "access_hash TEXT NOT NULL," +
        "browser_access TEXT NOT NULL DEFAULT 'share'," +
        "updated_at INTEGER NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS browser_sessions (" +
        "token_hash TEXT PRIMARY KEY," +
        "expires_at INTEGER NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS browser_auth_attempts (" +
        "state_hash TEXT PRIMARY KEY," +
        "verifier TEXT NOT NULL," +
        "expires_at INTEGER NOT NULL," +
        "created_at INTEGER NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS browser_grants (" +
        "ticket_hash TEXT PRIMARY KEY," +
        "expires_at INTEGER NOT NULL," +
        "created_at INTEGER NOT NULL)"
    )
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(tunnel_state)")
      .toArray()
    if (!columns.some((column) => column.name === "browser_access")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE tunnel_state ADD COLUMN " +
          "browser_access TEXT NOT NULL DEFAULT 'share'"
      )
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/_control/claim" && request.method === "POST") {
      return await this.claim(request)
    }
    if (
      url.pathname === "/_control/browser-auth/start" &&
      request.method === "POST"
    ) {
      return await this.startBrowserAuth(request)
    }
    if (
      url.pathname === "/_control/browser-auth/consume" &&
      request.method === "POST"
    ) {
      return await this.consumeBrowserAuth(request)
    }
    if (
      url.pathname === "/_control/browser-auth/complete" &&
      request.method === "POST"
    ) {
      return await this.completeBrowserAuth(request)
    }
    if (url.pathname === "/_connector") {
      return await this.connectWebSocket(request)
    }
    if (url.pathname === "/_proxy") return await this.proxy(request)
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  }

  private async claim(request: Request): Promise<Response> {
    const value = (await request.json()) as unknown
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return json({ error: { code: "invalid_request" } }, 400)
    }
    const body = value as Record<string, unknown>
    if (
      typeof body.userId !== "string" ||
      body.userId.length === 0 ||
      body.userId.length > 256 ||
      typeof body.slug !== "string" ||
      !/^u-[0-9a-f]{20}$/u.test(body.slug) ||
      (body.browserAccess !== "account" && body.browserAccess !== "share")
    ) {
      return json({ error: { code: "invalid_request" } }, 400)
    }
    this.ensureSchema()
    const connectorToken = randomToken()
    const accessToken = randomToken()
    const generation = crypto.randomUUID()
    const now = Date.now()
    const connectorExpiresAt = now + CONNECTOR_TICKET_TTL_MS
    const existing = this.state()
    if (existing && existing.owner_user_id !== body.userId) {
      return json({ error: { code: "forbidden" } }, 403)
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO tunnel_state(" +
        "singleton, owner_user_id, generation, connector_hash, " +
        "connector_expires_at, access_hash, browser_access, updated_at" +
        ") VALUES (1, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(singleton) DO UPDATE SET " +
        "owner_user_id=excluded.owner_user_id, " +
        "generation=excluded.generation, " +
        "connector_hash=excluded.connector_hash, " +
        "connector_expires_at=excluded.connector_expires_at, " +
        "access_hash=excluded.access_hash, " +
        "browser_access=excluded.browser_access, " +
        "updated_at=excluded.updated_at",
      body.userId,
      generation,
      await tokenHash(connectorToken),
      connectorExpiresAt,
      await tokenHash(accessToken),
      body.browserAccess,
      now
    )
    this.ctx.storage.sql.exec("DELETE FROM browser_sessions")
    this.ctx.storage.sql.exec("DELETE FROM browser_auth_attempts")
    this.ctx.storage.sql.exec("DELETE FROM browser_grants")
    for (const webSocket of this.ctx.getWebSockets("connector")) {
      webSocket.close(4001, "A newer Eidos Relay session took over")
    }
    this.failPending("The Eidos Relay connector was replaced")

    const control = new URL(this.env.CONTROL_ORIGIN)
    control.protocol = "wss:"
    control.pathname = `/v1/connect/${body.slug}`
    const publicUrl = new URL(
      `https://${body.slug}${this.env.PUBLIC_HOST_LABEL_SUFFIX}.${this.env.PUBLIC_HOST_SUFFIX}/`
    )
    if (body.browserAccess === "share") {
      publicUrl.hash = `access=${accessToken}`
    }
    return json({
      protocol: RELAY_PROTOCOL_VERSION,
      browserAccess: body.browserAccess,
      publicUrl: publicUrl.toString(),
      connectorUrl: control.toString(),
      connectorToken,
      connectorExpiresAt,
    })
  }

  private async startBrowserAuth(request: Request): Promise<Response> {
    const value = (await request.json()) as unknown
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return json({ error: { code: "invalid_request" } }, 400)
    }
    const body = value as Record<string, unknown>
    if (
      typeof body.state !== "string" ||
      !/^u-[0-9a-f]{20}\.[A-Za-z0-9_-]{43}$/u.test(body.state) ||
      typeof body.verifier !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(body.verifier)
    ) {
      return json({ error: { code: "invalid_request" } }, 400)
    }
    this.ensureSchema()
    const state = this.state()
    if (!state) {
      return json({ error: { code: "not_found", message: "Not found" } }, 404)
    }
    if (browserAccess(state) !== "account") {
      return json(
        {
          error: {
            code: "pairing_required",
            message: "This Relay uses a shared access link",
          },
        },
        409
      )
    }
    const now = Date.now()
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_auth_attempts WHERE expires_at < ?",
      now
    )
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_auth_attempts WHERE state_hash IN (" +
        "SELECT state_hash FROM browser_auth_attempts ORDER BY created_at DESC " +
        "LIMIT -1 OFFSET ?)",
      BROWSER_AUTH_ATTEMPTS_MAX - 1
    )
    this.ctx.storage.sql.exec(
      "INSERT INTO browser_auth_attempts(" +
        "state_hash, verifier, expires_at, created_at" +
        ") VALUES (?, ?, ?, ?)",
      await tokenHash(body.state),
      body.verifier,
      now + BROWSER_AUTH_ATTEMPT_TTL_MS,
      now
    )
    return json({ ok: true })
  }

  private async consumeBrowserAuth(request: Request): Promise<Response> {
    const value = (await request.json()) as unknown
    const stateValue =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>).state
        : null
    if (
      typeof stateValue !== "string" ||
      !/^u-[0-9a-f]{20}\.[A-Za-z0-9_-]{43}$/u.test(stateValue)
    ) {
      return json({ error: { code: "invalid_request" } }, 400)
    }
    this.ensureSchema()
    const stateHash = await tokenHash(stateValue)
    const attempt = this.ctx.storage.sql
      .exec<BrowserAuthAttemptRow>(
        "SELECT verifier, expires_at FROM browser_auth_attempts " +
          "WHERE state_hash=?",
        stateHash
      )
      .toArray()[0]
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_auth_attempts WHERE state_hash=?",
      stateHash
    )
    if (!attempt || attempt.expires_at < Date.now()) {
      return json(
        {
          error: {
            code: "oauth_expired",
            message: "This Eidos sign-in attempt expired",
          },
        },
        400
      )
    }
    return json({ verifier: attempt.verifier })
  }

  private async completeBrowserAuth(request: Request): Promise<Response> {
    const value = (await request.json()) as unknown
    const userId =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>).userId
        : null
    if (
      typeof userId !== "string" ||
      userId.length === 0 ||
      userId.length > 256 ||
      /[\u0000-\u001f\u007f]/u.test(userId)
    ) {
      return json({ error: { code: "invalid_request" } }, 400)
    }
    this.ensureSchema()
    const state = this.state()
    if (!state) {
      return json({ error: { code: "not_found", message: "Not found" } }, 404)
    }
    if (browserAccess(state) !== "account") {
      return json({ error: { code: "access_mode_changed" } }, 409)
    }
    if (state.owner_user_id !== userId) {
      return json(
        {
          error: {
            code: "wrong_account",
            message: "This Relay belongs to another Eidos account",
          },
        },
        403
      )
    }
    const ticket = randomToken()
    const now = Date.now()
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_grants WHERE expires_at < ?",
      now
    )
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_grants WHERE ticket_hash IN (" +
        "SELECT ticket_hash FROM browser_grants ORDER BY created_at DESC " +
        "LIMIT -1 OFFSET ?)",
      BROWSER_GRANTS_MAX - 1
    )
    this.ctx.storage.sql.exec(
      "INSERT INTO browser_grants(ticket_hash, expires_at, created_at) " +
        "VALUES (?, ?, ?)",
      await tokenHash(ticket),
      now + BROWSER_GRANT_TTL_MS,
      now
    )
    return json({ ticket })
  }

  private async connectWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: { code: "upgrade_required" } }, 426)
    }
    const state = this.state()
    const token = bearer(request)
    if (
      !state ||
      !state.connector_hash ||
      state.connector_expires_at < Date.now() ||
      token === null ||
      !(await validToken(token, state.connector_hash))
    ) {
      return json({ error: { code: "unauthorized" } }, 401, {
        "WWW-Authenticate": "Bearer",
      })
    }
    this.ctx.storage.sql.exec(
      "UPDATE tunnel_state SET connector_hash=NULL, connector_expires_at=0 " +
        "WHERE singleton=1"
    )
    for (const webSocket of this.ctx.getWebSockets("connector")) {
      webSocket.close(4001, "A newer Eidos Relay connector took over")
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server, ["connector"])
    server.serializeAttachment({
      role: "connector",
      generation: state.generation,
    } satisfies ConnectorAttachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  private async proxy(request: Request): Promise<Response> {
    const publicOrigin = request.headers.get("x-eidos-relay-public-origin")
    const target = request.headers.get("x-eidos-relay-target")
    if (
      publicOrigin === null ||
      target === null ||
      !target.startsWith("/") ||
      target.length > 8 * 1024 ||
      !trustedBrowserRequest(request, publicOrigin)
    ) {
      return json(
        {
          error: {
            code: "forbidden",
            message: "Relay requests require the served Host and Origin",
          },
        },
        403
      )
    }
    const state = this.state()
    if (!state) {
      return json({ error: { code: "not_found", message: "Not found" } }, 404)
    }
    const targetPath = target.split("?", 1)[0] ?? "/"
    if (targetPath === "/_eidos/auth/callback" && request.method === "GET") {
      return await this.redeemBrowserGrant(target)
    }
    const session = cookie(request, SESSION_COOKIE)
    const hasSession = session !== null && (await this.hasSession(session))
    if (
      browserAccess(state) === "account" &&
      targetPath === "/" &&
      request.method === "GET" &&
      !hasSession
    ) {
      const location = new URL(
        "/v1/browser-auth/start",
        this.env.CONTROL_ORIGIN
      )
      location.searchParams.set("return_to", publicOrigin)
      return new Response(null, {
        status: 302,
        headers: {
          "Cache-Control": "private, no-store",
          Location: location.toString(),
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
    if (targetPath === "/api/session" && request.method === "POST") {
      if (browserAccess(state) !== "share") {
        return json({ error: { code: "not_found", message: "Not found" } }, 404)
      }
      return await this.pair(request)
    }
    if (targetPath.startsWith("/api/") && !hasSession) {
      return json(
        {
          error: {
            code: "unauthorized",
            message:
              browserAccess(state) === "account"
                ? "Sign in with the Eidos account that started this Relay"
                : "Open the Eidos Relay access link to pair this browser",
          },
        },
        401
      )
    }
    try {
      return await this.forward(request, target)
    } catch (error) {
      if (error instanceof RelayHttpError) {
        return json(
          { error: { code: error.code, message: error.message } },
          error.status
        )
      }
      throw error
    }
  }

  private async pair(request: Request): Promise<Response> {
    const state = this.state()
    const token = bearer(request)
    if (
      !state ||
      token === null ||
      !(await validToken(token, state.access_hash))
    ) {
      return json(
        {
          error: {
            code: "unauthorized",
            message: "The Eidos Relay access key is invalid",
          },
        },
        401
      )
    }
    const session = await this.createBrowserSession()
    return json({ ok: true }, 200, {
      "Set-Cookie": sessionCookie(session),
    })
  }

  private async redeemBrowserGrant(target: string): Promise<Response> {
    const callback = new URL(target, "https://relay.invalid")
    const ticket = callback.searchParams.get("ticket")
    if (
      callback.pathname !== "/_eidos/auth/callback" ||
      callback.searchParams.size !== 1 ||
      ticket === null ||
      ticket.length === 0 ||
      ticket.length > 512
    ) {
      return json(
        {
          error: { code: "invalid_request", message: "Invalid sign-in ticket" },
        },
        400
      )
    }
    this.ensureSchema()
    const ticketHash = await tokenHash(ticket)
    const grant = this.ctx.storage.sql
      .exec<BrowserGrantRow>(
        "SELECT ticket_hash FROM browser_grants " +
          "WHERE ticket_hash=? AND expires_at>=?",
        ticketHash,
        Date.now()
      )
      .toArray()[0]
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_grants WHERE ticket_hash=?",
      ticketHash
    )
    if (grant?.ticket_hash !== ticketHash) {
      return json(
        {
          error: {
            code: "oauth_expired",
            message: "This Eidos sign-in ticket expired",
          },
        },
        401
      )
    }
    const session = await this.createBrowserSession()
    return new Response(null, {
      status: 303,
      headers: {
        "Cache-Control": "private, no-store",
        Location: "/",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": sessionCookie(session),
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

  private async createBrowserSession(): Promise<string> {
    const session = randomToken()
    const expiresAt = Date.now() + BROWSER_SESSION_TTL_SECONDS * 1000
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_sessions WHERE expires_at < ?",
      Date.now()
    )
    this.ctx.storage.sql.exec(
      "DELETE FROM browser_sessions WHERE token_hash IN (" +
        "SELECT token_hash FROM browser_sessions ORDER BY rowid DESC " +
        "LIMIT -1 OFFSET ?)",
      BROWSER_SESSIONS_MAX - 1
    )
    this.ctx.storage.sql.exec(
      "INSERT INTO browser_sessions(token_hash, expires_at) VALUES (?, ?)",
      await tokenHash(session),
      expiresAt
    )
    return session
  }

  private async hasSession(session: string): Promise<boolean> {
    if (session.length === 0 || session.length > 512) return false
    const hash = await tokenHash(session)
    const row = this.ctx.storage.sql
      .exec<SessionRow>(
        "SELECT token_hash FROM browser_sessions " +
          "WHERE token_hash=? AND expires_at>=?",
        hash,
        Date.now()
      )
      .toArray()[0]
    return row?.token_hash === hash
  }

  private async forward(request: Request, target: string): Promise<Response> {
    if (this.pending.size >= RELAY_CONCURRENT_REQUESTS_MAX) {
      return json(
        {
          error: {
            code: "busy",
            message: "This Eidos Relay endpoint is busy",
          },
        },
        503
      )
    }
    const connector = this.connector()
    if (!connector) {
      return json(
        {
          error: {
            code: "offline",
            message: "The Eidos CLI serving this file is offline",
          },
        },
        503,
        { "Retry-After": "2" }
      )
    }
    const body = await boundedBody(request)
    const id = crypto.randomUUID()
    const streamState: {
      controller?: ReadableStreamDefaultController<Uint8Array>
    } = {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamState.controller = controller
      },
      cancel: () => {
        const message: RelayCancelMessage = {
          v: RELAY_PROTOCOL_VERSION,
          type: "request.cancel",
          id,
        }
        try {
          connector.send(JSON.stringify(message))
        } catch {
          // The connector has already closed.
        }
        this.deletePending(id)
      },
    })
    const controller = streamState.controller
    if (!controller) {
      return json({ error: { code: "stream_unavailable" } }, 500)
    }
    const response = new Promise<Response>((resolveStart) => {
      const timeout = setTimeout(() => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        if (pending.started) {
          pending.controller.error(new Error("Relay origin timed out"))
        } else {
          pending.resolveStart(
            json(
              {
                error: {
                  code: "origin_timeout",
                  message: "The Eidos CLI did not answer in time",
                },
              },
              504
            )
          )
        }
      }, RESPONSE_START_TIMEOUT_MS)
      this.pending.set(id, {
        resolveStart,
        controller,
        stream,
        bodyAllowed: request.method !== "HEAD",
        started: false,
        timeout,
      })
    })
    const message: RelayRequestMessage = {
      v: RELAY_PROTOCOL_VERSION,
      type: "request",
      id,
      method: request.method,
      path: target,
      headers: forwardedRequestHeaders(request.headers),
      ...(body.byteLength > 0 ? { body: bytesToBase64(body) } : {}),
    }
    try {
      connector.send(JSON.stringify(message))
    } catch {
      this.deletePending(id)
      return json(
        {
          error: {
            code: "offline",
            message: "The Eidos CLI serving this file disconnected",
          },
        },
        503
      )
    }
    return await response
  }

  override async webSocketMessage(
    webSocket: WebSocket,
    rawMessage: ArrayBuffer | string
  ): Promise<void> {
    if (!attachment(webSocket) || typeof rawMessage !== "string") {
      webSocket.close(1003, "Invalid Eidos Relay message")
      return
    }
    let decoded: unknown
    try {
      decoded = JSON.parse(rawMessage) as unknown
    } catch {
      webSocket.close(1003, "Invalid Eidos Relay JSON")
      return
    }
    const message = connectorMessage(decoded)
    if (!message) {
      webSocket.close(1003, "Invalid Eidos Relay message")
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    if (message.type === "response.start") {
      if (pending.started) {
        this.failRequest(message.id, "Duplicate Relay response")
        return
      }
      pending.started = true
      clearTimeout(pending.timeout)
      pending.resolveStart(
        new Response(
          pending.bodyAllowed && !statusHasNoBody(message.status)
            ? pending.stream
            : null,
          {
            status: message.status,
            headers: forwardedResponseHeaders(message.headers),
          }
        )
      )
      pending.resolveStart = () => undefined
      return
    }
    if (!pending.started) {
      this.failRequest(message.id, "Relay response body arrived before headers")
      return
    }
    if (message.type === "response.body") {
      if (!pending.bodyAllowed) return
      const bytes = base64ToBytes(message.body)
      if (!bytes) {
        this.failRequest(message.id, "Relay response chunk is invalid")
        return
      }
      pending.controller.enqueue(bytes)
      return
    }
    if (message.type === "response.end") {
      pending.controller.close()
      this.deletePending(message.id)
      return
    }
    this.failRequest(message.id, "The Eidos CLI could not serve this request")
  }

  override async webSocketClose(
    webSocket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    if (attachment(webSocket)) {
      this.failPending("The Eidos Relay connector disconnected")
    }
  }

  override async webSocketError(
    webSocket: WebSocket,
    _error: unknown
  ): Promise<void> {
    if (attachment(webSocket)) {
      this.failPending("The Eidos Relay connector failed")
    }
  }

  private state(): TunnelStateRow | null {
    const table = this.ctx.storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master " +
          "WHERE type='table' AND name='tunnel_state'"
      )
      .toArray()[0]
    if (!table) return null
    return (
      this.ctx.storage.sql
        .exec<TunnelStateRow>(
          "SELECT owner_user_id, generation, connector_hash, " +
            "connector_expires_at, access_hash, browser_access " +
            "FROM tunnel_state WHERE singleton=1"
        )
        .toArray()[0] ?? null
    )
  }

  private connector(): WebSocket | null {
    const state = this.state()
    if (!state) return null
    return (
      this.ctx
        .getWebSockets("connector")
        .find(
          (webSocket) =>
            attachment(webSocket)?.generation === state.generation &&
            webSocket.readyState === WebSocket.OPEN
        ) ?? null
    )
  }

  private deletePending(id: string): void {
    const pending = this.pending.get(id)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(id)
  }

  private failRequest(id: string, message: string): void {
    const pending = this.pending.get(id)
    if (!pending) return
    if (pending.started) {
      pending.controller.error(new Error(message))
    } else {
      pending.resolveStart(
        json({ error: { code: "origin_error", message } }, 502)
      )
    }
    this.deletePending(id)
  }

  private failPending(message: string): void {
    for (const id of [...this.pending.keys()]) this.failRequest(id, message)
  }
}

function statusHasNoBody(status: number): boolean {
  return status === 204 || status === 205 || status === 304
}
