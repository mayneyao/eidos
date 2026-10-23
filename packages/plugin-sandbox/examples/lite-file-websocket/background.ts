const endpoint = "ws://127.0.0.1:8787/echo"
let socket: WebSocket | undefined
let connecting: Promise<WebSocket> | undefined
let sequence = 0
let connections = 0
let connectedAt = 0
let sentOnConnection = 0
const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const pending = new Map<
  number,
  { resolve: (text: string) => void; reject: (error: Error) => void }
>()

function connect(): Promise<WebSocket> {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket)
  if (connecting) return connecting
  const ws = new WebSocket(endpoint)
  socket = ws
  connecting = new Promise<WebSocket>((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer)
      if (socket !== ws) return
      socket = undefined
      reject(new Error("Connection closed. Click Send to reconnect."))
      for (const item of pending.values())
        item.reject(new Error("Connection lost"))
      pending.clear()
    }
    const timer = setTimeout(() => {
      fail()
      ws.close()
    }, 8000)
    ws.onopen = () => {
      clearTimeout(timer)
      connections++
      connectedAt = Date.now()
      sentOnConnection = 0
      resolve(ws)
    }
    ws.onerror = fail
    ws.onclose = fail
    ws.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          id: number
          text: string
        }
        if (typeof message.text === "string")
          pending.get(message.id)?.resolve(message.text)
      } catch {
        /* Ignore non-protocol server messages. */
      }
    }
  }).finally(() => {
    connecting = undefined
  })
  return connecting
}

async function send(text: string) {
  // Bound allocation before connecting; the host also caps concurrent RPCs.
  if (text.length > 16000)
    throw new Error("Use a sample of at most 16,000 characters")
  const ws = await connect()
  if (pending.size >= 32) throw new Error("Too many pending requests")
  const id = ++sequence
  const connection = `${run}/${connections}`
  const establishedAt = connectedAt
  const messageNumber = ++sentOnConnection
  const started = Date.now()
  const echoed = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error("Echo timed out"))
    }, 8000)
    const finish = () => {
      clearTimeout(timer)
      pending.delete(id)
    }
    pending.set(id, {
      resolve: (value) => {
        finish()
        resolve(value)
      },
      reject: (error) => {
        finish()
        reject(error)
      },
    })
    try {
      ws.send(JSON.stringify({ id, text }))
    } catch (error) {
      finish()
      reject(error)
    }
  })
  return {
    ok: true,
    text: echoed,
    connection,
    connectedAt: establishedAt,
    messageNumber,
    reused: messageNumber > 1,
    elapsedMs: Date.now() - started,
  }
}

globalThis.onmessage = (event: MessageEvent) => {
  const { requestId, data } = event.data
  void (async () => {
    try {
      if (data?.command !== "send" || typeof data.text !== "string")
        throw new Error("Expected send with text")
      postMessage({ requestId, data: await send(data.text) })
    } catch (error) {
      postMessage({ requestId, data: { ok: false, error: String(error) } })
    }
  })()
}
export {}
