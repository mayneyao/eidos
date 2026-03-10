import fs from "fs"
import path from "path"
import Database from "@eidos.space/better-sqlite3"
import WebSocket from "ws"

const RELAY_API_BASE = "https://api.eidos.space/v1/relay/channels"
const RELAY_WS_BASE = "wss://api.eidos.space/v1/relay"

// Fallback polling interval when WebSocket is unavailable (5 minutes)
const FALLBACK_POLL_INTERVAL_MS = 5 * 60 * 1000
// Reconnect delay after WS disconnects
const WS_RECONNECT_DELAY_MS = 5000
// Ping interval to keep the connection alive (30 seconds)
const WS_PING_INTERVAL_MS = 30 * 1000
// Max channels per WebSocket connection (server limit)
const MAX_CHANNELS_PER_WS = 10

interface RelayMessage {
  id: string
  body: any
  content_type: string
  timestamp_ms: number
  attempts: number
  metadata?: any
  channelId: string
}

export class RelayClient {
  private spacePath: string
  private channelIds: Set<string>
  private tokenProvider: () => Promise<string | null>
  private onNewMessages?: (channelId: string, count: number) => void
  private db: Database.Database
  private pullingChannels = new Set<string>()

  // WebSocket state (unified subscription)
  private ws: WebSocket | null = null
  private wsConnected = false
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private wsPingTimer: ReturnType<typeof setInterval> | null = null
  private stopped = false

