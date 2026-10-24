;(() => {
  const native = globalThis.__network
  delete globalThis.__network
  const stringify = JSON.stringify
  const parse = JSON.parse
  function host(method, value) {
    const result = parse(native(method, stringify(value)))
    if (!result.ok) throw new TypeError(result.error)
    return result.value
  }
  const encode64 = (bytes) => host("base64.encode", Array.from(bytes))
  const decode64 = (text) => Uint8Array.from(host("base64.decode", text))
  const unsupported = (feature) => {
    throw new DOMException(
      `${feature} is not supported in this runtime version`,
      "NotSupportedError"
    )
  }

  class DOMException extends Error {
    constructor(message = "", name = "Error") {
      super(String(message))
      this.name = String(name)
    }
    get code() {
      return (
        {
          InvalidStateError: 11,
          SyntaxError: 12,
          AbortError: 20,
          QuotaExceededError: 22,
          TimeoutError: 23,
        }[this.name] ?? 0
      )
    }
  }
  class Event {
    constructor(type, options = {}) {
      this.type = String(type)
      this.cancelable = !!options.cancelable
      this.defaultPrevented = false
      this.target = null
      this.currentTarget = null
    }
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true
    }
  }
  class MessageEvent extends Event {
    constructor(type, options = {}) {
      super(type, options)
      this.data = options.data ?? null
      this.origin = options.origin ?? ""
      this.lastEventId = options.lastEventId ?? ""
      this.ports = []
      this.source = null
    }
  }
  class CloseEvent extends Event {
    constructor(type, options = {}) {
      super(type, options)
      this.code = options.code ?? 0
      this.reason = options.reason ?? ""
      this.wasClean = !!options.wasClean
    }
  }
  class EventTarget {
    #listeners = new Map()
    addEventListener(type, callback, options = {}) {
      if (callback == null) return
      if (
        typeof callback !== "function" &&
        typeof callback.handleEvent !== "function"
      )
        throw new TypeError("Invalid event listener")
      type = String(type)
      const capture = typeof options === "boolean" ? options : !!options.capture
      const signal = typeof options === "object" ? options.signal : undefined
      if (signal?.aborted) return
      const list = this.#listeners.get(type) ?? []
      if (
        list.some(
          (item) => item.callback === callback && item.capture === capture
        )
      )
        return
      const item = { callback, capture, once: !!options?.once, cleanup: null }
      if (signal) {
        const abort = () => this.removeEventListener(type, callback, capture)
        signal.addEventListener("abort", abort, { once: true })
        item.cleanup = () => signal.removeEventListener("abort", abort)
      }
      list.push(item)
      this.#listeners.set(type, list)
    }
    removeEventListener(type, callback, options = {}) {
      const capture = typeof options === "boolean" ? options : !!options.capture
      const list = this.#listeners.get(String(type))
      const index =
        list?.findIndex(
          (item) => item.callback === callback && item.capture === capture
        ) ?? -1
      if (index >= 0) {
        list[index].cleanup?.()
        list.splice(index, 1)
      }
    }
    dispatchEvent(event) {
      if (!(event instanceof Event)) throw new TypeError("Expected Event")
      event.target = this
      event.currentTarget = this
      const property = this[`on${event.type}`]
      if (typeof property === "function") property.call(this, event)
      for (const item of [...(this.#listeners.get(event.type) ?? [])]) {
        if (!this.#listeners.get(event.type)?.includes(item)) continue
        if (item.once)
          this.removeEventListener(event.type, item.callback, item.capture)
        if (typeof item.callback === "function") item.callback.call(this, event)
        else item.callback.handleEvent(event)
      }
      event.currentTarget = null
      return !event.defaultPrevented
    }
  }
  const aborts = new WeakMap()
  class AbortSignal extends EventTarget {
    constructor(token) {
      super()
      if (token !== aborts) throw new TypeError("Illegal constructor")
      aborts.set(this, { aborted: false, reason: undefined })
      this.onabort = null
    }
    get aborted() {
      return aborts.get(this).aborted
    }
    get reason() {
      return aborts.get(this).reason
    }
    throwIfAborted() {
      if (this.aborted) throw this.reason
    }
    static abort(reason) {
      const controller = new AbortController()
      controller.abort(reason)
      return controller.signal
    }
    static any(signals) {
      const values = Array.from(signals)
      if (values.some((signal) => !(signal instanceof AbortSignal)))
        throw new TypeError("Expected AbortSignals")
      const controller = new AbortController(),
        listeners = []
      for (const signal of values) {
        if (signal.aborted) {
          controller.abort(signal.reason)
          return controller.signal
        }
      }
      for (const signal of values) {
        const abort = () => {
          for (const [source, listener] of listeners)
            source.removeEventListener("abort", listener)
          controller.abort(signal.reason)
        }
        listeners.push([signal, abort])
        signal.addEventListener("abort", abort, { once: true })
      }
      return controller.signal
    }
    static timeout(ms) {
      if (!Number.isSafeInteger(ms) || ms < 0 || ms > 2147483647)
        throw new RangeError("Invalid timeout")
      const controller = new AbortController()
      setTimeout(
        () =>
          controller.abort(
            new DOMException("Operation timed out", "TimeoutError")
          ),
        ms
      )
      return controller.signal
    }
  }
  class AbortController {
    #signal = new AbortSignal(aborts)
    get signal() {
      return this.#signal
    }
    abort(
      reason = new DOMException("The operation was aborted", "AbortError")
    ) {
      const state = aborts.get(this.#signal)
      if (state.aborted) return
      state.aborted = true
      state.reason = reason
      this.#signal.dispatchEvent(new Event("abort"))
    }
  }

  class TextEncoder {
    get encoding() {
      return "utf-8"
    }
    encode(value = "") {
      const text = String(value).replace(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
        "\ufffd"
      )
      return Uint8Array.from(host("encode", text))
    }
    encodeInto(value, destination) {
      if (!(destination instanceof Uint8Array))
        throw new TypeError("Expected Uint8Array")
      let read = 0,
        written = 0
      for (const scalar of String(value)) {
        const bytes = this.encode(scalar)
        if (written + bytes.length > destination.length) break
        destination.set(bytes, written)
        written += bytes.length
        read += scalar.length
      }
      return { read, written }
    }
  }
  class TextDecoder {
    #fatal
    #ignoreBOM
    #pending = new Uint8Array()
    #started = false
    constructor(label = "utf-8", options = {}) {
      if (
        !["utf-8", "utf8", "unicode-1-1-utf-8"].includes(
          String(label).trim().toLowerCase()
        )
      )
        throw new RangeError("Only UTF-8 decoding is supported")
      this.#fatal = !!options.fatal
      this.#ignoreBOM = !!options.ignoreBOM
    }
    get encoding() {
      return "utf-8"
    }
    get fatal() {
      return this.#fatal
    }
    get ignoreBOM() {
      return this.#ignoreBOM
    }
    decode(input = new Uint8Array(), options = {}) {
      const bytes = bufferBytes(input),
        joined = new Uint8Array(this.#pending.length + bytes.length)
      joined.set(this.#pending)
      joined.set(bytes, this.#pending.length)
      let end = joined.length
      if (options.stream && end) {
        let start = end - 1
        while (start >= 0 && (joined[start] & 0xc0) === 0x80) start--
        const head = joined[start],
          length =
            head >= 0xc2 && head <= 0xdf
              ? 2
              : head >= 0xe0 && head <= 0xef
                ? 3
                : head >= 0xf0 && head <= 0xf4
                  ? 4
                  : 1
        if (start >= 0 && end - start < length) end = start
      }
      this.#pending = joined.slice(end)
      const text = host("decode", {
        bytes: Array.from(joined.subarray(0, end)),
        fatal: this.#fatal,
        ignoreBOM: this.#ignoreBOM || this.#started,
      })
      if (end) this.#started = true
      if (!options.stream) {
        this.#started = false
        this.#pending = new Uint8Array()
      }
      return text
    }
  }
  function bufferBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value))
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    throw new TypeError("Expected ArrayBuffer or ArrayBufferView")
  }
  const blobs = new WeakMap()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  class Blob {
    constructor(parts = [], options = {}) {
      if (options.endings && options.endings !== "transparent")
        unsupported("Blob native line endings")
      const chunks = Array.from(parts, (part) =>
        part instanceof Blob
          ? blobs.get(part).bytes
          : part instanceof ArrayBuffer || ArrayBuffer.isView(part)
            ? bufferBytes(part)
            : encoder.encode(String(part))
      )
      const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      if (size > 16 * 1024 * 1024) throw new RangeError("Blob exceeds 16 MiB")
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      const raw = String(options.type ?? "")
      blobs.set(this, {
        bytes,
        type: /^[\x20-\x7e]*$/.test(raw) ? raw.toLowerCase() : "",
      })
    }
    get size() {
      return blobs.get(this).bytes.length
    }
    get type() {
      return blobs.get(this).type
    }
    async arrayBuffer() {
      return blobs.get(this).bytes.slice().buffer
    }
    async bytes() {
      return blobs.get(this).bytes.slice()
    }
    async text() {
      return decoder.decode(blobs.get(this).bytes)
    }
    slice(start = 0, end = this.size, type = "") {
      return new Blob([blobs.get(this).bytes.slice(start, end)], { type })
    }
    stream() {
      const bytes = blobs.get(this).bytes.slice()
      return new ReadableStream({
        type: "bytes",
        start(controller) {
          if (bytes.length) controller.enqueue(bytes)
          controller.close()
        },
      })
    }
  }

  class File extends Blob {
    constructor(parts, name, options = {}) {
      super(parts, options)
      Object.defineProperties(this, {
        name: { value: String(name), enumerable: true },
        lastModified: {
          value: Number(options.lastModified ?? Date.now()),
          enumerable: true,
        },
      })
    }
  }
  class FormData {
    #entries = []
    append(name, value, filename) {
      if (value instanceof Blob)
        value = new File(
          [value],
          filename ?? (value instanceof File ? value.name : "blob"),
          { type: value.type }
        )
      else {
        if (filename !== undefined)
          throw new TypeError("Filename requires Blob")
        value = String(value)
      }
      this.#entries.push([String(name), value])
    }
    delete(name) {
      this.#entries = this.#entries.filter(([key]) => key !== String(name))
    }
    get(name) {
      return this.#entries.find(([key]) => key === String(name))?.[1] ?? null
    }
    getAll(name) {
      return this.#entries
        .filter(([key]) => key === String(name))
        .map(([, value]) => value)
    }
    has(name) {
      return this.#entries.some(([key]) => key === String(name))
    }
    set(name, value, filename) {
      name = String(name)
      const index = this.#entries.findIndex(([key]) => key === name)
      this.delete(name)
      this.append(name, value, filename)
      if (index >= 0) this.#entries.splice(index, 0, this.#entries.pop())
    }
    *entries() {
      yield* this.#entries
    }
    *keys() {
      for (const [key] of this.#entries) yield key
    }
    *values() {
      for (const [, value] of this.#entries) yield value
    }
    [Symbol.iterator]() {
      return this.entries()
    }
    forEach(callback, thisArg) {
      for (const [key, value] of this.#entries)
        callback.call(thisArg, value, key, this)
    }
  }
  const quoteForm = (value) =>
    String(value)
      .replace(/\r(?!\n)|(?<!\r)\n/g, "\r\n")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A")
      .replace(/"/g, "%22")
  function encodeForm(form) {
    const boundary = `----eidos${Math.random().toString(36).slice(2)}${Date.now()}`
    const parts = []
    for (const [name, value] of form) {
      let header = `--${boundary}\r\nContent-Disposition: form-data; name="${quoteForm(name)}"`
      if (value instanceof Blob) {
        header += `; filename="${quoteForm(value.name)}"\r\nContent-Type: ${value.type || "application/octet-stream"}`
        parts.push(header + "\r\n\r\n", value, "\r\n")
      } else
        parts.push(
          header + "\r\n\r\n",
          value.replace(/\r(?!\n)|(?<!\r)\n/g, "\r\n"),
          "\r\n"
        )
    }
    parts.push(`--${boundary}--\r\n`)
    return new Blob(parts, {
      type: `multipart/form-data; boundary=${boundary}`,
    })
  }

  const headerData = new WeakMap()
  const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
  function headerName(name) {
    name = String(name)
    if (!token.test(name)) throw new TypeError("Invalid header name")
    return name.toLowerCase()
  }
  function headerValue(value) {
    value = String(value).replace(/^[\t ]+|[\t ]+$/g, "")
    if (/[\r\n\0]|[^\x00-\xff]/.test(value))
      throw new TypeError("Invalid header value")
    return value
  }
  class Headers {
    constructor(init = undefined) {
      headerData.set(this, { values: new Map(), cookies: [], immutable: false })
      if (init == null) return
      if (typeof init[Symbol.iterator] === "function") {
        for (const pair of init) {
          const values = Array.from(pair)
          if (values.length !== 2)
            throw new TypeError("Header pair must contain two values")
          this.append(values[0], values[1])
        }
      } else
        for (const [name, value] of Object.entries(init))
          this.append(name, value)
    }
    append(name, value) {
      this.#check()
      name = headerName(name)
      value = headerValue(value)
      if (name === "set-cookie") headerData.get(this).cookies.push(value)
      const map = headerData.get(this).values
      map.set(name, map.has(name) ? `${map.get(name)}, ${value}` : value)
    }
    set(name, value) {
      this.#check()
      name = headerName(name)
      value = headerValue(value)
      if (name === "set-cookie") headerData.get(this).cookies = [value]
      headerData.get(this).values.set(name, value)
    }
    delete(name) {
      this.#check()
      name = headerName(name)
      if (name === "set-cookie") headerData.get(this).cookies = []
      headerData.get(this).values.delete(name)
    }
    get(name) {
      return headerData.get(this).values.get(headerName(name)) ?? null
    }
    has(name) {
      return headerData.get(this).values.has(headerName(name))
    }
    #check() {
      if (headerData.get(this).immutable)
        throw new TypeError("Headers are immutable")
    }
    *entries() {
      for (const [name, value] of [...headerData.get(this).values].sort(
        ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
      )) {
        if (name === "set-cookie")
          for (const cookie of headerData.get(this).cookies)
            yield [name, cookie]
        else yield [name, value]
      }
    }
    *keys() {
      for (const [key] of this.entries()) yield key
    }
    *values() {
      for (const [, value] of this.entries()) yield value
    }
    [Symbol.iterator]() {
      return this.entries()
    }
    forEach(callback, thisArg) {
      for (const [key, value] of this) callback.call(thisArg, value, key, this)
    }
    getSetCookie() {
      return headerData.get(this).cookies.slice()
    }
  }
  const bodies = new WeakMap()
  function initBody(object, body, headers) {
    let bytes = null,
      type = null
    if (body != null) {
      if (body instanceof FormData) body = encodeForm(body)
      if (body instanceof URLSearchParams) {
        type = "application/x-www-form-urlencoded;charset=UTF-8"
        body = body.toString()
      }
      if (body instanceof ReadableStream) {
        if (body.locked) throw new TypeError("Body stream is locked")
        bodies.set(object, { stream: body, used: false })
        return
      }
      if (body instanceof Blob) {
        bytes = blobs.get(body).bytes.slice()
        type = body.type || null
      } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
        bytes = bufferBytes(body).slice()
      else if (typeof body === "string") {
        bytes = encoder.encode(body)
        type ??= "text/plain;charset=UTF-8"
      } else
        unsupported("This BodyInit type (use string, Blob or BufferSource)")
      if (bytes.length > 16 * 1024 * 1024)
        throw new RangeError("Body exceeds 16 MiB")
    }
    if (type && !headers.has("content-type")) headers.set("content-type", type)
    const state = { stream: null, used: false }
    if (bytes !== null)
      state.stream = new ReadableStream(
        {
          type: "bytes",
          pull(controller) {
            state.used = true
            if (bytes.length) controller.enqueue(bytes)
            controller.close()
            controller.byobRequest?.respond(0)
          },
          cancel() {
            state.used = true
          },
        },
        { highWaterMark: 0 }
      )
    bodies.set(object, state)
  }
  async function consume(object, signal) {
    const body = bodies.get(object)
    if (object.bodyUsed || body.stream?.locked)
      throw new TypeError("Body has already been consumed or is locked")
    if (!body.stream) return new Uint8Array()
    body.used = true
    const reader = body.stream.getReader(),
      chunks = []
    const abort = () => {
      reader.cancel(signal.reason).catch(() => {})
    }
    signal?.addEventListener("abort", abort, { once: true })
    let size = 0
    try {
      for (;;) {
        signal?.throwIfAborted()
        const { done, value } = await reader.read()
        signal?.throwIfAborted()
        if (done) break
        if (!(value instanceof Uint8Array))
          throw new TypeError("Body stream must contain Uint8Array chunks")
        size += value.length
        if (size > 16 * 1024 * 1024)
          throw new RangeError(
            "Buffered body exceeds 16 MiB; consume the stream instead"
          )
        chunks.push(value)
      }
    } catch (error) {
      reader.cancel(error).catch(() => {})
      throw error
    } finally {
      signal?.removeEventListener("abort", abort)
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return bytes
  }
  function cloneBody(source, target) {
    const state = bodies.get(source)
    if (source.bodyUsed || state.stream?.locked)
      throw new TypeError("Body has already been consumed or is locked")
    const streams = state.stream?.tee() ?? [null, null]
    bodies.set(source, { stream: streams[0], used: false })
    bodies.set(target, { stream: streams[1], used: false })
  }
  class Body {
    get bodyUsed() {
      const body = bodies.get(this)
      return body.used || !!body.stream?._disturbed
    }
    get body() {
      return bodies.get(this).stream
    }
    async text() {
      return decoder.decode(await consume(this))
    }
    async json() {
      return parse(await this.text())
    }
    async arrayBuffer() {
      return (await consume(this)).buffer
    }
    async bytes() {
      return consume(this)
    }
    async blob() {
      return new Blob([await consume(this)], {
        type: this.headers.get("content-type") ?? "",
      })
    }
    async formData() {
      const type = this.headers.get("content-type") ?? ""
      const bytes = await consume(this),
        result = new FormData()
      if (/^application\/x-www-form-urlencoded(?:;|$)/i.test(type)) {
        for (const [key, value] of new URLSearchParams(decoder.decode(bytes)))
          result.append(key, value)
        return result
      }
      const boundary =
        /^multipart\/form-data\s*;.*?boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(
          type
        )
      if (!boundary) throw new TypeError("Unsupported form content type")
      let raw = ""
      for (let i = 0; i < bytes.length; i += 8192)
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
      const delimiter = `--${boundary[1] ?? boundary[2]}`
      if (
        !raw.startsWith(delimiter + "\r\n") &&
        !raw.startsWith(delimiter + "--")
      )
        throw new TypeError("Invalid multipart body")
      if (
        !raw.endsWith(delimiter + "--\r\n") &&
        !raw.endsWith(delimiter + "--")
      )
        throw new TypeError("Incomplete multipart body")
      const separator = new RegExp(
        "\\r\\n" +
          delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "(?=\\r\\n|--)"
      )
      for (const part of raw.split(separator).slice(0, -1)) {
        const item = part.startsWith(delimiter)
          ? part.slice(delimiter.length + 2)
          : part.slice(2)
        const split = item.indexOf("\r\n\r\n")
        if (split < 0) throw new TypeError("Invalid multipart body")
        const headers = item.slice(0, split),
          payload = Uint8Array.from(item.slice(split + 4), (c) =>
            c.charCodeAt(0)
          )
        const name =
          /content-disposition:\s*form-data;[^\r\n]*\bname="([^"]*)"/i.exec(
            headers
          )?.[1]
        if (name === undefined) throw new TypeError("Invalid form disposition")
        const filename = /;\s*filename="([^"]*)"/i.exec(headers)?.[1]
        const key = decoder.decode(
          Uint8Array.from(name, (c) => c.charCodeAt(0))
        )
        if (filename !== undefined)
          result.append(
            key,
            new Blob([payload], {
              type:
                /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] ??
                "application/octet-stream",
            }),
            decoder.decode(Uint8Array.from(filename, (c) => c.charCodeAt(0)))
          )
        else result.append(key, decoder.decode(payload))
      }
      return result
    }
  }
  const requests = new WeakMap()
  class Request extends Body {
    constructor(input, init = {}) {
      super()
      const original = input instanceof Request ? input : null
      const old = original ? requests.get(original) : null
      if (original?.bodyUsed && init.body == null)
        throw new TypeError("Request body already consumed")
      const url = host("url", {
        url: original ? original.url : String(input),
        websocket: false,
      }).url
      if (!/^https?:/.test(url)) throw new TypeError("fetch requires HTTP(S)")
      let method = String(init.method ?? old?.method ?? "GET")
      if (!token.test(method) || /^(CONNECT|TRACE|TRACK)$/i.test(method))
        throw new TypeError("Invalid/forbidden HTTP method")
      if (
        ["DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT"].includes(
          method.toUpperCase()
        )
      )
        method = method.toUpperCase()
      const headers = new Headers(init.headers ?? old?.headers)
      const redirect = init.redirect ?? old?.redirect ?? "follow"
      if (!["follow", "error", "manual"].includes(redirect))
        throw new TypeError("Invalid redirect mode")
      const signal = init.signal ?? old?.signal ?? new AbortController().signal
      if (!(signal instanceof AbortSignal))
        throw new TypeError("Expected AbortSignal")
      const credentials = init.credentials ?? old?.credentials ?? "same-origin"
      const mode = init.mode ?? old?.mode ?? "cors"
      const cache = init.cache ?? old?.cache ?? "default"
      const integrity = String(init.integrity ?? old?.integrity ?? "")
      const referrer = String(init.referrer ?? old?.referrer ?? "about:client")
      const referrerPolicy = init.referrerPolicy ?? old?.referrerPolicy ?? ""
      if (
        !["omit", "same-origin", "include"].includes(credentials) ||
        !["cors", "same-origin", "no-cors"].includes(mode) ||
        ![
          "default",
          "no-store",
          "reload",
          "no-cache",
          "force-cache",
          "only-if-cached",
        ].includes(cache) ||
        ![
          "",
          "no-referrer",
          "no-referrer-when-downgrade",
          "same-origin",
          "origin",
          "strict-origin",
          "origin-when-cross-origin",
          "strict-origin-when-cross-origin",
          "unsafe-url",
        ].includes(referrerPolicy) ||
        (init.duplex !== undefined && init.duplex !== "half") ||
        (cache === "only-if-cached" && mode !== "same-origin")
      )
        throw new TypeError("Invalid Request options")
      const body =
        init.body != null
          ? init.body
          : original
            ? bodies.get(original).stream
            : null
      if (
        init.body instanceof ReadableStream &&
        (init.duplex !== "half" || init.keepalive || mode === "no-cors")
      )
        throw new TypeError(
          "Streaming bodies require duplex: half and do not support keepalive/no-cors"
        )
      if (mode === "no-cors" && !["GET", "HEAD", "POST"].includes(method))
        throw new TypeError("Invalid no-cors method")
      if ((method === "GET" || method === "HEAD") && body != null)
        throw new TypeError("GET/HEAD cannot have a body")
      initBody(this, body, headers)
      requests.set(this, {
        url,
        method,
        headers,
        redirect,
        signal,
        credentials,
        mode,
        cache,
        integrity,
        referrer,
        referrerPolicy,
        keepalive: !!(init.keepalive ?? old?.keepalive),
      })
    }
    get url() {
      return requests.get(this).url
    }
    get method() {
      return requests.get(this).method
    }
    get headers() {
      return requests.get(this).headers
    }
    get redirect() {
      return requests.get(this).redirect
    }
    get signal() {
      return requests.get(this).signal
    }
    get credentials() {
      return requests.get(this).credentials
    }
    get mode() {
      return requests.get(this).mode
    }
    get cache() {
      return requests.get(this).cache
    }
    get integrity() {
      return requests.get(this).integrity
    }
    get referrer() {
      return requests.get(this).referrer
    }
    get referrerPolicy() {
      return requests.get(this).referrerPolicy
    }
    get keepalive() {
      return requests.get(this).keepalive
    }
    get duplex() {
      return "half"
    }
    get destination() {
      return ""
    }
    clone() {
      if (this.bodyUsed) throw new TypeError("Body already consumed")
      const copy = new Request(this.url, requests.get(this))
      cloneBody(this, copy)
      return copy
    }
  }
  const responses = new WeakMap()
  class Response extends Body {
    constructor(body = null, init = {}) {
      super()
      const status = Number(init.status ?? 200)
      if (!Number.isInteger(status) || status < 200 || status > 599)
        throw new RangeError("Invalid response status")
      if ([204, 205, 304].includes(status) && body !== null)
        throw new TypeError("This status cannot have a body")
      const statusText = String(init.statusText ?? "")
      if (/[\r\n]|[^\x09\x20-\xff]/.test(statusText))
        throw new TypeError("Invalid statusText")
      const headers = new Headers(init.headers)
      initBody(this, body, headers)
      responses.set(this, {
        status,
        statusText,
        headers,
        url: "",
        redirected: false,
        type: "default",
      })
    }
    get status() {
      return responses.get(this).status
    }
    get statusText() {
      return responses.get(this).statusText
    }
    get headers() {
      return responses.get(this).headers
    }
    get url() {
      return responses.get(this).url
    }
    get redirected() {
      return responses.get(this).redirected
    }
    get type() {
      return responses.get(this).type
    }
    get ok() {
      return this.status >= 200 && this.status < 300
    }
    clone() {
      if (this.bodyUsed) throw new TypeError("Body already consumed")
      const copy = new Response()
      const data = responses.get(this)
      responses.set(copy, { ...data, headers: new Headers(data.headers) })
      headerData.get(copy.headers).immutable = headerData.get(
        this.headers
      ).immutable
      cloneBody(this, copy)
      return copy
    }
    static json(data, init = {}) {
      const body = stringify(data)
      if (body === undefined)
        throw new TypeError("Value is not JSON serializable")
      const headers = new Headers(init.headers)
      if (!headers.has("content-type"))
        headers.set("content-type", "application/json")
      return new Response(body, { ...init, headers })
    }
    static error() {
      const result = new Response()
      Object.assign(responses.get(result), { status: 0, type: "error" })
      headerData.get(result.headers).immutable = true
      return result
    }
    static redirect(url, status = 302) {
      if (![301, 302, 303, 307, 308].includes(status))
        throw new RangeError("Invalid redirect status")
      const response = new Response(null, {
        status,
        headers: {
          location: host("url", { url: String(url), websocket: false }).url,
        },
      })
      headerData.get(response.headers).immutable = true
      return response
    }
  }
  const pending = new Map()
  async function fetch(input, init) {
    const request = new Request(input, init)
    const response = await performFetch(request)
    if (!request.integrity) return response
    const hashes = request.integrity
      .split(/\s+/)
      .map((part) =>
        /^(sha256|sha384|sha512)-([A-Za-z0-9+/_=-]+)(?:\?.*)?$/.exec(part)
      )
      .filter(Boolean)
    if (!hashes.length) return response
    const bytes = await response.bytes()
    const algorithm = hashes
      .map((hash) => hash[1])
      .sort()
      .at(-1)
    const digest = host("digest", { algorithm, body: encode64(bytes) })
    if (
      !hashes.some(
        (hash) =>
          hash[1] === algorithm &&
          hash[2].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "") ===
            digest.replace(/=+$/, "")
      )
    )
      throw new TypeError("Integrity mismatch")
    const headers = new Headers(response.headers)
    initBody(response, response.body === null ? null : bytes, headers)
    return response
  }
  async function performFetch(request) {
    request.signal.throwIfAborted()
    const body =
      request.body === null ? null : await consume(request, request.signal)
    if (body && body.length > 1024 * 1024)
      throw new TypeError("Request body exceeds 1 MiB")
    request.signal.throwIfAborted()
    const payload = {
      url: request.url,
      method: request.method,
      headers: [...request.headers],
      body: body === null ? null : encode64(body),
      redirect: request.redirect,
    }
    const id = host("fetch", payload)
    return new Promise((resolve, reject) => {
      const abort = () => {
        host("cancel", id)
        pending.delete(id)
        item.controller?.error(request.signal.reason)
        item.pullResolve?.()
        item.cleanup()
        reject(request.signal.reason)
      }
      request.signal.addEventListener("abort", abort, { once: true })
      const item = {
        resolve,
        reject,
        cleanup: () => request.signal.removeEventListener("abort", abort),
      }
      pending.set(id, item)
    })
  }

  const sockets = new Map()
  const socketData = new WeakMap()
  class WebSocket extends EventTarget {
    constructor(url, protocols = []) {
      super()
      let normalized
      try {
        normalized = host("url", { url: String(url), websocket: true })
      } catch (error) {
        throw new DOMException(error.message, "SyntaxError")
      }
      protocols =
        typeof protocols === "string"
          ? [protocols]
          : Array.from(protocols, String)
      if (
        protocols.length > 32 ||
        protocols.some((value) => !token.test(value) || value.length > 256) ||
        new Set(protocols).size !== protocols.length
      )
        throw new DOMException(
          "Invalid or duplicate subprotocol",
          "SyntaxError"
        )
      const id = host("ws.open", { url: normalized.url, protocols })
      socketData.set(this, {
        id,
        url: normalized.url,
        origin: normalized.origin.replace(/^ws/, "http"),
        state: 0,
        protocol: "",
        extensions: "",
        binaryType: "blob",
        buffered: 0,
      })
      this.onopen = this.onmessage = this.onerror = this.onclose = null
      sockets.set(id, this)
    }
    get url() {
      return socketData.get(this).url
    }
    get readyState() {
      return socketData.get(this).state
    }
    get protocol() {
      return socketData.get(this).protocol
    }
    get extensions() {
      return socketData.get(this).extensions
    }
    get bufferedAmount() {
      return socketData.get(this).buffered
    }
    get binaryType() {
      return socketData.get(this).binaryType
    }
    set binaryType(value) {
      if (value === "blob" || value === "arraybuffer")
        socketData.get(this).binaryType = value
    }
    send(value) {
      const state = socketData.get(this)
      if (state.state === 0)
        throw new DOMException("WebSocket is connecting", "InvalidStateError")
      const binary =
        value instanceof Blob ||
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
      const bytes =
        value instanceof Blob
          ? blobs.get(value).bytes
          : binary
            ? bufferBytes(value)
            : encoder.encode(String(value))
      if (state.state !== 1) {
        state.buffered += bytes.length
        return
      }
      state.buffered += host("ws.send", {
        id: state.id,
        body: encode64(bytes),
        binary,
      })
    }
    close(code = undefined, reason = "") {
      if (code !== undefined) {
        code = Number(code)
        if (
          !Number.isInteger(code) ||
          (code !== 1000 && (code < 3000 || code > 4999))
        )
          throw new DOMException("Invalid close code", "InvalidAccessError")
      }
      reason = String(reason)
      if (encoder.encode(reason).length > 123)
        throw new DOMException("Close reason exceeds 123 bytes", "SyntaxError")
      const state = socketData.get(this)
      if (state.state >= 2) return
      host("ws.close", {
        id: state.id,
        code: code ?? (reason ? 1000 : null),
        reason,
      })
      state.state = 2
    }
  }
  for (const [name, value] of Object.entries({
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  })) {
    Object.defineProperty(WebSocket, name, { value, enumerable: true })
    Object.defineProperty(WebSocket.prototype, name, {
      value,
      enumerable: true,
    })
  }

  class TextDecoderStream {
    constructor(label, options) {
      const decoder = new TextDecoder(label, options)
      const stream = new TransformStream({
        transform(chunk, controller) {
          const value = decoder.decode(chunk, { stream: true })
          if (value) controller.enqueue(value)
        },
        flush(controller) {
          const value = decoder.decode()
          if (value) controller.enqueue(value)
        },
      })
      Object.defineProperties(this, {
        readable: { value: stream.readable },
        writable: { value: stream.writable },
        encoding: { value: decoder.encoding },
        fatal: { value: decoder.fatal },
        ignoreBOM: { value: decoder.ignoreBOM },
      })
    }
  }
  class TextEncoderStream {
    constructor() {
      let pending = ""
      const stream = new TransformStream({
        transform(chunk, controller) {
          let value = pending + String(chunk)
          pending = ""
          const last = value.charCodeAt(value.length - 1)
          if (last >= 0xd800 && last <= 0xdbff) {
            pending = value.slice(-1)
            value = value.slice(0, -1)
          }
          if (value) controller.enqueue(encoder.encode(value))
        },
        flush(controller) {
          if (pending) controller.enqueue(encoder.encode("\ufffd"))
        },
      })
      Object.defineProperties(this, {
        readable: { value: stream.readable },
        writable: { value: stream.writable },
        encoding: { value: "utf-8" },
      })
    }
  }
  Object.assign(globalThis, {
    DOMException,
    Event,
    EventTarget,
    MessageEvent,
    CloseEvent,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    TextDecoderStream,
    TextEncoderStream,
    Blob,
    File,
    FormData,
    Headers,
    Request,
    Response,
    fetch,
    WebSocket,
  })
  return {
    network(text) {
      const event = parse(text)
      if (event.type.startsWith("fetch_")) {
        const item = pending.get(event.id)
        if (!item) return
        if (event.type === "fetch_chunk") {
          const bytes = decode64(event.body)
          if (bytes.length) item.controller.enqueue(bytes)
          item.pullResolve?.()
          item.pullResolve = null
          return
        }
        if (event.type === "fetch_end") {
          item.controller?.close()
          item.controller?.byobRequest?.respond(0)
          item.pullResolve?.()
          pending.delete(event.id)
          item.cleanup()
          return
        }
        if (event.type === "fetch_error") {
          const error = new TypeError(event.error)
          item.controller?.error(error)
          item.pullResolve?.()
          item.reject(error)
          pending.delete(event.id)
          item.cleanup()
          return
        }
        try {
          const response = new Response()
          responses.set(response, {
            status: event.status,
            statusText: event.statusText,
            headers: new Headers(event.headers),
            url: event.url,
            redirected: event.redirected,
            type: event.responseType,
          })
          headerData.get(response.headers).immutable = true
          const state = { stream: null, used: false }
          if (event.body !== null)
            state.stream = new ReadableStream(
              {
                type: "bytes",
                start(controller) {
                  item.controller = controller
                },
                pull() {
                  state.used = true
                  return new Promise((resolve, reject) => {
                    item.pullResolve = resolve
                    try {
                      host("fetch.pull", event.id)
                    } catch (error) {
                      reject(error)
                    }
                  })
                },
                cancel() {
                  state.used = true
                  host("cancel", event.id)
                  pending.delete(event.id)
                  item.cleanup()
                  item.pullResolve?.()
                },
              },
              { highWaterMark: 0 }
            )
          bodies.set(response, state)
          item.resolve(response)
        } catch (error) {
          item.reject(error)
        }
        return
      }
      const socket = sockets.get(event.id)
      if (!socket) return
      const state = socketData.get(socket)
      if (event.type === "ws_open") {
        if (state.state !== 0) return
        state.state = 1
        state.protocol = event.protocol
        state.extensions = event.extensions
        socket.dispatchEvent(new Event("open"))
      } else if (event.type === "ws_message") {
        if (state.state !== 1) return
        const data = !event.binary
          ? event.data
          : state.binaryType === "arraybuffer"
            ? decode64(event.data).buffer
            : new Blob([decode64(event.data)])
        socket.dispatchEvent(
          new MessageEvent("message", { data, origin: state.origin })
        )
      } else if (event.type === "ws_drain")
        state.buffered = Math.max(0, state.buffered - event.bytes)
      else if (event.type === "ws_error") {
        console.error("WebSocket:", event.error)
        socket.dispatchEvent(new Event("error"))
      } else if (event.type === "ws_close") {
        state.state = 3
        sockets.delete(event.id)
        socket.dispatchEvent(new CloseEvent("close", event))
      }
    },
  }
})()
