// Only the exact bound endpoint is used; guest paths never reach the native host.
export function boundFileSystem(binding, fileUrl, signal, fetchFile = fetch) {
  const denied = async () => {
    throw Object.assign(
      new Error("Access outside the bound read-only file is denied"),
      { code: "PERMISSION_DENIED" }
    )
  }
  const name = binding.name
  const active = () => {
    if (signal.aborted)
      throw Object.assign(new Error("The view has closed"), {
        code: "DISPOSED",
      })
  }
  const readBinary = async (path) => {
    active()
    if (path !== name && path !== `./${name}`) return denied()
    const response = await fetchFile(fileUrl, {
      signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    })
    if (!response.ok)
      throw new Error("无法读取当前文件，请检查文件是否存在或超过 16 MiB")
    const bytes = new Uint8Array(await response.arrayBuffer())
    active()
    if (bytes.length > 16 * 1024 * 1024) throw new Error("File exceeds 16 MiB")
    return bytes
  }
  return {
    readBinary,
    async readText(path) {
      const bytes = await readBinary(path)
      if (bytes.length > 2 * 1024 * 1024) throw new Error("Text exceeds 2 MiB")
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    },
    writeText: denied,
    writeBinary: denied,
    delete: denied,
    rename: denied,
  }
}

export async function mountSnapshot(mount, root, binding, snapshot, fileUrl) {
  const controller = new AbortController()
  const subscriptions = new Set()
  const denied = async () => {
    throw Object.assign(new Error("This view is read-only"), {
      code: "PERMISSION_DENIED",
    })
  }
  const active = () => {
    if (controller.signal.aborted)
      throw Object.assign(new Error("The view has closed"), {
        code: "DISPOSED",
      })
  }
  const read = async () => {
    active()
    return { ...snapshot }
  }
  const ctx = {
    binding: { kind: "file", file: binding },
    signal: controller.signal,
    subscriptions: {
      add(value) {
        if (controller.signal.aborted) value.dispose()
        else subscriptions.add(value)
        return value
      },
    },
    capabilities: {
      document: {
        read,
        async observe() {
          return { snapshot: await read(), subscription: { dispose() {} } }
        },
        edit: denied,
        save: denied,
        undo: denied,
        redo: denied,
      },
      ui: {
        async notify(message) {
          active()
          document.getElementById("notice").textContent = String(message).slice(
            0,
            1000
          )
        },
      },
    },
  }
  if (!snapshot) {
    delete ctx.capabilities.document
    ctx.capabilities.fs = boundFileSystem(binding, fileUrl, controller.signal)
  }
  const dispose = () => {
    controller.abort()
    for (const value of subscriptions) {
      try {
        value.dispose()
      } catch {}
    }
    subscriptions.clear()
  }
  window.addEventListener("pagehide", dispose, { once: true })
  try {
    const result = await mount(ctx, root)
    if (result) {
      if (controller.signal.aborted) result.dispose()
      else subscriptions.add(result)
    }
  } catch (error) {
    dispose()
    root.textContent = `无法打开插件：${error.message}`
  }
}
