import type {
  Disposable,
  Mount,
  TextDocument,
  ViewContext,
  PluginManifest,
  ViewCapability,
  FileStat,
  FileMetadata,
} from "./contracts"
export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: eidos-space-media:; font-src data:; media-src blob: eidos-space-media: eidos-media: data:; connect-src eidos-space-media:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts"
export function sandboxCsp(browser?: PluginManifest["browser"]): string {
  const origins = browser?.networkOrigins?.join(" ")
  return SANDBOX_CSP.replace(
    "worker-src 'none'",
    browser?.workers ? "worker-src blob:" : "worker-src 'none'"
  )
    .replace(
      "connect-src eidos-space-media:",
      origins
        ? `connect-src eidos-space-media: ${origins}`
        : "connect-src eidos-space-media:"
    )
    .replace(
      "img-src data: eidos-space-media:",
      `img-src data: eidos-space-media: blob:${origins ? ` ${origins}` : ""}`
    )
    .replace(
      "media-src blob: eidos-space-media: eidos-media: data:",
      `media-src blob: eidos-space-media: eidos-media: data:${origins ? ` ${origins}` : ""}`
    )
}
export type BrowserBinding = {
  capabilities?: ViewCapability[]
  connections?: boolean
} & (
  | { kind: "eidos"; file?: FileMetadata }
  | { kind: "document"; file?: FileMetadata }
  | { kind: "page"; route: string }
  | { kind: "table"; tableId: string; viewId: string }
  | {
      kind: "media"
      path: string
      name: string
      baseName: string
      extension: string
      mimeType: string
      size: number
    }
  | {
      kind: "file"
      path: string
      name: string
      baseName: string
      extension: string
      mimeType?: string
      size: number
    }
)

