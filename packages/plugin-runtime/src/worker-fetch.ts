/** Serialized into the guest. The transport is the only network authority. */
export function createWorkerFetch(
  call: <T>(method: string, params: unknown) => Promise<T>,
  lifetime: AbortSignal
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const signal = AbortSignal.any([request.signal, lifetime])
    signal.throwIfAborted()
    const id = crypto.randomUUID()
    const wait = <T>(operation: Promise<T>): Promise<T> =>
      new Promise((resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort)
          reject(signal.reason)
        }
        if (signal.aborted) {
          operation.catch(() => {})
          reject(signal.reason)
          return
        }
        signal.addEventListener("abort", onAbort, { once: true })
        operation
          .then(resolve, reject)
          .finally(() => signal.removeEventListener("abort", onAbort))
      })
    let finished = false
    let controller: ReadableByteStreamController | undefined
    const cleanup = () => {
      finished = true
      signal.removeEventListener("abort", abort)
    }
    const cancel = () => call("network.fetch.cancel", { id }).catch(() => {})
    const abort = () => {
      controller?.error(signal.reason)
      cleanup()
      void cancel()
    }
    signal.addEventListener("abort", abort, { once: true })
    const bytesTo64 = (bytes: Uint8Array) => {
      let result = ""
      for (let i = 0; i < bytes.length; i += 8192)
        result += String.fromCharCode(...bytes.subarray(i, i + 8192))
      return btoa(result)
    }
    try {
      const headers: [string, string][] = []
      request.headers.forEach((value, name) => headers.push([name, value]))
      let bytes: Uint8Array | null = null
      if (request.body) {
        const reader = request.body.getReader(),
          chunks: Uint8Array[] = []
        let size = 0
        const abortUpload = () => {
          void reader.cancel(signal.reason).catch(() => {})
        }
        signal.addEventListener("abort", abortUpload, { once: true })
        try {
          for (;;) {
            const chunk = await wait(reader.read())
            if (chunk.done) break
            if (!(chunk.value instanceof Uint8Array))
              throw new TypeError("Body stream must contain Uint8Array chunks")
            size += chunk.value.length
            if (size > 1024 * 1024)
              throw new TypeError("Request body exceeds 1 MiB")
            chunks.push(chunk.value)
          }
          bytes = new Uint8Array(size)
          let offset = 0
          for (const chunk of chunks) {
            bytes.set(chunk, offset)
            offset += chunk.length
          }
        } catch (error) {
          void reader.cancel(error).catch(() => {})
          throw error
        } finally {
          signal.removeEventListener("abort", abortUpload)
          reader.releaseLock()
        }
      }
      signal.throwIfAborted()
      const opening = call<{
        status: number
        statusText: string
        headers: [string, string][]
        url: string
        redirected: boolean
        body: boolean
        type: ResponseType
      }>("network.fetch", {
        id,
        url: request.url,
        method: request.method,
        headers,
        body: bytes ? bytesTo64(bytes) : null,
        redirect: request.redirect,
      })
      void opening.then(
        () => {
          if (signal.aborted) void cancel()
        },
        () => {}
      )
      const result = await wait(opening)
      signal.throwIfAborted()
      const body = result.body
        ? new ReadableStream(
            {
              type: "bytes",
              start(value) {
                controller = value
              },
              async pull(value) {
                try {
                  const chunk = await call<{ body: string | null }>(
                    "network.fetch.read",
                    { id }
                  )
                  if (finished) return
                  if (chunk.body === null) {
                    cleanup()
                    value.close()
                    value.byobRequest?.respond(0)
                  } else
                    value.enqueue(
                      Uint8Array.from(atob(chunk.body), (c) => c.charCodeAt(0))
                    )
                } catch (error) {
                  cleanup()
                  value.error(error)
                  await cancel()
                }
              },
              async cancel() {
                cleanup()
                await cancel()
              },
            },
            { highWaterMark: 0 }
          )
        : null
      if (!body) cleanup()
      let response =
        result.status === 0 ? Response.error() : new Response(body, result)
      if (request.integrity) {
        const hashes = request.integrity
          .split(/\s+/)
          .map((part) =>
            /^(sha256|sha384|sha512)-([A-Za-z0-9+/_=-]+)(?:\?.*)?$/.exec(part)
          )
          .filter((value): value is RegExpExecArray => !!value)
        if (hashes.length) {
          const algorithm = hashes
            .map((hash) => hash[1]!)
            .sort()
            .at(-1)!
          const data = await response.arrayBuffer()
          const digest = bytesTo64(
            new Uint8Array(
              await crypto.subtle.digest(algorithm.replace("sha", "SHA-"), data)
            )
          )
          if (
            !hashes.some(
              (hash) =>
                hash[1] === algorithm &&
                hash[2]!
                  .replace(/-/g, "+")
                  .replace(/_/g, "/")
                  .replace(/=+$/, "") === digest.replace(/=+$/, "")
            )
          )
            throw new TypeError("Integrity mismatch")
          response = new Response(result.body ? data : null, result)
        }
      }
      const decorate = (value: Response): Response => {
        const clone = value.clone.bind(value)
        const immutableHeaders = new Proxy(value.headers, {
          get(target, key) {
            if (key === "append" || key === "set" || key === "delete")
              return () => {
                throw new TypeError("Headers are immutable")
              }
            const member: unknown = Reflect.get(target, key, target)
            return typeof member === "function" ? member.bind(target) : member
          },
        })
        Object.defineProperties(value, {
          headers: { value: immutableHeaders },
          url: { value: result.url },
          redirected: { value: result.redirected },
          type: { value: result.type },
          clone: { value: () => decorate(clone()) },
        })
        return value
      }
      return decorate(response)
    } catch (error) {
      cleanup()
      await cancel()
      if (signal.aborted) throw signal.reason
      throw new TypeError(
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
