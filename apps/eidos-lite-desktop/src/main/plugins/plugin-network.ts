import { lookup } from "node:dns/promises"
import https from "node:https"
import { PluginError, object } from "@eidos.space/plugin-runtime/rpc"
export function allowedIPv4(address: string): boolean {
  const parts = address.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    return false
  const [a, b] = parts
  // System TUN proxies can resolve public hosts into the 198.18/15 benchmark
  // range. TLS still verifies the declared hostname against the pinned address.
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b! >= 64 && b! <= 127)
  )
}
export async function readPluginNetwork(
  params: unknown,
  origins: readonly string[],
  signal: AbortSignal
) {
  const p = object(params)
  if (
    typeof p.url !== "string" ||
    p.url.length > 2048 ||
    Object.keys(p).some((k) => !["url", "range"].includes(k))
  )
    throw new PluginError("INVALID_REQUEST", "Invalid network request")
  const url = new URL(p.url)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !origins.includes(url.origin)
  )
    throw new PluginError("PERMISSION_DENIED", "Network origin not granted")
  const limit = 4 * 1024 * 1024
  let range: { offset: number; length: number } | undefined
  if (p.range !== undefined) {
    const r = object(p.range)
    if (
      Object.keys(r).sort().join() !== "length,offset" ||
      !Number.isSafeInteger(r.offset) ||
      !Number.isSafeInteger(r.length) ||
      Number(r.offset) < 0 ||
      Number(r.length) < 1 ||
      Number(r.length) > limit ||
      !Number.isSafeInteger(Number(r.offset) + Number(r.length))
    )
      throw new PluginError("INVALID_REQUEST", "Invalid byte range")
    range = { offset: Number(r.offset), length: Number(r.length) }
  }
  signal.throwIfAborted()
  const { address } = await lookup(url.hostname, { family: 4 })
  if (!allowedIPv4(address))
    throw new PluginError(
      "PERMISSION_DENIED",
      "Private network addresses are not permitted"
    )
  signal.throwIfAborted()
  return new Promise<{ data: string; status: number; etag?: string }>(
    (resolve, reject) => {
      const request = https.get(
        url,
        {
          signal,
          // Pin the vetted address; do not resolve again when opening the socket.
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [{ address, family: 4 }])
            else callback(null, address, 4)
          },
          headers: range
            ? {
                Range: `bytes=${range.offset}-${range.offset + range.length - 1}`,
              }
            : {},
        },
        (response) => {
          const status = response.statusCode ?? 0
          if ((status >= 300 && status < 400) || (range && status !== 206)) {
            response.destroy()
            reject(
              new PluginError(
                "IO_ERROR",
                "Download server redirected or did not honor the byte range"
              )
            )
            return
          }
          if (
            range &&
            response.headers["content-range"]?.split("/")[0] !==
              `bytes ${range.offset}-${range.offset + range.length - 1}`
          ) {
            response.destroy()
            reject(new PluginError("IO_ERROR", "Invalid download byte range"))
            return
          }
          const chunks: Buffer[] = []
          let size = 0
          response.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > (range?.length ?? limit)) {
              response.destroy(
                new PluginError(
                  "TOO_LARGE",
                  "Network response exceeds its byte limit"
                )
              )
              return
            }
            chunks.push(chunk)
          })
          response.on("error", reject)
          response.on("end", () => {
            if (range && size !== range.length) {
              reject(new PluginError("IO_ERROR", "Incomplete download range"))
              return
            }
            resolve({
              data: Buffer.concat(chunks).toString("base64"),
              status,
              ...(response.headers.etag ? { etag: response.headers.etag } : {}),
            })
          })
        }
      )
      const timer = setTimeout(
        () =>
          request.destroy(
            new PluginError("TIMEOUT", "Download request timed out")
          ),
        20000
      )
      request.on("close", () => clearTimeout(timer))
      request.on("error", reject)
    }
  )
}
