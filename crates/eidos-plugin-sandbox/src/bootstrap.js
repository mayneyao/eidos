;(() => {
  const emit = globalThis.__emit
  const schedule = globalThis.__schedule
  const cancel = globalThis.__cancel
  const stop = globalThis.__stop
  delete globalThis.__emit
  delete globalThis.__schedule
  delete globalThis.__cancel
  delete globalThis.__stop

  const stringify = JSON.stringify
  const parse = JSON.parse
  const timers = new Map()
  const listeners = new Set()
  let nextId = 1
  let closed = false

  globalThis.self = globalThis
  globalThis.onmessage = null
  globalThis.console = Object.freeze(
    Object.fromEntries(
      ["log", "info", "warn", "error", "debug"].map((level) => [
        level,
        (...args) => {
          const text = args
            .map((value) => {
              if (typeof value === "string") return value
              try {
                return stringify(value) ?? String(value)
              } catch {
                return String(value)
              }
            })
            .join(" ")
          if (!emit(level, text))
            throw new Error("Output limit or output I/O failure")
        },
      ])
    )
  )

  globalThis.postMessage = (value) => {
    if (closed) return
    const text = stringify(value)
    if (text === undefined)
      throw new TypeError("postMessage requires JSON-serializable data")
    if (!emit("message", text))
      throw new Error("Output limit or output I/O failure")
  }
  globalThis.addEventListener = (type, listener) => {
    if (type !== "message")
      throw new TypeError(
        "Only message listeners are supported in this preview"
      )
    if (typeof listener !== "function")
      throw new TypeError("Listener must be a function")
    listeners.add(listener)
  }
  globalThis.removeEventListener = (type, listener) => {
    if (type === "message") listeners.delete(listener)
  }
  globalThis.queueMicrotask = (callback) => {
    if (typeof callback !== "function")
      throw new TypeError("Callback must be a function")
    Promise.resolve().then(callback)
  }

  function createTimer(callback, delay, repeat, args) {
    if (closed) return 0
    if (typeof callback !== "function")
      throw new TypeError("String timer callbacks are not supported")
    const number = Number(delay ?? 0)
    const ms = Number.isFinite(number)
      ? Math.max(0, Math.min(2147483647, Math.trunc(number)))
      : 0
    if (nextId > 4294967295) throw new RangeError("Timer ID limit reached")
    const id = nextId++
    if (!schedule(id, ms)) throw new RangeError("Timer limit reached")
    timers.set(id, { callback, delay: ms, repeat, args })
    return id
  }
  globalThis.setTimeout = (callback, delay, ...args) =>
    createTimer(callback, delay, false, args)
  globalThis.setInterval = (callback, delay, ...args) =>
    createTimer(callback, delay, true, args)
  globalThis.clearTimeout = globalThis.clearInterval = (id) => {
    if (timers.delete(id)) cancel(id)
  }
  globalThis.close = () => {
    closed = true
    timers.clear()
    listeners.clear()
    stop()
  }

  return {
    dispatch(text) {
      if (closed) return
      const event = { type: "message", data: parse(text) }
      if (typeof globalThis.onmessage === "function")
        globalThis.onmessage(event)
      for (const listener of [...listeners]) {
        if (closed) break
        if (listeners.has(listener)) listener.call(globalThis, event)
      }
    },
    fire(id) {
      const timer = timers.get(id)
      if (!timer || closed) return
      if (!timer.repeat) timers.delete(id)
      timer.callback(...timer.args)
      if (timer.repeat && timers.has(id) && !closed) {
        if (!schedule(id, Math.max(1, timer.delay)))
          throw new RangeError("Timer limit reached")
      }
    },
  }
})()
