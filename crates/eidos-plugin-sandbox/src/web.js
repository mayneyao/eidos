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
      return Uint8Array.from(host("encode", String(value)))
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
      if (options.stream) unsupported("Streaming TextDecoder")
      return host("decode", {
        bytes: Array.from(bufferBytes(input)),
        fatal: this.#fatal,
        ignoreBOM: this.#ignoreBOM,
      })
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
      if (size > 1024 * 1024) throw new RangeError("Blob exceeds 1 MiB")
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
      unsupported("Blob.stream / ReadableStream")
    }
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
      headerData.set(this, { values: new Map(), immutable: false })
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
      const map = headerData.get(this).values
      map.set(name, map.has(name) ? `${map.get(name)}, ${value}` : value)
    }
    set(name, value) {
      this.#check()
      headerData.get(this).values.set(headerName(name), headerValue(value))
    }
    delete(name) {
      this.#check()
      headerData.get(this).values.delete(headerName(name))
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
      yield* [...headerData.get(this).values].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0
      )
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
  }
  const bodies = new WeakMap()
  function initBody(object, body, headers) {
    let bytes = null,
      type = null
    if (body != null) {
      if (body instanceof Blob) {
        bytes = blobs.get(body).bytes.slice()
        type = body.type || null
      } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
        bytes = bufferBytes(body).slice()
      else if (typeof body === "string") {
        bytes = encoder.encode(body)
        type = "text/plain;charset=UTF-8"
      } else
        unsupported("This BodyInit type (use string, Blob or BufferSource)")
      if (bytes.length > 1024 * 1024) throw new RangeError("Body exceeds 1 MiB")
    }
    if (type && !headers.has("content-type")) headers.set("content-type", type)
    bodies.set(object, { bytes, used: false })
  }
  function consume(object) {
    const body = bodies.get(object)
    if (body.used) throw new TypeError("Body has already been consumed")
    if (body.bytes !== null) body.used = true
    return body.bytes?.slice() ?? new Uint8Array()
  }
  class Body {
    get bodyUsed() {
      return bodies.get(this).used
    }
    get body() {
      if (bodies.get(this).bytes === null) return null
      unsupported(
        "Response/Request.body streaming (use text/json/arrayBuffer/blob)"
      )
    }
    async text() {
      return decoder.decode(consume(this))
    }
    async json() {
      return parse(await this.text())
    }
    async arrayBuffer() {
      return consume(this).buffer
    }
    async bytes() {
      return consume(this)
    }
    async blob() {
      return new Blob([consume(this)], {
        type: this.headers.get("content-type") ?? "",
      })
    }
    async formData() {
      unsupported("formData")
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
      for (const key of ["integrity", "referrer", "referrerPolicy", "duplex"])
        if (init[key] !== undefined) unsupported(`Request.${key}`)
      if (
        init.credentials !== undefined &&
        init.credentials !== "omit" &&
        init.credentials !== "same-origin"
      )
        unsupported("Credentialed requests")
      if (init.mode !== undefined && init.mode !== "cors")
        unsupported("Browser fetch modes")
      if (
        init.cache !== undefined &&
        !["default", "no-store"].includes(init.cache)
      )
        unsupported("HTTP cache modes")
      if (init.keepalive) unsupported("Request.keepalive")
      const body =
        init.body != null
          ? init.body
          : original
            ? bodies.get(original).bytes
            : null
      if ((method === "GET" || method === "HEAD") && body != null)
        throw new TypeError("GET/HEAD cannot have a body")
      initBody(this, body, headers)
      requests.set(this, { url, method, headers, redirect, signal })
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
      return "omit"
    }
    clone() {
      if (this.bodyUsed) throw new TypeError("Body already consumed")
      return new Request(this)
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
      bodies.set(copy, {
        bytes: bodies.get(this).bytes?.slice() ?? null,
        used: false,
      })
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
    request.signal.throwIfAborted()
    const body = bodies.get(request).bytes
    if (input instanceof Request && body !== null && init?.body == null)
      consume(input)
    const payload = {
      url: request.url,
      method: request.method,
      headers: [...request.headers],
      body: body === null ? null : encode64(consume(request)),
      redirect: request.redirect,
    }
    const id = host("fetch", payload)
    return new Promise((resolve, reject) => {
      const abort = () => {
        host("cancel", id)
        pending.delete(id)
        reject(request.signal.reason)
      }
      request.signal.addEventListener("abort", abort, { once: true })
      pending.set(id, {
        resolve,
        reject,
        cleanup: () => request.signal.removeEventListener("abort", abort),
      })
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
    Blob,
    Headers,
    Request,
    Response,
    fetch,
    WebSocket,
  })
  return {
    network(text) {
      const event = parse(text)
      if (event.type === "fetch_response" || event.type === "fetch_error") {
        const item = pending.get(event.id)
        if (!item) return
        pending.delete(event.id)
        item.cleanup()
        if (event.type === "fetch_error") {
          item.reject(new TypeError(event.error))
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
          bodies.set(response, {
            bytes: event.body === null ? null : decode64(event.body),
            used: false,
          })
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
