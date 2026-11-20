import { viewHtml } from "../../plugin-runtime/src/sandbox"
import {
  sandboxCsp,
  type BrowserBinding,
} from "../../plugin-runtime/src/browser-bootstrap"
import { extensionHtml } from "../../plugin-runtime/src/extension-sandbox"
import { parseRequest, type PluginRequest } from "../../plugin-runtime/src/rpc"
import { validateSetting } from "../../plugin-runtime/src/manifest"
import { pluginLanguageData } from "../../plugin-runtime/src/i18n"
import { PluginError } from "../../plugin-runtime/src/errors"
import { Scope } from "../../plugin-runtime/src/lifecycle"
import {
  WorkingCopy,
  type DiskSnapshot,
} from "../../plugin-runtime/src/working-copy"
import { getMobileLocaleTag } from "./locale"
import type {
  PluginManifest,
  TextDocument,
  TextSnapshot,
  ViewDeclaration,
} from "../../plugin-runtime/src/contracts"
import { fileViewRequest } from "../../eidos-file-ui/src/plugin-file-request"
import { TableActionSession } from "../../eidos-file-ui/src/plugin-table-action-session"
import type {
  EidosFileDataSource,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
  EidosFileRowQuery,
  LogicalValue,
  JsonObject,
} from "@eidos.space/eidos-file"

