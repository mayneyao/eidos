// Pure extension activation for native QuickJS hosts. No filesystem, DOM, network,
// SQLite, timers or module loader is exposed to the plugin.
globalThis.__eidosRunFileHook = async (activate, input) => {
  const handlers = new Map()
  const owned = new Set()
  const signal = Object.freeze({
    aborted: false,
    addEventListener() {},
    removeEventListener() {},
    throwIfAborted() {},
  })
  let active = false
  const register = (id, handler) => {
    if (
      active ||
      !input.hooks.includes(id) ||
      handlers.has(id) ||
      typeof handler !== "function"
    )
      throw new Error("Invalid hook registration")
    handlers.set(id, handler)
    return {
      dispose() {
        handlers.delete(id)
      },
    }
  }
  const unavailable = () => {
    throw new Error("Capability unavailable in a file hook")
  }
  const registrations = { actions: new Set(), formatters: new Set() }
  const contribution = (kind) => ({
    register(id, handler) {
      if (
        kind === "actions"
          ? typeof handler !== "function"
          : typeof handler?.format !== "function"
      )
        throw new Error("Invalid contribution handler")
      if (active || !input[kind].includes(id) || registrations[kind].has(id))
        throw new Error("Invalid contribution registration")
      registrations[kind].add(id)
      return {
        dispose() {
          registrations[kind].delete(id)
        },
      }
    },
    registerTableProvider(id, provider) {
      if (
        kind !== "actions" ||
        typeof provider?.getItems !== "function" ||
        typeof provider?.run !== "function"
      )
        unavailable()
      return contribution(kind).register(id, provider.run)
    },
  })
  try {
    const extension = await activate({
      signal,
      capabilities: {
        hooks: { register },
        actions: contribution("actions"),
        formatters: contribution("formatters"),
      },
      subscriptions: {
        add(item) {
          owned.add(item)
          return item
        },
      },
    })
    if (extension && typeof extension.dispose === "function")
      owned.add(extension)
    active = true
    if (
      handlers.size !== input.hooks.length ||
      registrations.actions.size !== input.actions.length ||
      registrations.formatters.size !== input.formatters.length
    )
      throw new Error("Activation must register every contribution")
    const handler = handlers.get(input.hook)
    if (!handler) throw new Error("Hook is not registered")
    const event = Object.freeze({
      ...input.event,
      document: Object.freeze({ ...input.event.document }),
    })
    const result = await handler({
      event,
      signal,
      settings: Object.freeze({ ...input.settings }),
    })
    return JSON.stringify({ plan: result ?? null })
  } finally {
    for (const item of owned) {
      try {
        item.dispose()
      } catch {}
    }
  }
}
