import type { BackgroundHost, FileOpenedEvent } from "@eidos.space/plugin-sdk"

/** Serialized into QuickJS. Keep this function self-contained. */
function install(
  token: string,
  spaceId: string,
  instanceId: string,
  history: boolean,
  storage: boolean
) {
  const send = globalThis.postMessage
  const listeners = new Set<(event: MessageEvent) => void>()
  const opened = new Set<(event: FileOpenedEvent) => void>()
  const pending = new Map<
    number,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
      chunks: string[]
      bytes: number
    }
  >()
  let next = 0
  let handler: ((event: MessageEvent) => void) | null = null
  const call = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (pending.size >= 32)
        return reject(new Error("Too many pending host requests"))
      const id = ++next
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error("Host request timed out"))
      }, 30000)
      pending.set(id, { resolve, reject, timer, chunks: [], bytes: 0 })
      void (async () => {
        const encoded = JSON.stringify(params)
        for (let offset = 0; offset < encoded.length; offset += 32768) {
          if (!pending.has(id)) return
          send({
            __eidosHost: token,
            id,
            method,
            chunk: encoded.slice(offset, offset + 32768),
            done: offset + 32768 >= encoded.length,
          })
          if (offset % 262144 === 229376)
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
        }
      })().catch((error) => {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      })
    })
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const encode = async (bytes: Uint8Array) => {
    const parts: string[] = []
    let segment: string[] = []
    for (let i = 0; i < bytes.length; i += 3) {
      if (i > 0 && i % 3072 === 0) {
        parts.push(segment.join(""))
        segment = []
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      const n =
        (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
      segment.push(
        alphabet[n >>> 18]!,
        alphabet[(n >>> 12) & 63]!,
        i + 1 < bytes.length ? alphabet[(n >>> 6) & 63]! : "=",
        i + 2 < bytes.length ? alphabet[n & 63]! : "="
      )
    }
    parts.push(segment.join(""))
    return parts.join("")
  }
  const decode = async (text: string) => {
    // Start a fresh CPU-budget turn after assembling/parsing a large reply.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const bytes = new Uint8Array(
      (text.length / 4) * 3 -
        (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0)
    )
    let offset = 0
    for (let i = 0; i < text.length; i += 4) {
      if (i > 0 && i % 4096 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      const n =
        (alphabet.indexOf(text[i]!) << 18) |
        (alphabet.indexOf(text[i + 1]!) << 12) |
        (Math.max(0, alphabet.indexOf(text[i + 2]!)) << 6) |
        Math.max(0, alphabet.indexOf(text[i + 3]!))
      for (const shift of [16, 8, 0])
        if (offset < bytes.length) bytes[offset++] = (n >>> shift) & 255
    }
    return bytes
  }
  Object.defineProperty(globalThis, "onmessage", {
    configurable: false,
    get: () => route,
    set: (value) => {
      handler = value
    },
  })
  // Host frames never reach plugin application message handlers.
  globalThis.addEventListener = ((
    type: string,
    listener: (event: MessageEvent) => void
  ) => {
    if (type !== "message" || typeof listener !== "function")
      throw new TypeError("Expected message listener")
    listeners.add(listener)
  }) as typeof globalThis.addEventListener
  globalThis.removeEventListener = ((
    type: string,
    listener: (event: MessageEvent) => void
  ) => {
    if (type === "message") listeners.delete(listener)
  }) as typeof globalThis.removeEventListener
  // The native dispatcher invokes onmessage before listeners; keep it as a router.
  Object.defineProperty(globalThis, "ctx", {
    writable: false,
    configurable: false,
    value: Object.freeze({
      spaceId,
      instanceId,
      events: Object.freeze({
        on(type: string, listener: (event: FileOpenedEvent) => void) {
          if (type !== "file.opened") throw new TypeError("Unknown host event")
          if (typeof listener !== "function")
            throw new TypeError("Expected event listener")
          if (!history) throw new Error("File history permission required")
          // Each subscription owns its disposal, even for the same callback.
          const callback = (event: FileOpenedEvent) => listener(event)
          opened.add(callback)
          return {
            dispose() {
              opened.delete(callback)
            },
          }
        },
      }),
      ...(storage
        ? {
            storage: {
              list: (prefix = "") => call("storage.list", { prefix }),
              async read(key: string) {
                const result = await call("storage.read", { key })
                return result === null ? null : decode(result as string)
              },
              async write(key: string, bytes: Uint8Array) {
                if (
                  !(bytes instanceof Uint8Array) ||
                  bytes.byteLength > 4 * 1024 * 1024
                )
                  throw new TypeError("Expected at most 4 MiB")
                await call("storage.write", { key, data: await encode(bytes) })
              },
              async delete(key: string) {
                await call("storage.delete", { key })
              },
            },
          }
        : {}),
    }) as BackgroundHost,
  })
  // Capture the user property separately from the native onmessage dispatch.
  const route = (event: MessageEvent) => {
    const message = event.data
    if (message?.__eidosHost === token) {
      if (message.event === "file.opened" && history) {
        for (const callback of [...opened]) {
          if (!opened.has(callback)) continue
          try {
            callback(Object.freeze({ ...message.value }))
          } catch (error) {
            console.error(error)
          }
        }
      } else {
        const request = pending.get(message.id)
        if (request) {
          if (typeof message.chunk === "string") {
            request.bytes += message.chunk.length
            if (request.bytes <= 8 * 1024 * 1024) {
              request.chunks.push(message.chunk)
              return
            }
            pending.delete(message.id)
            clearTimeout(request.timer)
            request.reject(new Error("Host response exceeds 8 MiB"))
            return
          }
          pending.delete(message.id)
          clearTimeout(request.timer)
          if (message.error) request.reject(new Error(message.error))
          else if (message.done) {
            try {
              request.resolve(JSON.parse(request.chunks.join("")))
            } catch {
              request.reject(new Error("Invalid host response"))
            }
          } else request.resolve(message.value)
        }
      }
      return
    }
    handler?.(event)
    for (const callback of [...listeners])
      if (listeners.has(callback)) callback(event)
  }
}

export function backgroundHostBootstrap(
  token: string,
  spaceId: string,
  instanceId: string,
  history: boolean,
  storage: boolean
): string {
  return `;(${install.toString()})(${[token, spaceId, instanceId, history, storage].map((value) => JSON.stringify(value)).join(",")});\n`
}