/** Serialized trusted bootstrap. It must not close over host/module objects. */
export function bootstrap(mount: Mount, binding: BrowserBinding) {
  const parent = window.parent
  const controller = new AbortController()
  const subscriptions = new Set<Disposable>()
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const observers = new Map<string, (value: unknown) => void>()
  const tableObservers = new Set<() => void>()
  const watchTable = (listener: () => void) => {
    tableObservers.add(listener)
    return own({
      dispose() {
        tableObservers.delete(listener)
      },
    })
  }
  const error = (code: string, message: string) =>
    Object.assign(new Error(message), { code })
  let closed = false
  const receive = (event: MessageEvent) => {
    const r = event.data
    if (
      event.source !== parent ||
      !r ||
      r.protocol !== "eidos-plugin" ||
      r.apiVersion !== 1
    )
      return
    if (typeof r.observation === "string") {
      if (
        r.observation === "host.theme" &&
        r.value &&
        typeof r.value === "object"
      ) {
        for (const name of [
          "background",
          "foreground",
          "muted",
          "surface-hover",
          "surface-selected",
          "border",
          "accent",
          "scrollbar-thumb",
          "scrollbar-thumb-hover",
          "scrollbar-thumb-active",
          "font-family",
          "color-scheme",
        ]) {
          const key = `--eidos-${name}`,
            value = r.value[key]
          if (typeof value !== "string" || value.length > 256) continue
          const property =
            name === "font-family"
              ? "font-family"
              : name === "color-scheme"
                ? "color-scheme"
                : "color"
          if (
            CSS.supports(property, value) &&
            !/url\s*\(|var\s*\(/i.test(value)
          )
            window.document.documentElement.style.setProperty(key, value)
        }
        return
      }
      if (r.observation === "host.table") {
        for (const listener of tableObservers) {
          try {
            listener()
          } catch {
            /* One listener must not block others. */
          }
        }
      }
      observers.get(r.observation)?.(r.value)
      return
    }
    const request = pending.get(r.id)
    if (!request) return
    pending.delete(r.id)
    clearTimeout(request.timer)
    if (r.error) request.reject(error(r.error.code, r.error.message))
    else request.resolve(r.result)
  }
  window.addEventListener("message", receive)
  function call<T>(method: string, params: unknown = null): Promise<T> {
    if (closed) return Promise.reject(error("INSTANCE_CLOSED", "View closed"))
    if (pending.size >= 64)
      return Promise.reject(
        error("INVALID_REQUEST", "Too many pending requests")
      )
    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          pending.delete(id)
          reject(error("TIMEOUT", "Host request timed out"))
        },
        method === "eidos.connection.request" ? 95000 : 30000
      )
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })
      parent.postMessage(
        { protocol: "eidos-plugin", apiVersion: 1, id, method, params },
        "*"
      )
    })
  }
  const own = <T extends Disposable>(value: T): T => {
    if (closed) value.dispose()
    else subscriptions.add(value)
    return value
  }
  const document: TextDocument = {
    read: () => call("document.read"),
    edit: (change) => call("document.edit", change),
    save: () => call("document.save"),
    undo: () => call("document.undo"),
    redo: () => call("document.redo"),
    async observe(listener, onError) {
      const id = crypto.randomUUID()
      let initial = false,
        active = true
      const queue: unknown[] = []
      const subscription = own({
        dispose() {
          if (!active) return
          active = false
          observers.delete(id)
          subscriptions.delete(subscription)
          void call("document.unobserve", { id }).catch(() => {})
        },
      })
      const deliver = (value: unknown) => {
        if (!active) return
        if (!initial) {
          if (queue.length < 64) queue.push(value)
          else {
            subscription.dispose()
            onError?.({ code: "IO_ERROR", message: "Observation overflow" })
          }
          return
        }
        try {
          listener(value as Awaited<ReturnType<TextDocument["read"]>>)
        } catch {
          subscription.dispose()
          onError?.({ code: "IO_ERROR", message: "Observation failed" })
        }
      }
      observers.set(id, deliver)
      try {
        const snapshot = await call<Awaited<ReturnType<TextDocument["read"]>>>(
          "document.observe",
          { id }
        )
        setTimeout(() => {
          initial = true
          for (const value of queue.splice(0)) deliver(value)
        }, 0)
        return { snapshot, subscription }
      } catch (cause) {
        subscription.dispose()
        throw cause
      }
    },
  }
  const file: FileMetadata | undefined =
    binding.kind === "media" || binding.kind === "file"
      ? {
          path: binding.path,
          name: binding.name,
          baseName: binding.baseName,
          extension: binding.extension,
          mimeType: binding.mimeType,
          size: binding.size,
        }
      : "file" in binding && binding.file
        ? binding.file
        : undefined
  const assertConfigTable = (tableId: string) => {
    if (!tableId || (binding.kind === "table" && tableId !== binding.tableId))
      throw error("PERMISSION_DENIED", "Config is outside the bound table")
  }
  const context: ViewContext = {
    capabilities: {
      fs: {
        async readText(filePath: string): Promise<string> {
          const res = await call<{ text: string }>("fs.readText", {
            path: filePath,
          })
          return res.text
        },
        writeText(filePath: string, content: string): Promise<void> {
          return call("fs.writeText", { path: filePath, content })
        },
        async readBinary(filePath: string): Promise<Uint8Array> {
          const res = await call<{ data: string }>("fs.readBinary", {
            path: filePath,
          })
          return Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0))
        },
        writeBinary(filePath: string, content: Uint8Array): Promise<void> {
          if (content.byteLength > 16 * 1024 * 1024)
            return Promise.reject(
              error("INVALID_REQUEST", "Binary data exceeds 16 MiB")
            )
          let binary = ""
          for (let offset = 0; offset < content.length; offset += 8192)
            binary += String.fromCharCode(
              ...content.subarray(offset, offset + 8192)
            )
          return call("fs.writeBinary", { path: filePath, data: btoa(binary) })
        },
        delete(filePath: string): Promise<void> {
          return call("fs.delete", { path: filePath })
        },
        rename(oldPath: string, newPath: string): Promise<void> {
          return call("fs.rename", { oldPath, newPath })
        },
        list(
          folder?: string,
          options?: { extensions?: string[] }
        ): Promise<FileStat[]> {
          return call("fs.list", {
            ...(folder !== undefined ? { folder } : {}),
            ...(options?.extensions !== undefined
              ? { extensions: options.extensions }
              : {}),
          })
        },
        stat(filePath: string): Promise<FileStat | null> {
          return call("fs.stat", { path: filePath })
        },
        async getUrl(filePath?: string): Promise<string> {
          const res = await call<{ url: string }>("fs.url", {
            ...(filePath !== undefined ? { path: filePath } : {}),
          })
          return res.url
        },
        async watch(
          pathOrFolder: string,
          listener: () => void
        ): Promise<Disposable> {
          const id = crypto.randomUUID()
          let active = true
          const subscription = own({
            dispose() {
              if (!active) return
              active = false
              observers.delete(id)
              subscriptions.delete(subscription)
              void call("fs.unwatch", { id }).catch(() => {})
            },
          })
          observers.set(id, () => {
            if (!active) return
            try {
              listener()
            } catch {
              subscription.dispose()
            }
          })
          try {
            await call("fs.watch", { id, path: pathOrFolder })
            return subscription
          } catch (cause) {
            subscription.dispose()
            throw cause
          }
        },
      },
      network: {
        async read(request) {
          const result = await call<{
            data: string
            status: number
            etag?: string
          }>("network.read", request)
          return {
            ...result,
            data: Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0)),
          }
        },
      },
      storage: {
        list: (prefix = "") => call("storage.list", { prefix }),
        async read(key) {
          const value = await call<string | null>("storage.read", { key })
          return value === null
            ? null
            : Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
        },
        write(key, value) {
          if (value.byteLength > 4 * 1024 * 1024)
            return Promise.reject(
              error("INVALID_REQUEST", "Storage object exceeds 4 MiB")
            )
          let binary = ""
          for (let offset = 0; offset < value.length; offset += 8192)
            binary += String.fromCharCode(
              ...value.subarray(offset, offset + 8192)
            )
          return call("storage.write", { key, data: btoa(binary) })
        },
        delete: (key) => call("storage.delete", { key }),
      },
      document: binding.kind === "document" ? document : undefined,
      eidos: binding.capabilities?.some((c) => c.startsWith("eidos/"))
        ? {
            schema: binding.capabilities.includes("eidos/schema")
              ? {
                  listTables: () => call("eidos.tables"),
                  readTable: (tableId) => call("eidos.table", { tableId }),
                }
              : undefined,
            table:
              binding.kind === "table" &&
              binding.capabilities.includes("eidos/table")
                ? {
                    tableId: binding.tableId,
                    viewId: binding.viewId,
                    readContext: () => call("table.readContext"),
                    readRows: (options) => call("table.readRows", options),
                    aggregate: (options) => call("table.aggregate", options),
                    setViewConfig: (config) =>
                      call("table.setViewConfig", config),
                    openRecord: (rowId) => call("table.openRecord", { rowId }),
                    watch: watchTable,
                  }
                : undefined,
            config: binding.capabilities.includes("eidos/config")
              ? {
                  read: (tableId) => {
                    assertConfigTable(tableId)
                    return binding.kind === "table"
                      ? call("table.pluginConfig.read")
                      : call("eidos.pluginConfig.read", { tableId })
                  },
                  write: (tableId, input) => {
                    assertConfigTable(tableId)
                    return binding.kind === "table"
                      ? call("table.pluginConfig.write", input)
                      : call("eidos.pluginConfig.write", { tableId, ...input })
                  },
                  watch: (tableId, listener) => {
                    assertConfigTable(tableId)
                    return watchTable(listener)
                  },
                }
              : undefined,
          }
        : undefined,
      connections: binding.connections
        ? {
            isConfigured: (connection) =>
              call("eidos.connection.status", { connection }),
            request: (input) => call("eidos.connection.request", input),
          }
        : undefined,
      settings: {
        get: (key) => call("settings.get", { key }),
      },
      ui: {
        notify: (message) => call("ui.notify", { message }),
        openFile: (relativePath) => call("ui.openFile", { relativePath }),
        navigate: (viewId, route) =>
          call("ui.navigate", {
            viewId,
            ...(route === undefined ? {} : { route }),
          }),
      },
    },
    binding:
      binding.kind === "page"
        ? { kind: "page", route: binding.route }
        : {
            kind: "file",
            file: { id: file?.path ?? "current", ...file },
            ...(binding.kind === "table"
              ? {
                  location: {
                    kind: "eidos-table" as const,
                    tableId: binding.tableId,
                    viewId: binding.viewId,
                  },
                }
              : {}),
          },
    signal: controller.signal,
    subscriptions: { add: own },
  }
  window.addEventListener(
    "pagehide",
    () => {
      closed = true
      controller.abort()
      for (const item of subscriptions) {
        try {
          item.dispose()
        } catch {
          /* continue cleanup */
        }
      }
      subscriptions.clear()
      observers.clear()
      tableObservers.clear()
      window.removeEventListener("message", receive)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(error("INSTANCE_CLOSED", "View closed"))
      }
      pending.clear()
    },
    { once: true }
  )
  void Promise.resolve()
    .then(() => mount(context, window.document.getElementById("app")!))
    .then((cleanup) => {
      if (cleanup) own(cleanup)
      return call("view.ready")
    })
    .catch((cause) => {
      const node = window.document.createElement("p")
      node.setAttribute("role", "alert")
      node.textContent = cause instanceof Error ? cause.message : String(cause)
      window.document.getElementById("app")?.replaceChildren(node)
    })
}
