import { browserModule } from "./browser-module"
import type {
  Disposable,
  Mount,
  TextDocument,
  ViewContext,
  PluginManifest,
  TableContext,
  EidosFileContext,
} from "./contracts"
export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts"
export function sandboxCsp(browser?: PluginManifest["browser"]): string {
  const origins = browser?.networkOrigins?.join(" ")
  return SANDBOX_CSP.replace(
    "worker-src 'none'",
    browser?.workers ? "worker-src blob:" : "worker-src 'none'"
  )
    .replace(
      "connect-src 'none'",
      origins ? `connect-src ${origins}` : "connect-src 'none'"
    )
    .replace(
      "img-src data:",
      `img-src data: blob:${origins ? ` ${origins}` : ""}`
    )
}
type BrowserBinding =
  | { kind: "eidos" }
  | { kind: "document" }
  | { kind: "page"; route: string }
  | { kind: "table"; tableId: string; viewId: string }

/** Serialized trusted bootstrap. It must not close over host/module objects. */
function bootstrap(mount: Mount, binding: BrowserBinding) {
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
  const observeTable = (listener: () => void) => {
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
  const unavailable = async (): Promise<never> => {
    throw error("UNSUPPORTED_API", "This host has not enabled this capability")
  }
  const context: ViewContext = {
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
      remove: (key) => call("storage.remove", { key }),
    },
    binding:
      binding.kind === "eidos"
        ? {
            kind: "eidos",
            file: {
              connections: {
                configured: (connection: string) =>
                  call("eidos.connection.status", { connection }),
                request: (input) => call("eidos.connection.request", input),
              },
              listTables: () => call("eidos.tables"),
              readTable: (tableId: string) => call("eidos.table", { tableId }),
              readPluginConfig: (tableId: string) =>
                call("eidos.pluginConfig.read", { tableId }),
              writePluginConfig: (tableId: string, input) =>
                call("eidos.pluginConfig.write", { tableId, ...input }),
            } satisfies EidosFileContext,
          }
        : binding.kind === "document"
          ? { kind: "document", document }
          : binding.kind === "table"
            ? {
                kind: "table",
                table: {
                  tableId: binding.tableId,
                  viewId: binding.viewId,
                  pluginConfig: {
                    read: () => call("table.pluginConfig.read"),
                    write: (input) => call("table.pluginConfig.write", input),
                    observe: observeTable,
                  },
                  read: () => call("table.read"),
                  getPage: (options) => call("table.page", options),
                  aggregate: (options) => call("table.aggregate", options),
                  updateProperties: (properties) =>
                    call("table.properties", properties),
                  openRecord: (rowId) => call("table.openRecord", { rowId }),
                  observe: observeTable,
                } satisfies TableContext,
              }
            : binding,
    signal: controller.signal,
    subscriptions: { add: own },
    resources: {
      text: unavailable,
      directory: unavailable,
      eidos: unavailable,
      output: unavailable,
    },
    settings: {
      get: (key) => call("settings.get", { key }),
      update: unavailable,
      reset: unavailable,
      observe: unavailable,
    },
    ui: {
      openOrCreateMarkdown: unavailable,
      listMarkdownFiles: (folder) => call("ui.listMarkdownFiles", { folder }),
      countMarkdownLines: (paths) => call("ui.countMarkdownLines", { paths }),
      async observeMarkdownFiles(folder, listener) {
        const id = crypto.randomUUID()
        let active = true
        const subscription = own({
          dispose() {
            if (!active) return
            active = false
            observers.delete(id)
            subscriptions.delete(subscription)
            void call("ui.unobserveMarkdownFiles", { id }).catch(() => {})
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
          await call("ui.observeMarkdownFiles", { id, folder })
          return subscription
        } catch (cause) {
          subscription.dispose()
          throw cause
        }
      },
      openMarkdownFile: (relativePath) =>
        call("ui.openMarkdownFile", { relativePath }),
      notify: (message) => call("ui.notify", { message }),
      select: unavailable,
      confirm: unavailable,
      navigate: (viewId, route) =>
        call("ui.navigate", {
          viewId,
          ...(route === undefined ? {} : { route }),
        }),
      resolveAsset: unavailable,
      openLink: unavailable,
    },
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

export function documentViewHtml(code: string): string {
  return viewHtml(code, { kind: "document" })
}

export function viewHtml(code: string, binding: BrowserBinding): string {
  // Archive modules are validated self-contained ESM. CommonJS here is only a
  // local exports object inside the iframe closure; no require/Node is supplied.
  const compiled = browserModule(code)
  const script = `(()=>{const module = {exports: {}}; const exports = module.exports;\n${compiled}\n(${bootstrap.toString()})(module.exports.default, ${JSON.stringify(binding)});})()`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html{color-scheme:var(--eidos-color-scheme,light);background:var(--eidos-background,transparent);}
html,body,#app{width:100%;height:100%;margin:0;padding:0;}
*::-webkit-scrollbar{width:15px;height:15px;}
*::-webkit-scrollbar-track,*::-webkit-scrollbar-corner,*::-webkit-resizer{background:transparent;}
*::-webkit-scrollbar-thumb{min-width:2.5rem;min-height:2.5rem;border:3px solid transparent;border-radius:999px;background:var(--eidos-scrollbar-thumb,color-mix(in oklab,var(--eidos-foreground,currentColor) 14%,transparent));background-clip:padding-box;}
*::-webkit-scrollbar-thumb:hover{background-color:var(--eidos-scrollbar-thumb-hover,color-mix(in oklab,var(--eidos-foreground,currentColor) 24%,transparent));}
*::-webkit-scrollbar-thumb:active{background-color:var(--eidos-scrollbar-thumb-active,color-mix(in oklab,var(--eidos-foreground,currentColor) 34%,transparent));}
*::-webkit-scrollbar-button{display:none;width:0;height:0;}
</style></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}
