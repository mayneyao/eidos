import { WebSocketServer, WebSocket } from "ws"
import { createServer, type Server as HttpServer } from "node:http"

interface PendingRequest {
  toolCallId: string
  sessionId: string
  toolName: string
  cacheKey: string
  input: any
  resolve: (result: { approved: boolean; reason?: string }) => void
  reject: (err: Error) => void
}

export interface PermissionDecision {
  toolCallId: string
  approved: boolean
  rememberInSession: boolean
  reason?: string
}

export interface PermissionRequestMsg {
  type: "permission-request"
  toolCallId: string
  toolName: string
  cacheKey: string
  args: any
}

export interface PermissionStore {
  getPermissions(sessionId: string): Promise<Record<string, boolean>>
  setPermission(
    sessionId: string,
    toolName: string,
    allowed: boolean
  ): Promise<void>
}

export class PermissionServer {
  private wss: WebSocketServer
  private pending = new Map<string, PendingRequest>()
  private sessionPermissions = new Map<string, Map<string, boolean>>()
  private sessionClients = new Map<string, Set<WebSocket>>()
  private store: PermissionStore | null = null
  private server: HttpServer

  constructor(store?: PermissionStore) {
    this.store = store ?? null
    this.server = createServer()
    this.wss = new WebSocketServer({ server: this.server })
    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req)
    })
    this.server.listen(0)
  }

  getPort(): number {
    const addr = this.server.address()
    if (typeof addr === "object" && addr) return addr.port
    return 0
  }

  stop(): void {
    this.wss.close()
    this.server.close()
  }

  setStore(store: PermissionStore): void {
    this.store = store
  }

  async requestPermission(params: {
    sessionId: string
    toolName: string
    toolCallId: string
    input: any
    cacheKey?: string
  }): Promise<{ approved: boolean; reason?: string }> {
    const { sessionId, toolName, toolCallId, input, cacheKey } = params
    const key = cacheKey ?? toolName

    const sessionPerms = this.sessionPermissions.get(sessionId)
    const saved = sessionPerms?.get(key)
    if (saved !== undefined) {
      return { approved: saved }
    }

    const request: PermissionRequestMsg = {
      type: "permission-request",
      toolCallId,
      toolName,
      cacheKey: key,
      args: input,
    }

    const clients = this.sessionClients.get(sessionId)
    if (clients && clients.size > 0) {
      const msg = JSON.stringify(request)
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg)
        }
      }
    }

    return new Promise((resolve, reject) => {
      this.pending.set(toolCallId, {
        toolCallId,
        sessionId,
        toolName,
        cacheKey: key,
        input,
        resolve,
        reject,
      })
    })
  }

  handleDecision(decision: PermissionDecision): void {
    const pending = this.pending.get(decision.toolCallId)
    if (!pending) return
    const key = pending.cacheKey

    if (decision.rememberInSession && decision.approved) {
      let sessionPerms = this.sessionPermissions.get(pending.sessionId)
      if (!sessionPerms) {
        sessionPerms = new Map()
        this.sessionPermissions.set(pending.sessionId, sessionPerms)
      }
      sessionPerms.set(key, true)

      if (this.store) {
        this.store
          .setPermission(pending.sessionId, key, true)
          .catch((err) =>
            console.error("[permission-server] persist error:", err)
          )
      }
    }

    if (decision.rememberInSession && !decision.approved) {
      let sessionPerms = this.sessionPermissions.get(pending.sessionId)
      if (!sessionPerms) {
        sessionPerms = new Map()
        this.sessionPermissions.set(pending.sessionId, sessionPerms)
      }
      sessionPerms.set(key, false)

      if (this.store) {
        this.store
          .setPermission(pending.sessionId, key, false)
          .catch((err) =>
            console.error("[permission-server] persist error:", err)
          )
      }
    }

    this.pending.delete(decision.toolCallId)
    pending.resolve({
      approved: decision.approved,
      reason: decision.reason,
    })
  }

  setSessionPermissions(
    sessionId: string,
    permissions: Record<string, boolean>
  ): void {
    const perms = new Map(Object.entries(permissions))
    this.sessionPermissions.set(sessionId, perms)
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const url = new URL(req.url ?? "/", "http://localhost")
    let sessionId = url.searchParams.get("sessionId")
    if (!sessionId) {
      ws.close(4000, "sessionId required")
      return
    }

    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set())
    }
    this.sessionClients.get(sessionId)!.add(ws)

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        if (msg.type === "decision") {
          this.handleDecision(msg)
        } else if (msg.type === "set-permissions") {
          this.setSessionPermissions(sessionId, msg.permissions)
        }
      } catch (err) {
        console.error("[permission-server] bad message", err)
      }
    })

    ws.on("close", () => {
      const clients = this.sessionClients.get(sessionId)
      if (clients) {
        clients.delete(ws)
        if (clients.size === 0) {
          this.sessionClients.delete(sessionId)
        }
      }
    })

    ws.on("error", () => {
      const clients = this.sessionClients.get(sessionId)
      if (clients) {
        clients.delete(ws)
      }
    })
  }
}