  // Fallback polling timer (only when WS is down)
  private fallbackPollTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    spacePath: string,
    channelIds: string[],
    tokenProvider: () => Promise<string | null>,
    onNewMessages?: (channelId: string, count: number) => void
  ) {
    this.spacePath = spacePath
    // Ensure channelIds is an array (defensive: handle string input gracefully)
    const ids = Array.isArray(channelIds) ? channelIds : [channelIds]
    this.channelIds = new Set(ids.filter((id) => id && typeof id === "string"))
    this.tokenProvider = tokenProvider
    this.onNewMessages = onNewMessages

    const eidosDir = path.join(this.spacePath, ".eidos")
    if (!fs.existsSync(eidosDir)) {
      fs.mkdirSync(eidosDir, { recursive: true })
    }

    const dbPath = path.join(eidosDir, "inbox.sqlite3")
    this.db = new Database(dbPath)
    this.initDatabase()
  }

  // ─── Channel Management ───────────────────────────────────────────────────

  public addChannel(channelId: string) {
    if (!channelId || typeof channelId !== "string") return
    if (this.channelIds.has(channelId)) return

    this.channelIds.add(channelId)
    console.log(`[RelayClient] Added channel: ${channelId}`)

    // Reconnect WebSocket to include new channel
    if (this.wsConnected && this.channelIds.size <= MAX_CHANNELS_PER_WS) {
      this.reconnectWebSocket().catch(console.error)
    }
  }

  public removeChannel(channelId: string) {
    if (!this.channelIds.has(channelId)) return

    this.channelIds.delete(channelId)
    console.log(`[RelayClient] Removed channel: ${channelId}`)

    // Reconnect WebSocket if we still have channels
    if (this.channelIds.size > 0 && this.wsConnected) {
      this.reconnectWebSocket().catch(console.error)
    } else if (this.channelIds.size === 0) {
      this.stop()
    }
  }

  public getChannels(): string[] {
    return Array.from(this.channelIds)
  }

  // ─── Database ─────────────────────────────────────────────────────────────

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT,
        body TEXT NOT NULL,
        content_type TEXT DEFAULT 'json',
        timestamp_ms INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        processed INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `)
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  public start() {
    if (this.stopped) {
      this.stopped = false
    }

    if (this.channelIds.size === 0) {
      console.log("[RelayClient] No channels to monitor, skipping start")
      return
    }

    console.log(
      `[RelayClient] Starting with ${this.channelIds.size} channel(s)`
    )

    // Initial pull for all channels, then connect WebSocket
    this.pullAllChannels()
      .then(async () => {
        await this.connectWebSocket()
      })
      .catch(console.error)
  }

  public stop() {
    this.stopped = true
    this.clearReconnectTimer()
    this.clearPingTimer()
    this.clearFallbackPoll()
    this.closeWebSocket()
    try {
      this.db.close()
    } catch (e) {
      console.error("[RelayClient] Error closing db:", e)
    }
    console.log("[RelayClient] Stopped")
  }

  private async pullAllChannels() {
    const channels = Array.from(this.channelIds)
    console.log(`[RelayClient] Initial pull for ${channels.length} channel(s)`)

    for (const channelId of channels) {
      try {
        await this.pullMessages(channelId)
      } catch (error) {
        console.error(`[RelayClient] Failed to pull messages for channel ${channelId}:`, error)
        // Continue with other channels even if one fails
      }
    }
  }

  // ─── Unified WebSocket Subscription ───────────────────────────────────────

  private async connectWebSocket() {
    if (this.stopped || this.channelIds.size === 0) return

    const channels = Array.from(this.channelIds).slice(0, MAX_CHANNELS_PER_WS)
    const token = await this.tokenProvider()
    if (!token) {
      console.error("[RelayClient] No token available for WebSocket connection")
      this.startFallbackPoll()
      this.scheduleReconnect()
      return
    }

    const wsUrl = `${RELAY_WS_BASE}/subscribe?channels=${channels.join(",")}`

    console.log(`[RelayClient] Channels to subscribe:`, channels)
    console.log(`[RelayClient] Using token: ${token.substring(0, 20)}...`)
    console.log(`[RelayClient] Connecting WebSocket: ${wsUrl}`)

    try {
      this.ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (e) {
      console.error("[RelayClient] Failed to construct WebSocket:", e)
      this.startFallbackPoll()
      this.scheduleReconnect()
      return
    }

    this.ws.on("open", () => {
      console.log(`[RelayClient] WebSocket connected`)
      this.wsConnected = true
      this.clearFallbackPoll()
      this.startPingTimer()
    })

    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString())
        console.log("[RelayClient] WebSocket message:", msg)

        if (msg.type === "subscribed") {
          console.log(`[RelayClient] Subscribed to channels:`, msg.channels)
        } else if (msg.type === "new_message") {
          const channelId = msg.channelId
          console.log(`[RelayClient] 🔔 New message in channel: ${channelId}`)
          this.pullMessages(channelId).catch(console.error)
        }
      } catch (e) {
        console.error("[RelayClient] Error parsing WebSocket message:", e)
      }
    })

    this.ws.on("error", (err: Error) => {
      console.error("[RelayClient] WebSocket error:", err.message)
    })

    this.ws.on("close", (code: number, reason: Buffer) => {
      console.log(`[RelayClient] WebSocket closed (code=${code})`)
      this.wsConnected = false
      this.ws = null
      this.clearPingTimer()
      if (!this.stopped) {
        this.startFallbackPoll()
        this.scheduleReconnect()
      }
    })
  }

  private async reconnectWebSocket() {
    console.log("[RelayClient] Reconnecting WebSocket with updated channels...")
    this.closeWebSocket()
    await this.connectWebSocket()
  }

  private closeWebSocket() {
    if (this.ws) {
      try {
        this.ws.close()
      } catch (_) {}
      this.ws = null
      this.wsConnected = false
    }
    this.clearPingTimer()
  }

  private scheduleReconnect() {
    this.clearReconnectTimer()
    if (this.stopped) return

    console.log(
      `[RelayClient] Reconnecting in ${WS_RECONNECT_DELAY_MS / 1000}s...`
    )
    this.wsReconnectTimer = setTimeout(async () => {
      this.wsReconnectTimer = null
      await this.connectWebSocket()
    }, WS_RECONNECT_DELAY_MS)
  }

  private clearReconnectTimer() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
  }

  private startPingTimer() {
    this.clearPingTimer()
    this.wsPingTimer = setInterval(() => {
      if (this.ws && this.wsConnected) {
        try {
          this.ws.ping()
        } catch (e) {
          console.error("[RelayClient] Failed to send ping:", e)
        }
      }
    }, WS_PING_INTERVAL_MS)
  }

  private clearPingTimer() {
    if (this.wsPingTimer) {
      clearInterval(this.wsPingTimer)
      this.wsPingTimer = null
    }
  }

  // ─── Fallback Polling ─────────────────────────────────────────────────────

  private startFallbackPoll() {
    if (this.fallbackPollTimer) return
    console.log(
      `[RelayClient] Starting fallback poll every ${FALLBACK_POLL_INTERVAL_MS / 60000}min`
    )

    this.fallbackPollTimer = setInterval(() => {
      if (!this.wsConnected) {
        console.log("[RelayClient] Fallback poll triggered")
        this.pullAllChannels()
      } else {
        this.clearFallbackPoll()
      }
    }, FALLBACK_POLL_INTERVAL_MS)
  }

  private clearFallbackPoll() {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer)
      this.fallbackPollTimer = null
    }
  }

  // ─── Pull / ACK ───────────────────────────────────────────────────────────

  public async pullMessages(channelId: string) {
    if (this.pullingChannels.has(channelId)) {
      console.log(
        `[RelayClient] Pull already in progress for ${channelId}, skipping`
      )
      return
    }

    this.pullingChannels.add(channelId)
    console.log(`[RelayClient] Pulling messages for channel: ${channelId}`)

    try {
      const token = await this.tokenProvider()
      if (!token) {
        console.error("[RelayClient] No token available")
        return
      }

      const pullUrl = `${RELAY_API_BASE}/${channelId}/messages/pull`
      const pullRes = await fetch(pullUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batch_size: 50, visibility_timeout_ms: 30000 }),
      })

      if (!pullRes.ok) {
        console.error(
          `[RelayClient] Pull failed for ${channelId}:`,
          pullRes.status
        )
        return
      }

      const data = await pullRes.json()

      if (!data.success || !data.result?.messages) {
        return
      }

      const messages: any[] = data.result.messages
      if (messages.length === 0) {
        return
      }

      console.log(
        `[RelayClient] Pulled ${messages.length} message(s) from ${channelId}`
      )

      const leaseIds: string[] = []
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO messages (id, channel_id, body, timestamp_ms, attempts, metadata, content_type)
        VALUES (@id, @channel_id, @body, @timestamp_ms, @attempts, @metadata, @content_type)
      `)

      this.db.transaction(() => {
        for (const msg of messages) {
          insertStmt.run({
            id: msg.id,
            channel_id: channelId,
            body:
              typeof msg.body === "string"
                ? msg.body
                : JSON.stringify(msg.body),
            timestamp_ms: msg.timestamp_ms,
            attempts: 0, // Reset attempts to 0 for local processing
            metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
            content_type: msg.content_type || "json",
          })
          leaseIds.push(msg.lease_id)
        }
      })()

      // ACK messages
      const ackRes = await fetch(
        `${RELAY_API_BASE}/${channelId}/messages/ack`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lease_ids: leaseIds }),
        }
      )

      if (ackRes.ok) {
        console.log(
          `[RelayClient] ACK success for ${leaseIds.length} message(s) from ${channelId}`
        )
        if (this.onNewMessages) {
          this.onNewMessages(channelId, leaseIds.length)
        }
      } else {
        console.error(
          `[RelayClient] ACK failed for ${channelId}:`,
          ackRes.status
        )
      }
    } catch (e) {
      console.error(`[RelayClient] Error pulling from ${channelId}:`, e)
    } finally {
      this.pullingChannels.delete(channelId)
    }
  }

  // ─── Query Methods ────────────────────────────────────────────────────────

  public getMessages(channelId?: string, limit = 100): RelayMessage[] {
    const query = channelId
      ? this.db.prepare(`
          SELECT id, channel_id, body, content_type, timestamp_ms, attempts, metadata 
          FROM messages 
          WHERE channel_id = @channelId 
          ORDER BY timestamp_ms DESC 
          LIMIT @limit
        `)
      : this.db.prepare(`
          SELECT id, channel_id, body, content_type, timestamp_ms, attempts, metadata 
          FROM messages 
          ORDER BY timestamp_ms DESC 
          LIMIT @limit
        `)
    
    const rows = query.all(channelId ? { channelId, limit } : { limit }) as any[]
    return rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      body: this.parseBody(row.body, row.content_type),
      content_type: row.content_type || "json",
      timestamp_ms: row.timestamp_ms,
      attempts: row.attempts,
      metadata: this.tryParseJson(row.metadata),
    }))
  }

  private parseBody(body: string, contentType: string): any {
    if (typeof body !== "string") return body
    
    // Parse based on content type
    switch (contentType) {
      case "text":
        return body
      case "json":
      default:
        try {
          return JSON.parse(body)
        } catch {
          // If JSON parse fails, return as-is
          return body
        }
    }
  }

  private tryParseJson(val: any): any {
    if (typeof val !== "string") return val
    try {
      return JSON.parse(val)
    } catch {
      return val
    }
  }

  public markAsProcessed(messageId: string) {
    this.db
      .prepare("UPDATE messages SET processed = 1 WHERE id = @id")
      .run({ id: messageId })
  }
}
