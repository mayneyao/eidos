import type {
  Activate,
  ActionContext,
  Disposable,
  TextDocument,
  FormatterProvider,
  TableActionProvider,
  TableActionContext,
} from "./contracts"
import { viewHtml } from "./sandbox"
import { loadTypeScript } from "./toolchain"

/** Runs only inside the isolated extension iframe. No host object is captured. */
function activateGuest(
  activate: Activate,
  declared: string[],
  declaredFormatters: string[]
) {
  const parent = window.parent
  const lifetime = new AbortController()
  const owned = new Set<Disposable>()
  const handlers = new Map<
    string,
    (ctx: ActionContext) => void | Promise<void>
  >()
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const observers = new Map<string, (value: unknown) => void>()
  const runs = new Map<string, () => void>()
  let activated = false
  const formatters = new Map<string, FormatterProvider>()
  const tableProviders = new Map<string, TableActionProvider>()
  const failure = (code: string, message: string) =>
    Object.assign(new Error(message), { code })
  const call = <T>(method: string, params: unknown = null): Promise<T> => {
    if (lifetime.signal.aborted)
      return Promise.reject(failure("INSTANCE_CLOSED", "Extension closed"))
    if (pending.size >= 64)
      return Promise.reject(
        failure("INVALID_REQUEST", "Too many pending requests")
      )
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          pending.delete(id)
          reject(failure("TIMEOUT", "Host request timed out"))
        },
        method === "table.task.preview" ? 10 * 60 * 1000 : 30000
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
  const unavailable = async (): Promise<never> => {
    throw failure("UNSUPPORTED_API", "Capability unavailable")
  }
  const settings = {
    get: unavailable,
    update: unavailable,
    reset: unavailable,
    observe: unavailable,
  }
  const dispose = (items: Set<Disposable>) => {
    for (const item of items) {
      try {
        item.dispose()
      } catch {}
    }
    items.clear()
  }
  const run = async (value: {
    invocation: string
    action: string
    kind: "workspace" | "document"
  }) => {
    const controller = new AbortController(),
      subscriptions = new Set<Disposable>()
    const own = <T extends Disposable>(item: T): T => {
      if (controller.signal.aborted) item.dispose()
      else subscriptions.add(item)
      return item
    }
    const close = () => {
      controller.abort()
      dispose(subscriptions)
      runs.delete(value.invocation)
    }
    runs.set(value.invocation, close)
    const invoke = <T>(method: string, args: unknown = null): Promise<T> =>
      controller.signal.aborted
        ? Promise.reject(failure("INSTANCE_CLOSED", "Action finished"))
        : call(method, { invocation: value.invocation, args })
    const document: TextDocument = {
      read: () => invoke("document.read"),
      edit: (change) => invoke("document.edit", change),
      save: () => invoke("document.save"),
      undo: () => invoke("document.undo"),
      redo: () => invoke("document.redo"),
      async observe(listener, onError) {
        const id = crypto.randomUUID()
        let ready = false,
          active = true
        const queue: unknown[] = []
        const subscription = own({
          dispose() {
            if (!active) return
            active = false
            observers.delete(id)
            void invoke("document.unobserve", { id }).catch(() => {})
          },
        })
        const deliver = (snapshot: unknown) => {
          if (!active) return
          if (!ready) {
            if (queue.length < 64) queue.push(snapshot)
            else {
              subscription.dispose()
              onError?.({ code: "IO_ERROR", message: "Observation overflow" })
            }
            return
          }
          try {
            listener(snapshot as Awaited<ReturnType<TextDocument["read"]>>)
          } catch {
            subscription.dispose()
            onError?.({ code: "IO_ERROR", message: "Observation failed" })
          }
        }
        observers.set(id, deliver)
        try {
          const snapshot = await invoke<
            Awaited<ReturnType<TextDocument["read"]>>
          >("document.observe", { id })
          setTimeout(() => {
            ready = true
            for (const state of queue.splice(0)) deliver(state)
          }, 0)
          return { snapshot, subscription }
        } catch (error) {
          subscription.dispose()
          throw error
        }
      },
    }
    const ctx: ActionContext = {
      binding:
        value.kind === "document"
          ? { kind: "document", document }
          : { kind: "workspace" },
      signal: controller.signal,
      subscriptions: { add: own },
      settings,
      resources: {
        text: unavailable,
        directory: unavailable,
        eidos: unavailable,
        output: unavailable,
      },
      ui: {
        notify: (message) => invoke("ui.notify", { message }),
        select: unavailable,
        confirm: unavailable,
        navigate: (viewId, route) =>
          invoke("ui.navigate", {
            viewId,
            ...(route === undefined ? {} : { route }),
          }),
        resolveAsset: unavailable,
        openLink: unavailable,
      },
    }
    let error: string | undefined
    try {
      const handler = handlers.get(value.action)
      if (!activated || !handler)
        throw failure("INVALID_REQUEST", "Action is not registered")
      await handler(ctx)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      close()
    }
    await call("action.complete", {
      invocation: value.invocation,
      ...(error ? { error: error.slice(0, 4096) } : {}),
    }).catch(() => {})
  }
  const receive = (event: MessageEvent) => {
    const message = event.data
    if (
      event.source !== parent ||
      message?.protocol !== "eidos-plugin" ||
      message.apiVersion !== 1
    )
      return
    if (message.observation === "formatter.run") {
      const value = message.value
      const controller = new AbortController()
      runs.set(value.invocation, () => controller.abort())
      void (async () => {
        try {
          const provider = formatters.get(value.formatter)
          if (!activated || !provider)
            throw failure("INVALID_REQUEST", "Formatter unavailable")
          const result = await provider.format({
            text: value.text,
            path: value.path,
            signal: controller.signal,
          })
          if (!controller.signal.aborted)
            await call("formatter.complete", {
              invocation: value.invocation,
              text: result.text,
            })
        } catch (error) {
          if (!controller.signal.aborted)
            await call("formatter.complete", {
              invocation: value.invocation,
              error: String(error).slice(0, 4096),
            }).catch(() => {})
        } finally {
          controller.abort()
          runs.delete(value.invocation)
        }
      })()
      return
    }
    if (message.observation === "host.tableAction.abort") {
      runs.get(message.value)?.()
      return
    }
    if (message.observation === "host.tableAction") {
      const value = message.value
      const controller = new AbortController()
      runs.set(value.id, () => controller.abort())
      const invoke = <T>(method: string, args: unknown = null): Promise<T> => {
        controller.signal.throwIfAborted()
        return call(method, { runId: value.id, args })
      }
      const context: TableActionContext = {
        signal: controller.signal,
        table: {
          tableId: value.tableId,
          viewId: value.viewId,
          read: () => invoke("table.read"),
          pluginConfig: {
            read: () => invoke("table.pluginConfig.read"),
          },
        },
        target: {
          count: value.count,
          read: (input) => invoke("table.target.read", input),
          update: (input) => invoke("table.target.update", input),
        },
        connections: {
          request: (input) => invoke("table.connection.request", input),
        },
        task: {
          preview: (rows) => invoke("table.task.preview", { rows }),
          report: (progress) => invoke("table.task.report", progress),
        },
      }
      void (async () => {
        try {
          const provider = tableProviders.get(value.provider)
          if (!activated || !provider)
            throw new Error("Table action provider unavailable")
          const items =
            value.operation === "list"
              ? await provider.getItems(context)
              : (await provider.run(context, value.itemId), undefined)
          await call("table.actions.result", {
            runId: value.id,
            ...(items ? { items } : {}),
          })
        } catch (error) {
          await call("table.actions.result", {
            runId: value.id,
            error: String(error).slice(0, 4096),
          }).catch(() => {})
        } finally {
          controller.abort()
          runs.delete(value.id)
        }
      })()
      return
    }
    if (message.observation === "action.run") {
      void run(message.value)
      return
    }
    if (message.observation === "action.abort") {
      runs.get(message.value)?.()
      return
    }
    if (typeof message.observation === "string") {
      observers.get(message.observation)?.(message.value)
      return
    }
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error)
      request.reject(failure(message.error.code, message.error.message))
    else request.resolve(message.result)
  }
  window.addEventListener("message", receive)
  window.addEventListener(
    "pagehide",
    () => {
      lifetime.abort()
      for (const close of runs.values()) close()
      dispose(owned)
      window.removeEventListener("message", receive)
      for (const request of pending.values()) {
        clearTimeout(request.timer)
        request.reject(failure("INSTANCE_CLOSED", "Extension closed"))
      }
      pending.clear()
      observers.clear()
      handlers.clear()
    },
    { once: true }
  )
  const own = <T extends Disposable>(item: T): T => {
    if (lifetime.signal.aborted) item.dispose()
    else owned.add(item)
    return item
  }
  void Promise.resolve()
    .then(() =>
      activate({
        signal: lifetime.signal,
        subscriptions: { add: own },
        settings,
        formatters: {
          register(id, provider) {
            if (
              activated ||
              !declaredFormatters.includes(id) ||
              formatters.has(id) ||
              typeof provider.format !== "function"
            )
              throw failure("INVALID_REQUEST", "Invalid formatter registration")
            formatters.set(id, provider)
            return own({
              dispose() {
                if (!formatters.delete(id)) return
                if (activated)
                  void call("extension.unregister", {
                    id,
                    kind: "formatter",
                  }).catch(() => {})
              },
            })
          },
        },
        actions: {
          registerTableProvider(id, provider) {
            if (
              activated ||
              !declared.includes(id) ||
              handlers.has(id) ||
              typeof provider.getItems !== "function" ||
              typeof provider.run !== "function"
            )
              throw failure("INVALID_REQUEST", "Invalid table provider")
            tableProviders.set(id, provider)
            handlers.set(id, unavailable)
            return own({
              dispose() {
                tableProviders.delete(id)
                if (handlers.delete(id) && activated)
                  void call("extension.unregister", { id }).catch(() => {})
              },
            })
          },
          register(id, handler) {
            if (
              activated ||
              !declared.includes(id) ||
              handlers.has(id) ||
              typeof handler !== "function"
            )
              throw failure("INVALID_REQUEST", "Invalid action registration")
            handlers.set(id, handler)
            return own({
              dispose() {
                if (!handlers.delete(id)) return
                if (activated)
                  void call("extension.unregister", { id }).catch(() => {})
              },
            })
          },
        },
      })
    )
    .then(async (cleanup) => {
      if (cleanup) own(cleanup)
      if (
        handlers.size !== declared.length ||
        formatters.size !== declaredFormatters.length
      )
        throw failure(
          "INVALID_REQUEST",
          "Activation did not register every action"
        )
      activated = true
      await call("extension.ready", {
        actions: [...handlers.keys()],
        formatters: [...formatters.keys()],
      })
      if (tableProviders.size)
        await call("table.actions.ready", {
          providers: [...tableProviders.keys()],
        })
    })
    .catch(async (cause) => {
      dispose(owned)
      handlers.clear()
      formatters.clear()
      await call("extension.failed", {
        message: String(cause).slice(0, 4096),
      }).catch(() => {})
    })
}

export function extensionHtml(
  code: string,
  actions: string[],
  formatters: string[] = []
): string {
  // The view bootstrap supplies transport for its own mount only. The extension
  // bootstrap uses a separate channel state and never exposes a DOM root to Activate.
  const ts = loadTypeScript()
  const compiled = ts.transpileModule(code, {
    fileName: "extension.js",
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      allowJs: true,
    },
  }).outputText
  const adapter = `const activate = (() => { const exports = {}; ${compiled}; return exports.default; })(); export default function mount() { (${activateGuest.toString()})(activate, ${JSON.stringify(actions)}, ${JSON.stringify(formatters)}); }`
  return viewHtml(adapter, { kind: "page", route: "" })
}