export type NativeRequest = <T>(
  method: string,
  params?: Record<string, unknown>
) => Promise<T>
export type Program = {
  format?: number
  manifest: PluginManifest
  modules: Record<string, string>
  resources?: Record<string, string>
}
export type TableBinding = {
  source: EidosFileDataSource
  table: EidosFileTableSnapshot
  view: EidosFileViewInfo
  query: EidosFileRowQuery
}
export const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("无效请求")
  return v as Record<string, unknown>
}
export function spacePath(value: unknown, folder = false): string {
  if (typeof value !== "string") throw new Error("无效路径")
  const path = value.replace(/^\.\//, "")
  if (folder && !path) return ""
  if (
    !path ||
    path.length > 4096 ||
    /[\\\\:\u0000-\u001f]/.test(path) ||
    path.split("/").some((p) => !p || p.startsWith("."))
  )
    throw new Error("不能访问 Space 外部或内部文件")
  return path
}

export function joinAbortSignals(signals: Iterable<AbortSignal>): AbortSignal {
  const sources = [...signals]
  if (sources.some((signal) => !(signal instanceof AbortSignal)))
    throw new TypeError("Expected AbortSignal instances")
  const controller = new AbortController()
  const aborted = sources.find((signal) => signal.aborted)
  if (aborted) controller.abort(aborted.reason)
  else {
    for (const source of sources)
      source.addEventListener("abort", () => controller.abort(source.reason), {
        once: true,
        signal: controller.signal,
      })
  }
  return controller.signal
}

/** Guest code has an opaque origin and only receives this instance's RPC authority. */
export class MobilePluginInstance {
  private disposed = false
  private pending = 0
  private observers = new Map<string, ReturnType<typeof setInterval>>()
  private documentObservers = new Map<string, Scope>()
  private readonly documentScope = new Scope()
  private documentCopy?: Promise<{ copy: WorkingCopy; document: TextDocument }>
  private documentPoll?: ReturnType<typeof setInterval>
  private documentDirty = false
  private run: {
    id: string
    action: string
    session?: TableActionSession
    operation?: string
  } | null = null
  private actionResult: {
    resolve(value: unknown): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private loaded = false
  private connected = false
  readonly frame = document.createElement("iframe")
  readonly manifest: PluginManifest
  constructor(
    readonly program: Program,
    readonly native: NativeRequest,
    readonly options: {
      path?: string
      table?: TableBinding
      view?: ViewDeclaration
      extension?: boolean
      notify(message: string): void
      navigate(viewId: string, route?: string): void
      openFile(path: string): Promise<void>
      ready?(): void
      route?: string
      theme?: Record<string, string>
      confirm(message: string): Promise<boolean>
      openRecord?(id: string): Promise<void>
      canMutate?(): boolean
      documentChanged?(snapshot: TextSnapshot): void
    }
  ) {
    this.manifest = program.manifest
    const metadata = options.path
      ? {
          id: options.path,
          path: options.path,
          name: options.path.split("/").pop()!,
          baseName: options.path
            .split("/")
            .pop()!
            .replace(/\.[^.]+$/, ""),
          extension: "." + options.path.split(".").pop(),
          size: 0,
        }
      : undefined
    const view = options.view
    const binding: BrowserBinding =
      options.table && view?.capabilities?.includes("eidos/table")
        ? {
            kind: "table",
            tableId: options.table.table.table.id,
            viewId: options.table.view.id,
            capabilities: view?.capabilities,
            connections: !!this.manifest.connections,
          }
        : view?.kind === "page"
          ? {
              kind: "page",
              route: options.route ?? "",
              connections: !!this.manifest.connections,
            }
          : view?.capabilities?.includes("document")
            ? { kind: "document", file: metadata }
            : view?.capabilities?.some((c) => c.startsWith("eidos/"))
              ? {
                  kind: "eidos",
                  file: metadata,
                  capabilities: view.capabilities,
                  connections: !!this.manifest.connections,
                }
              : { kind: "file", ...metadata! }
    const languageData = pluginLanguageData(program.manifest, program.resources)
    const locale = getMobileLocaleTag()
    const html = options.extension
      ? extensionHtml(
          program.modules[this.manifest.extension!],
          (this.manifest.actions ?? []).map((a) => a.id),
          [],
          (this.manifest.hooks ?? []).map((h) => h.id),
          false,
          languageData,
          locale
        )
      : viewHtml(program.modules[view!.entry], {
          ...binding,
          languageData,
          locale,
        })
    // The nested document cannot access native bridges, cookies or its host DOM.
    this.frame.sandbox.add("allow-scripts")
    this.frame.setAttribute("referrerpolicy", "no-referrer")
    this.frame.title = view?.title ?? this.manifest.name
    this.frame.style.cssText = options.extension
      ? "display:none"
      : "display:block;width:100%;height:100%;border:0;min-height:0"
    const csp = sandboxCsp(this.manifest.browser).replace(
      "; sandbox allow-scripts",
      ""
    )
    const diagnostics = `<script>addEventListener('error',e=>parent.postMessage({protocol:'eidos-mobile-diagnostic',message:e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({protocol:'eidos-mobile-diagnostic',message:String(e.reason)},'*'));</script>`
    // Older Android system WebViews lack this DOM API already used by installed plugins.
    const compatibility = `<script>if (!AbortSignal.any) Object.defineProperty(AbortSignal, 'any', {configurable:true,writable:true,value:(${joinAbortSignals.toString()})});</script>`
    this.frame.srcdoc = html
      .replace("</head>", diagnostics + compatibility + "</head>")
      .replace(
        "<head>",
        '<head><meta http-equiv="Content-Security-Policy" content="' +
          csp.replace(/"/g, "&quot;") +
          '">'
      )
    const nonce = document.querySelector<HTMLMetaElement>(
      'meta[name="eidos-plugin-nonce"]'
    )?.content
    if (nonce && /^[a-zA-Z0-9-]+$/.test(nonce)) {
      const document = new DOMParser().parseFromString(
        this.frame.srcdoc,
        "text/html"
      )
      for (const script of document.querySelectorAll("script"))
        script.setAttribute("nonce", nonce)
      this.frame.srcdoc = "<!doctype html>" + document.documentElement.outerHTML
    }
    this.frame.addEventListener("load", () => {
      if (this.loaded) {
        this.dispose()
        options.notify("插件页面已离开，请重新打开")
      }
      this.loaded = true
    })
    window.addEventListener("message", this.receive)
  }
  private send(observation: string, value: unknown) {
    if (!this.disposed)
      this.frame.contentWindow?.postMessage(
        { protocol: "eidos-plugin", apiVersion: 1, observation, value },
        "*"
      )
  }
  refresh() {
    this.send("host.table", null)
  }
  private receive = (event: MessageEvent) => {
    if (
      this.disposed ||
      event.source !== this.frame.contentWindow ||
      this.pending >= 64
    )
      return
    if (event.data?.protocol === "eidos-mobile-diagnostic") {
      this.options.notify(
        "插件启动或运行失败：" + String(event.data.message).slice(0, 1000)
      )
      return
    }
    let request: PluginRequest
    try {
      request = parseRequest(event.data)
    } catch {
      return
    }
    this.pending++
    void this.handle(request)
      .then(
        (result) => ({ result: result ?? null }),
        (error) => ({
          error: {
            code:
              error instanceof PluginError ? error.code : "PERMISSION_DENIED",
            message: error instanceof Error ? error.message : String(error),
          },
        })
      )
      .then((response) => {
        this.pending--
        if (!this.disposed)
          this.frame.contentWindow?.postMessage(
            {
              protocol: "eidos-plugin",
              apiVersion: 1,
              id: request.id,
              ...response,
            },
            "*"
          )
      })
  }
  private get documentPath() {
    const { path, view } = this.options
    return path &&
      view?.kind === "file" &&
      view.capabilities?.includes("document") &&
      !/\.eidos$/i.test(path)
      ? path
      : undefined
  }
  get hasUnsavedDocument() {
    return this.documentDirty
  }
  private updateDocument(copy: WorkingCopy) {
    const snapshot = copy.snapshot()
    this.documentDirty = snapshot.dirty
    if (!this.disposed) this.options.documentChanged?.(snapshot)
  }
  private openDocument() {
    this.documentScope.assertActive()
    const path = this.documentPath
    if (!path) throw new Error("没有文档权限")
    if (this.documentCopy) return this.documentCopy
    const read = async (): Promise<DiskSnapshot> => {
      const value = await this.native<{
        text: string
        digest: string
        bom?: boolean
      }>("readText", { path })
      const prefixed = value.text.startsWith("\uFEFF")
      return {
        text:
          value.bom === undefined && prefixed
            ? value.text.slice(1)
            : value.text,
        revision: value.digest,
        encoding: "utf-8",
        bom: value.bom ?? prefixed,
      }
    }
    this.documentCopy = read()
      .then((initial) => {
        this.documentScope.assertActive()
        const copy: WorkingCopy = new WorkingCopy(initial, {
          read,
          write: async (text, expectedRevision) => {
            const { bom } = copy.snapshot()
            const result = await this.native<
              { status: "saved"; digest: string } | { status: "conflict" }
            >("saveDocument", {
              path,
              text: bom ? "\uFEFF" + text : text,
              expectedDigest: expectedRevision,
            })
            return result.status === "saved"
              ? {
                  status: "saved",
                  snapshot: {
                    text,
                    revision: result.digest,
                    encoding: "utf-8",
                    bom,
                  },
                }
              : result
          },
        })
        let refreshing = false
        this.documentPoll = setInterval(() => {
          if (refreshing) return
          refreshing = true
          void copy
            .refresh()
            .then(
              () => this.updateDocument(copy),
              () => {}
            )
            .finally(() => {
              refreshing = false
            })
        }, 1500)
        return {
          copy,
          document: copy.bind(
            this.documentScope,
            this.options.view?.access ?? "read"
          ),
        }
      })
      .catch((error) => {
        this.documentCopy = undefined
        throw error
      })
    return this.documentCopy
  }
  async saveDocument() {
    const { copy, document } = await this.openDocument()
    if (this.options.canMutate?.() === false)
      throw new Error("此插件入口为只读")
    try {
      return await document.save()
    } finally {
      this.updateDocument(copy)
    }
  }
  private async handle(request: PluginRequest): Promise<unknown> {
    const method = request.method
    let params = request.params
    if (
      ["view.ready", "extension.ready", "table.actions.ready"].includes(method)
    ) {
      this.send("host.theme", this.options.theme ?? {})
      if (
        (this.options.extension
          ? method === "extension.ready"
          : method === "view.ready") &&
        !this.connected
      ) {
        this.connected = true
        queueMicrotask(() => this.options.ready?.())
      }
      return null
    }
    if (method === "extension.failed")
      throw new Error(String(object(params).message))
    if (method === "action.complete" || method === "table.actions.result") {
      const p = object(params)
      if (!this.run || (p.invocation ?? p.runId) !== this.run.id)
        throw new Error("动作已结束")
      const result = this.actionResult
      this.actionResult = null
      this.run = null
      if (result) {
        clearTimeout(result.timer)
        if (p.error) result.reject(new Error(String(p.error)))
        else result.resolve(p.items ?? null)
      }
      return null
    }
    if (this.options.extension) {
      const envelope = object(params)
      if (!this.run || (envelope.invocation ?? envelope.runId) !== this.run.id)
        throw new Error("动作未授权或已结束")
      params = envelope.args
    }
    const p = params === null ? {} : object(params)
    const access = this.options.extension
      ? this.manifest.actions?.find((a) => a.id === this.run?.action)?.access
      : this.options.view?.access
    const writable = access === "write"
    const requireWrite = () => {
      if (!writable || this.options.canMutate?.() === false)
        throw new Error("此插件入口为只读")
    }
    const capabilities = this.options.view?.capabilities ?? []
    const table = this.options.table
    const workspaceFiles = this.manifest.workspace?.files
    const workspaceRead =
      workspaceFiles === true ||
      (workspaceFiles && workspaceFiles.read !== false)
    const workspaceWrite =
      workspaceFiles === true ||
      (workspaceFiles && workspaceFiles.write === true)
    if (method === "ui.notify") {
      this.options.notify(String(p.message).slice(0, 1000))
      return null
    }
    if (method === "ui.navigate") {
      if (
        !this.manifest.views?.some(
          (v) => v.id === p.viewId && v.kind === "page"
        )
      )
        throw new Error("页面未声明")
      this.options.navigate(
        String(p.viewId),
        typeof p.route === "string" ? p.route : undefined
      )
      return null
    }
    if (method === "ui.openFile") {
      if (p.target !== undefined && p.target !== "main")
        throw new Error("此宿主仅支持在主区域打开文件")
      const path = spacePath(p.relativePath)
      if (!workspaceRead && path !== this.options.path)
        throw new Error("未授权访问其他文件")
      await this.options.openFile(path)
      return null
    }
    if (method.startsWith("settings.")) {
      const key = String(p.key),
        declaration = this.manifest.settings?.[key]
      if (!declaration) throw new Error("设置未声明")
      if (method === "settings.get")
        return (
          (await this.native("settingGet", { id: this.manifest.id, key })) ??
          declaration.default
        )
      if (method === "settings.set") validateSetting(declaration, p.value)
      return this.native("settingSet", {
        id: this.manifest.id,
        key,
        value: method === "settings.reset" ? null : p.value,
      })
    }
    if (
      method === "eidos.connection.status" ||
      method === "eidos.connection.request" ||
      method === "table.connection.request"
    ) {
      const connection = String(p.connection)
      const declaration = this.manifest.connections?.[connection]
      if (!declaration) throw new Error("连接未声明")
      if (this.options.extension && this.run?.operation === "list")
        throw new Error("列出动作时不能发送数据")
      return this.native(
        method.endsWith("status") ? "connectionStatus" : "connectionRequest",
        {
          id: this.manifest.id,
          connection,
          url: declaration.url,
          body: p.body,
        }
      )
    }
    if (method.startsWith("document.")) {
      const { copy, document } = await this.openDocument()
      if (method === "document.read") return document.read()
      if (method === "document.observe") {
        const id = String(p.id)
        if (
          this.observers.size + this.documentObservers.size >= 16 ||
          this.documentObservers.has(id)
        )
          throw new Error("订阅过多")
        const scope = new Scope()
        this.documentObservers.set(id, scope)
        const { snapshot } = await copy
          .bind(scope, "read")
          .observe((value) => this.send(id, value))
        return snapshot
      }
      if (method === "document.unobserve") {
        this.documentObservers.get(String(p.id))?.dispose()
        this.documentObservers.delete(String(p.id))
        return null
      }
      requireWrite()
      if (method === "document.save") return this.saveDocument()
      try {
        if (method === "document.edit")
          return await document.edit(
            p as unknown as Parameters<TextDocument["edit"]>[0]
          )
        if (method === "document.undo") return await document.undo()
        if (method === "document.redo") return await document.redo()
      } finally {
        this.updateDocument(copy)
      }
      throw new Error("不支持的文档操作")
    }
    if (method.startsWith("fs.")) {
      if (method === "fs.unwatch") {
        clearInterval(this.observers.get(String(p.id)))
        this.observers.delete(String(p.id))
        return null
      }
      const path = spacePath(
        p.path ?? "",
        method === "fs.list" || method === "fs.watch"
      )
      const bound =
        this.options.path &&
        [this.options.path, this.options.path.split("/").pop()].includes(path)
      if (
        !workspaceRead &&
        !bound &&
        !(method === "fs.writeText" && workspaceWrite)
      )
        throw new Error("未授权访问其他文件")
      const boundPath = !workspaceRead && bound ? this.options.path! : path
      if (method === "fs.readText")
        return {
          text: (
            await this.native<{ text: string }>("readText", { path: boundPath })
          ).text,
        }
      if (method === "fs.readBinary")
        return {
          data: await this.native<string>("readBinary", { path: boundPath }),
        }
      if (method === "fs.list") {
        const files = await this.native<Array<{ path: string; kind: string }>>(
          "files",
          { path, recursive: p.recursive !== false }
        )
        const extensions = Array.isArray(p.extensions) ? p.extensions : []
        return files.filter((file) =>
          file.kind === "directory"
            ? p.includeDirectories === true
            : !extensions.length ||
              extensions.some(
                (ext) =>
                  typeof ext === "string" &&
                  file.path.toLowerCase().endsWith(ext.toLowerCase())
              )
        )
      }
      if (method === "fs.stat") return this.native("stat", { path: boundPath })
      if (method === "fs.writeText") {
        requireWrite()
        if (!workspaceWrite && boundPath !== this.options.path)
          throw new Error("未授权写入其他文件")
        if (boundPath === this.documentPath)
          throw new PluginError(
            "BUSY",
            "File has a host working copy; use document editing and save"
          )
        if (/\.eidos$/i.test(boundPath))
          throw new Error("Eidos 文件必须通过 Runtime 修改")
        return this.native("writeText", { path: boundPath, text: p.content })
      }
      if (method === "fs.watch") {
        const id = String(p.id)
        if (
          this.observers.size + this.documentObservers.size >= 16 ||
          this.observers.has(id)
        )
          throw new Error("订阅过多")
        let previous = ""
        this.observers.set(
          id,
          setInterval(
            () =>
              void this.native("files", { path, recursive: true })
                .then((value) => {
                  const next = JSON.stringify(value)
                  if (next !== previous) {
                    previous = next
                    this.send(id, null)
                  }
                })
                .catch(() => {}),
            2000
          )
        )
        return null
      }
      throw new Error("不支持的文件操作")
    }
    if (
      method.startsWith("eidos.") &&
      !method.startsWith("eidos.connection.")
    ) {
      if (
        !table ||
        !(
          capabilities.includes("eidos/schema") ||
          capabilities.includes("eidos/config") ||
          capabilities.includes("eidos/table")
        )
      )
        throw new Error("没有文件权限")
      if (
        method.includes("pluginConfig") &&
        !capabilities.includes("eidos/config")
      )
        throw new Error("没有配置权限")
      if (
        ["eidos.tables", "eidos.table"].includes(method) &&
        !capabilities.includes("eidos/schema")
      )
        throw new Error("没有结构读取权限")
      return fileViewRequest(
        table.source,
        this.manifest.id,
        { ...request, params },
        !writable || this.options.canMutate?.() === false
      )
    }
    if (method.startsWith("table.")) {
      if (
        !table ||
        (!this.options.extension && !capabilities.includes("eidos/table"))
      )
        throw new Error("没有表格权限")
      if (method === "table.readContext")
        return {
          fields: table.table.fields,
          view: {
            ...table.view,
            properties: {
              ...table.view.properties,
              plugin: {
                ...Object.fromEntries(
                  Object.entries(
                    this.options.view?.configuration?.properties ?? {}
                  ).map(([k, v]) => [k, v.default])
                ),
                ...object(table.view.properties?.plugin ?? {}),
              },
            },
          },
        }
      if (method === "table.pluginConfig.read") {
        if (!this.options.extension && !capabilities.includes("eidos/config"))
          throw new Error("没有配置权限")
        return table.source.readTablePluginConfig?.(
          table.table.table.id,
          this.manifest.id
        )
      }
      if (method === "table.readRows") {
        if (
          !Number.isSafeInteger(p.offset) ||
          Number(p.offset) < 0 ||
          !Number.isSafeInteger(p.limit) ||
          Number(p.limit) < 1 ||
          Number(p.limit) > 1000
        )
          throw new Error("无效分页")
        return table.source.getPage(
          table.table.table.id,
          Number(p.offset),
          Number(p.limit),
          table.query
        )
      }
      if (method === "table.aggregate") {
        if (!table.source.aggregateTable) throw new Error("不支持聚合")
        return table.source.aggregateTable(
          table.table.table.id,
          p as unknown as Parameters<
            NonNullable<EidosFileDataSource["aggregateTable"]>
          >[1],
          table.query
        )
      }
      if (method === "table.setViewConfig") {
        if (this.options.canMutate?.() === false)
          throw new Error("视图当前只读")
        const schema = this.options.view?.configuration
        if (!schema || Object.keys(p).some((k) => !schema.properties[k]))
          throw new Error("无效视图设置")
        for (const [key, value] of Object.entries(p))
          validateSetting(schema.properties[key], value)
        await table.source.updateView(table.view.id, {
          properties: { ...table.view.properties, plugin: p as JsonObject },
        })
        table.view = {
          ...table.view,
          properties: { ...table.view.properties, plugin: p as JsonObject },
        }
        this.send("host.table", null)
        return null
      }
      if (method === "table.openRecord") {
        if (
          typeof p.rowId !== "string" ||
          !(await table.source.getRow?.(table.table.table.id, p.rowId))
        )
          throw new Error("记录不存在")
        await this.options.openRecord?.(p.rowId)
        return null
      }
      const session = this.run?.session
      if (!session || this.run?.operation !== "run")
        throw new Error("没有正在执行的表格动作")
      requireWrite()
      if (method === "table.target.readRows")
        return session.readRows(
          Number(p.offset),
          Number(p.limit),
          p.fields as string[]
        )
      if (method === "table.target.update")
        return session.update(
          String(p.readToken),
          p.values as Record<string, LogicalValue>
        )
      if (method === "table.task.declareOutputs") {
        const rows = p.rows as Parameters<
          TableActionSession["declareOutputs"]
        >[0]
        if (
          !Array.isArray(rows) ||
          !(await this.options.confirm("此动作将修改表格记录，允许写入吗？"))
        )
          throw new Error("已取消写入")
        return session.declareOutputs(rows)
      }
      if (method === "table.task.report") {
        this.options.notify(
          String(p.message ?? "已完成 " + String(p.completed))
        )
        return null
      }
    }
    throw new Error("未授权的插件接口：" + method)
  }
  async action(
    action: string,
    operation?: "list" | "run",
    itemId?: string
  ): Promise<unknown> {
    if (this.run || this.disposed || !this.connected)
      throw new Error("插件尚未就绪或动作仍在执行")
    const declaration = this.manifest.actions?.find((a) => a.id === action)
    if (!declaration) throw new Error("动作未声明")
    const id = crypto.randomUUID()
    const table = this.options.table
    const session =
      table && operation === "run"
        ? new TableActionSession(table.source, table.table.table.id)
        : undefined
    if (session) await session.capture(table!.query, null)
    this.run = { id, action, session, operation }
    const promise = new Promise((resolve, reject) => {
      this.actionResult = {
        resolve,
        reject,
        timer: setTimeout(
          () => {
            session?.cancel()
            this.send("action.abort", id)
            this.send("host.tableAction.abort", id)
            this.run = null
            this.actionResult = null
            reject(new Error("动作超时"))
          },
          operation === "run" ? 300000 : 30000
        ),
      }
    })
    this.send(
      operation ? "host.tableAction" : "action.run",
      operation
        ? {
            id,
            provider: action,
            operation,
            itemId,
            tableId: table?.table.table.id,
            viewId: table?.view.id ?? "",
            count: session?.ids.length ?? 0,
          }
        : {
            invocation: id,
            action,
            kind: declaration.context,
            path: this.options.path,
          }
    )
    try {
      return await promise
    } finally {
      session?.dispose()
    }
  }
  dispose() {
    this.disposed = true
    clearInterval(this.documentPoll)
    this.documentScope.dispose()
    for (const scope of this.documentObservers.values()) scope.dispose()
    this.documentObservers.clear()
    this.run?.session?.dispose()
    if (this.actionResult) {
      clearTimeout(this.actionResult.timer)
      this.actionResult.reject(new Error("插件已关闭"))
    }
    for (const timer of this.observers.values()) clearInterval(timer)
    this.observers.clear()
    window.removeEventListener("message", this.receive)
    this.frame.remove()
  }
}
