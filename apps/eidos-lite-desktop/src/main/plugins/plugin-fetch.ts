import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import https from "node:https"
import type { IncomingMessage } from "node:http"
import type { Readable } from "node:stream"
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib"
import { PluginError, object } from "@eidos.space/plugin-runtime/rpc"

const forbidden =
  /^(?:host|connection|content-length|transfer-encoding|upgrade|cookie2?|origin|referer|accept-encoding|expect|trailer|te|via|keep-alive|accept-charset|date|dnt|permissions-policy|set-cookie|proxy-.*|sec-.*)$/i
type Entry = {
  controller: AbortController
  dispose(): void
  reader?: AsyncIterator<Buffer>
  timer?: ReturnType<typeof setTimeout>
  reading: boolean
}

/** Fetch resources belong to the caller scope, never to a guest-supplied plugin ID. */
export class PluginFetch {
  private readonly scopes = new WeakMap<AbortSignal, Map<string, Entry>>()

  async request(
    method: string,
    params: unknown,
    origins: readonly string[],
    signal: AbortSignal
  ): Promise<unknown> {
    signal.throwIfAborted()
    const p = object(params)
    if (typeof p.id !== "string" || !/^[\w-]{1,128}$/.test(p.id))
      throw new PluginError("INVALID_REQUEST", "Invalid fetch ID")
    let entries = this.scopes.get(signal)
    if (!entries) {
      entries = new Map()
      this.scopes.set(signal, entries)
    }
    const id = p.id
    if (method === "network.fetch.cancel") {
      entries.get(id)?.dispose()
      return null
    }
    if (method === "network.fetch.read") {
      const entry = entries.get(id)
      if (!entry?.reader || entry.reading)
        throw new PluginError(
          "INVALID_REQUEST",
          "Fetch closed or read already pending"
        )
      entry.reading = true
      clearTimeout(entry.timer)
      entry.timer = setTimeout(entry.dispose, 30000)
      try {
        const next = await entry.reader.next()
        if (next.done) {
          entry.dispose()
          return { body: null }
        }
        clearTimeout(entry.timer)
        entry.timer = setTimeout(entry.dispose, 30000)
        return { body: Buffer.from(next.value).toString("base64") }
      } catch (error) {
        entry.dispose()
        throw error
      } finally {
        entry.reading = false
      }
    }
    if (method !== "network.fetch" || entries.has(id) || entries.size >= 16)
      throw new PluginError(
        "INVALID_REQUEST",
        "Fetch resource limit or duplicate ID"
      )
    const controller = new AbortController()
    const entry: Entry = {
      controller,
      reading: false,
      dispose: () => {
        clearTimeout(entry.timer)
        signal.removeEventListener("abort", entry.dispose)
        controller.abort()
        entries.delete(id)
      },
    }
    entries.set(id, entry)
    signal.addEventListener("abort", entry.dispose, { once: true })
    entry.timer = setTimeout(entry.dispose, 30000)
    try {
      if (
        typeof p.url !== "string" ||
        p.url.length > 8192 ||
        typeof p.method !== "string" ||
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(p.method) ||
        /^(CONNECT|TRACE|TRACK)$/i.test(p.method) ||
        !Array.isArray(p.headers) ||
        p.headers.length > 128 ||
        !["follow", "manual", "error"].includes(String(p.redirect))
      )
        throw new PluginError("INVALID_REQUEST", "Invalid fetch request")
      let url = new URL(p.url)
      let verb = p.method
      if (
        p.body !== null &&
        (typeof p.body !== "string" ||
          p.body.length > 1398104 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            p.body
          ))
      )
        throw new PluginError("INVALID_REQUEST", "Invalid fetch body encoding")
      let body =
        p.body === null
          ? null
          : typeof p.body === "string"
            ? Buffer.from(p.body, "base64")
            : undefined
      if (
        body === undefined ||
        (body && body.length > 1024 * 1024) ||
        (/^(GET|HEAD)$/i.test(verb) && body !== null)
      )
        throw new PluginError("INVALID_REQUEST", "Invalid fetch body")
      const headers = new Headers()
      let size = 0
      for (const pair of p.headers) {
        if (
          !Array.isArray(pair) ||
          pair.length !== 2 ||
          pair.some((value) => typeof value !== "string")
        )
          throw new PluginError("INVALID_REQUEST", "Invalid fetch header")
        size += pair[0].length + pair[1].length
        if (size > 32768)
          throw new PluginError("TOO_LARGE", "Headers exceed 32 KiB")
        if (!forbidden.test(pair[0])) headers.append(pair[0], pair[1])
      }
      for (let hop = 0; hop <= 20; hop++) {
        controller.signal.throwIfAborted()
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          (!origins.includes("*") && !origins.includes(url.origin))
        )
          throw new PluginError(
            "PERMISSION_DENIED",
            "Network origin not granted"
          )
        url.hash = ""
        const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
          all: true,
        })
        // Same fail-closed private/reserved-address policy as the QuickJS broker.
        if (
          !addresses.length ||
          addresses.some(({ address }) => !publicAddress(address))
        )
          throw new PluginError(
            "PERMISSION_DENIED",
            "Private/reserved destination denied"
          )
        controller.signal.throwIfAborted()
        const { address, family } = addresses[0]!
        const response = await new Promise<IncomingMessage>(
          (resolve, reject) => {
            const request = https.request(
              url,
              {
                method: verb,
                signal: controller.signal,
                headers: {
                  ...Object.fromEntries(headers),
                  "accept-encoding": "gzip, deflate, br",
                },
                lookup: (_host, options, callback) => {
                  if (options.all) callback(null, [{ address, family }])
                  else callback(null, address, family)
                },
              },
              resolve
            )
            request.on("error", reject)
            request.end(body)
          }
        )
        // Errors can arrive while the guest has not started reading yet.
        response.on("error", () => entry.dispose())
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          if (p.redirect === "error") {
            response.destroy()
            throw new TypeError("Redirect disallowed by request")
          }
          if (p.redirect === "manual") {
            response.destroy()
            entry.dispose()
            return {
              status: 0,
              statusText: "",
              headers: [],
              body: false,
              url: "",
              redirected: false,
              type: "opaqueredirect",
            }
          }
          if (response.headers.location) {
            response.destroy()
            if (hop === 20) throw new TypeError("Too many redirects")
            const next = new URL(response.headers.location, url)
            if (next.origin !== url.origin) headers.delete("authorization")
            if (
              ([301, 302].includes(status) && verb === "POST") ||
              (status === 303 && !["GET", "HEAD"].includes(verb))
            ) {
              verb = "GET"
              body = null
              for (const key of [
                "content-type",
                "content-encoding",
                "content-language",
                "content-location",
              ])
                headers.delete(key)
            }
            url = next
            continue
          }
        }
        const resultHeaders = Object.entries(response.headers)
          .filter(([key]) => !["set-cookie", "set-cookie2"].includes(key))
          .flatMap(([key, value]) =>
            value === undefined
              ? []
              : Array.isArray(value)
                ? value.map((item) => [key, item])
                : [[key, value]]
          )
        if (
          resultHeaders.reduce(
            (sum, [key, value]) => sum + key!.length + value!.length,
            0
          ) > 32768
        ) {
          response.destroy()
          throw new TypeError("Response headers exceed 32 KiB")
        }
        const hasBody = verb !== "HEAD" && ![204, 205, 304].includes(status)
        if (hasBody) {
          let stream: Readable = response
          const encoding = response.headers["content-encoding"]
          const decompressor =
            encoding === "gzip"
              ? createGunzip()
              : encoding === "deflate"
                ? createInflate()
                : encoding === "br"
                  ? createBrotliDecompress()
                  : null
          if (decompressor) {
            response.on("error", (error) => decompressor.destroy(error))
            decompressor.on("error", () => entry.dispose())
            stream = decompressor
          }
          const close = () => {
            response.destroy()
            stream.destroy()
          }
          controller.signal.addEventListener("abort", close, { once: true })
          entry.reader = (async function* () {
            if (decompressor) response.pipe(decompressor)
            for await (const bytes of stream) {
              const buffer = Buffer.from(bytes as Uint8Array)
              for (let i = 0; i < buffer.length; i += 16384)
                yield buffer.subarray(i, i + 16384)
            }
          })()
          clearTimeout(entry.timer)
          entry.timer = setTimeout(entry.dispose, 30000)
        } else {
          response.destroy()
          entry.dispose()
        }
        return {
          status,
          statusText: response.statusMessage ?? "",
          headers: resultHeaders,
          body: hasBody,
          url: url.href,
          redirected: hop > 0,
          type: "basic",
        }
      }
      throw new TypeError("Too many redirects")
    } catch (error) {
      entry.dispose()
      throw error
    }
  }
}

export function publicIPv4(value: string): boolean {
  const parts = value.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false
  const [a, b, c] = parts
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  )
}

export function publicAddress(value: string): boolean {
  if (isIP(value) === 4) return publicIPv4(value)
  if (isIP(value) !== 6) return false
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  const [left, right] = canonical.split("::")
  const head = left ? left.split(":") : []
  const tail = right ? right.split(":") : []
  const segments = (
    right === undefined
      ? head
      : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail]
  ).map((part: string) => Number.parseInt(part, 16))
  if (
    segments.slice(0, 5).every((part) => part === 0) &&
    segments[5] === 0xffff
  )
    return publicIPv4(
      [
        segments[6]! >> 8,
        segments[6]! & 255,
        segments[7]! >> 8,
        segments[7]! & 255,
      ].join(".")
    )
  return (
    (segments[0]! & 0xe000) === 0x2000 &&
    !(
      segments[0] === 0x2001 &&
      (segments[1]! < 0x200 || segments[1] === 0xdb8)
    ) &&
    segments[0] !== 0x2002 &&
    !(segments[0] === 0x3fff && segments[1]! < 0x1000)
  )
}
