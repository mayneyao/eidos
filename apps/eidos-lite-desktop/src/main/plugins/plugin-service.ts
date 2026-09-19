import { randomUUID } from "node:crypto"
import path from "node:path"
import { PluginStorage } from "./plugin-storage"
import { readPluginNetwork } from "./plugin-network"
import {
  PLUGIN_PROTOCOL,
  PluginError,
  object,
  parseChange,
  parseRequest,
  type TextChange,
  type PluginEvent,
} from "@eidos.space/plugin-runtime/rpc"
import {
  WorkingCopyRegistry,
  type WorkingCopy,
} from "@eidos.space/plugin-runtime/working-copy"
import { Scope } from "@eidos.space/plugin-runtime/lifecycle"
import {
  documentViewHtml,
  viewHtml,
  sandboxCsp,
} from "@eidos.space/plugin-runtime/sandbox"
import { extensionHtml } from "@eidos.space/plugin-runtime/extension-sandbox"
import type {
  TextDocument,
  Disposable,
  ActionDeclaration,
  FormatterDeclaration,
} from "@eidos.space/plugin-sdk"
import type { PluginOpenResult, PluginRpcResult } from "../../shared/plugins"
import { normalizeMutableRelativePath } from "../space/space-paths"
import type { PluginStore } from "./plugin-store"
import { diskSnapshot, type PluginDocumentSession } from "./document-host"
export type { PluginDocumentSession } from "./document-host"
interface Instance {
  table?: { tableId: string; viewId: string }
  csp?: string
  mounted?: () => void
  extension?: {
    declarations: ActionDeclaration[]
    formatters: FormatterDeclaration[]
    registeredFormatters: Set<string>
    registered: Set<string> | null
    ready: Promise<void>
    resolve(): void
    reject(error: Error): void
  }
  invocation?: {
    id: string
    contextVersion?: string
    path?: string
    scope: Scope
    copy?: WorkingCopy
    document?: TextDocument
    format?: { version: string; text: string; applying: boolean }
    finish(error?: Error): void
  }
  owner: number
  session: PluginDocumentSession
  path: string
  html: string
  resource: string
  scope: Scope
  copy?: WorkingCopy
  document?: TextDocument
  pluginId: string
  hash: string
  observations: Map<string, Disposable>
  pending: number
  ids: Set<string>
}
export class PluginService {
  private readonly storage = new Map<string, PluginStorage>()
  private formatterContexts = new Map<
    number,
    { session: PluginDocumentSession; path: string | null; version: string }
  >()
  setFormatterContext(
    owner: number,
    session: PluginDocumentSession,
    path: string | null,
    version: string
  ) {
    this.formatterContexts.set(owner, { session, path, version })
    for (const instance of this.instances.values()) {
      const invocation = instance.invocation
      if (
        instance.owner === owner &&
        invocation?.contextVersion &&
        (instance.session !== session ||
          invocation.contextVersion !== version ||
          invocation.path !== path)
      )
        invocation.finish(
          new PluginError(
            "STALE_REVISION",
            "Document context changed during formatting; result discarded"
          )
        )
    }
  }
  readonly instances = new Map<string, Instance>()
  private readonly copies = new WorkingCopyRegistry()
  private readonly sessions = new WeakMap<PluginDocumentSession, string>()
  constructor(
    readonly store: PluginStore,
    private readonly onClose: (owner: number, ticket: string) => void = () => {}
  ) {}
  private armMount(owner: number, ticket: string) {
    const instance = this.instances.get(ticket)!
    const timer = setTimeout(() => this.close(owner, ticket), 10000)
    instance.mounted = () => clearTimeout(timer)
    instance.scope.subscriptions.add({ dispose: instance.mounted })
  }
  async openExtension(
    owner: number,
    session: PluginDocumentSession,
    id: string
  ): Promise<PluginOpenResult> {
    const binding = await this.store.binding(id, session.canonical.id)
    if (!binding?.enabled)
      throw new PluginError("PERMISSION_DENIED", "Plugin disabled")
    for (const [ticket, instance] of this.instances) {
      if (
        instance.owner === owner &&
        instance.session === session &&
        instance.pluginId === id &&
        instance.extension
      ) {
        if (instance.hash === binding.hash)
          return {
            instance: {
              ticket,
              url: `eidos-plugin://${instance.resource}/index.html`,
              editor: { key: id, label: id, pluginName: id },
            },
          }
        this.close(owner, ticket)
      }
    }
    const pkg = await this.store.read(binding.hash)
    if (
      !pkg.manifest.extension ||
      (!pkg.manifest.actions?.length && !pkg.manifest.formatters?.length) ||
      pkg.manifest.id !== id
    )
      throw new PluginError("INVALID_REQUEST", "Plugin has no actions")
    if (pkg.manifest.actions?.some((a) => a.context === "table"))
      throw new PluginError(
        "UNSUPPORTED_API",
        "Table actions are not connected"
      )
    if (
      [...this.instances.values()].filter((i) => i.owner === owner).length >= 16
    )
      throw new PluginError("INVALID_REQUEST", "Too many plugin instances")
    let resolve!: () => void, reject!: (error: Error) => void
    const ready = new Promise<void>((yes, no) => {
      resolve = yes
      reject = no
    })
    void ready.catch(() => {})
    const ticket = randomUUID(),
      resource = randomUUID(),
      scope = new Scope()
    const timer = setTimeout(() => {
      reject(new PluginError("TIMEOUT", "Extension activation timed out"))
      this.close(owner, ticket)
    }, 10000)
    scope.subscriptions.add({
      dispose() {
        clearTimeout(timer)
        reject(new PluginError("INSTANCE_CLOSED", "Extension closed"))
      },
    })
    this.instances.set(ticket, {
      owner,
      session,
      path: "",
      html: extensionHtml(
        pkg.modules[pkg.manifest.extension]!,
        (pkg.manifest.actions ?? []).map((a) => a.id),
        (pkg.manifest.formatters ?? []).map((f) => f.id)
      ),
      csp: sandboxCsp(pkg.manifest.browser),
      resource,
      scope,
      pluginId: id,
      hash: binding.hash,
      observations: new Map(),
      pending: 0,
      ids: new Set(),
      extension: {
        declarations: pkg.manifest.actions ?? [],
        formatters: pkg.manifest.formatters ?? [],
        registeredFormatters: new Set(),
        registered: null,
        ready,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
        reject,
      },
    })
    return {
      instance: {
        ticket,
        url: `eidos-plugin://${resource}/index.html`,
        editor: {
          key: id,
          label: pkg.manifest.name,
          pluginName: pkg.manifest.name,
        },
      },
    }
  }
  async invoke(
    owner: number,
    session: PluginDocumentSession,
    ticket: string,
    action: string,
    path: string | undefined,
    draft: TextChange | undefined,
    emit: (event: PluginEvent) => void,
    formatter = false,
    contextVersion?: string
  ): Promise<{ draft?: TextChange | null; changed?: boolean }> {
    const instance = this.instances.get(ticket)
    if (
      !instance ||
      instance.owner !== owner ||
      instance.session !== session ||
      !instance.extension
    )
      throw new PluginError("INSTANCE_CLOSED", "Extension closed")
    await instance.extension.ready
    instance.scope.assertActive()
    const binding = await this.store.binding(
      instance.pluginId,
      session.canonical.id
    )
    if (!binding?.enabled || binding.hash !== instance.hash)
      throw new PluginError("PERMISSION_DENIED", "Extension revision changed")
    const provider = formatter
      ? instance.extension.formatters.find((f) => f.id === action)
      : undefined
    const declaration: ActionDeclaration | undefined = formatter
      ? provider && { ...provider, context: "document", access: "write" }
      : instance.extension.declarations.find((a) => a.id === action)
    if (
      !declaration ||
      !(formatter
        ? instance.extension.registeredFormatters.has(action)
        : instance.extension.registered?.has(action))
    )
      throw new PluginError("INVALID_REQUEST", "Action unavailable")
    if (instance.invocation)
      throw new PluginError("INVALID_REQUEST", "An action is already running")
    // Reserve the slot before reading a document to prevent concurrent invokes.
    const id = randomUUID(),
      scope = new Scope()
    let resolve!: (result: {
        draft?: TextChange | null
        changed?: boolean
      }) => void,
      reject!: (error: Error) => void
    const completion = new Promise<{
      draft?: TextChange | null
      changed?: boolean
    }>((yes, no) => {
      resolve = yes
      reject = no
    })
    void completion.catch(() => {})
    let timer: ReturnType<typeof setTimeout> | undefined
    const invocation: NonNullable<Instance["invocation"]> = {
      id,
      ...(formatter && contextVersion ? { contextVersion, path } : {}),
      scope,
      finish: (error) => {
        if (scope.signal.aborted) return
        scope.dispose()
        clearTimeout(timer)
        for (const observation of instance.observations.values())
          observation.dispose()
        instance.observations.clear()
        if (instance.invocation === invocation) instance.invocation = undefined
        if (error) {
          emit({
            protocol: PLUGIN_PROTOCOL,
            apiVersion: 1,
            observation: "action.abort",
            value: id,
          })
          reject(error)
        } else {
          const state = invocation.copy?.snapshot()
          resolve(
            state
              ? {
                  draft: state.dirty
                    ? {
                        text: state.text,
                        expectedRevision: invocation.copy!.persistedRevision(),
                      }
                    : null,
                  ...(invocation.format
                    ? { changed: state.text !== invocation.format.text }
                    : {}),
                }
              : {}
          )
        }
      },
    }
    instance.invocation = invocation
    timer = setTimeout(
      () => invocation.finish(new PluginError("TIMEOUT", "Action timed out")),
      30000
    )
    try {
      if (formatter && contextVersion) {
        const current = this.formatterContexts.get(owner)
        if (
          !current ||
          current.session !== session ||
          current.path !== path ||
          current.version !== contextVersion
        )
          throw new PluginError(
            "STALE_REVISION",
            "Document context changed before formatting"
          )
      }
      if (declaration.context === "document") {
        if (!path)
          throw new PluginError(
            "DOCUMENT_UNAVAILABLE",
            "Select a document first"
          )
        const safe = normalizeMutableRelativePath(path)
        invocation.path = safe
        if (safe.toLowerCase().endsWith(".eidos"))
          throw new PluginError("PERMISSION_DENIED", "Not a text document")
        if (
          declaration.extensions?.length &&
          !declaration.extensions.some((ext) =>
            safe.toLowerCase().endsWith(ext)
          )
        )
          throw new PluginError(
            "DOCUMENT_UNAVAILABLE",
            "Action does not match this document"
          )
        invocation.copy = await this.documentCopy(
          session,
          safe,
          draft,
          formatter
        )
        scope.assertActive()
        instance.scope.assertActive()
        invocation.document = invocation.copy.bind(
          scope,
          declaration.access ?? "read"
        )
        if (formatter) {
          const snapshot = invocation.copy.snapshot()
          invocation.format = {
            version: snapshot.version,
            text: snapshot.text,
            applying: false,
          }
        }
      } else if (declaration.context !== "workspace")
        throw new PluginError("UNSUPPORTED_API", "Action context unsupported")
      scope.assertActive()
      instance.scope.assertActive()
      emit({
        protocol: PLUGIN_PROTOCOL,
        apiVersion: 1,
        observation: formatter ? "formatter.run" : "action.run",
        value: formatter
          ? {
              invocation: id,
              formatter: action,
              text: invocation.format!.text,
              path: invocation.path!,
            }
          : { invocation: id, action, kind: declaration.context },
      })
    } catch (error) {
      invocation.finish(
        error instanceof Error ? error : new Error(String(error))
      )
    }
    return completion
  }
  async openPage(
    owner: number,
    session: PluginDocumentSession,
    key: string,
    route?: string,
    table?: { tableId: string; viewId: string }
  ): Promise<PluginOpenResult> {
    route ??= await this.store.pageRoute(session.canonical.id, key)
    if (
      Buffer.byteLength(route) > 2048 ||
      !/^[a-z][a-z0-9.-]*\/[a-z][a-z0-9-]*$/.test(key)
    )
      throw new PluginError("INVALID_REQUEST", "Invalid page or route")
    const [id, viewId] = key.split("/")
    const binding = await this.store.binding(id!, session.canonical.id)
    if (!binding?.enabled)
      throw new PluginError("PERMISSION_DENIED", "Plugin disabled")
    const pkg = await this.store.read(binding.hash)
    const view = pkg.manifest.views?.find(
      (view) =>
        view.id === viewId && view.context === (table ? "table" : "page")
    )
    if (!view || pkg.manifest.id !== id)
      throw new PluginError("DOCUMENT_UNAVAILABLE", "Page unavailable")
    if (!table) await this.store.setPageRoute(session.canonical.id, key, route)
    if (
      [...this.instances.values()].filter((i) => i.owner === owner).length >= 16
    )
      throw new PluginError("INVALID_REQUEST", "Too many plugin instances")
    const ticket = randomUUID(),
      resource = randomUUID(),
      scope = new Scope()
    this.instances.set(ticket, {
      owner,
      session,
      path: "",
      html: viewHtml(
        pkg.modules[view.entry]!,
        table ? { kind: "table", ...table } : { kind: "page", route }
      ),
      table,
      csp: sandboxCsp(pkg.manifest.browser),
      resource,
      scope,
      pluginId: id,
      hash: binding.hash,
      observations: new Map(),
      pending: 0,
      ids: new Set(),
    })
    this.armMount(owner, ticket)
    return {
      instance: {
        ticket,
        url: `eidos-plugin://${resource}/index.html`,
        editor: { key, label: view.title, pluginName: pkg.manifest.name },
      },
    }
  }
  async open(
    owner: number,
    session: PluginDocumentSession,
    relativePath: string,
    explicit?: string,
    draft?: TextChange
  ): Promise<PluginOpenResult> {
    const safe = normalizeMutableRelativePath(relativePath)
    const selected = await this.store.resolve(
      safe,
      session.canonical.id,
      explicit
    )
    if (!selected.editor) return { instance: null, warning: selected.warning }
    const id = selected.editor.key.split("/")[0]!
    const binding = await this.store.binding(id, session.canonical.id)
    if (!binding?.enabled)
      throw new PluginError("PERMISSION_DENIED", "Plugin disabled")
    const pkg = await this.store.read(binding.hash)
    const view = pkg.manifest.views?.find(
      (view) =>
        `${id}/${view.id}` === selected.editor!.key &&
        view.context === "document"
    )
    if (!view || pkg.manifest.id !== id)
      throw new PluginError("DOCUMENT_UNAVAILABLE", "View is unavailable")
    const copy = await this.documentCopy(session, safe, draft)
    for (const [ticket, old] of this.instances)
      if (old.owner === owner && old.session !== session)
        this.close(owner, ticket)
    if (
      [...this.instances.values()].filter((i) => i.owner === owner).length >= 16
    )
      throw new PluginError("INVALID_REQUEST", "Too many plugin instances")
    const ticket = randomUUID(),
      resource = randomUUID(),
      scope = new Scope()
    this.instances.set(ticket, {
      owner,
      session,
      path: safe,
      resource,
      scope,
      copy,
      html: documentViewHtml(pkg.modules[view.entry]!),
      csp: sandboxCsp(pkg.manifest.browser),
      document: copy.bind(scope, view.access ?? "read"),
      pluginId: id,
      hash: binding.hash,
      observations: new Map(),
      pending: 0,
      ids: new Set(),
    })
    this.armMount(owner, ticket)
    return {
      instance: {
        ticket,
        url: `eidos-plugin://${resource}/index.html`,
        editor: {
          ...selected.editor,
          label: view.title,
          pluginName: pkg.manifest.name,
        },
      },
    }
  }
  async documentCopy(
    session: PluginDocumentSession,
    safe: string,
    draft?: TextChange,
    workbenchAuthoritative = false
  ): Promise<WorkingCopy> {
    // Validate the actual file on every open, even when a working copy exists.
    const current = diskSnapshot(await session.previewTextFile(safe))
    let identity = this.sessions.get(session)
    if (!identity) {
      identity = randomUUID()
      this.sessions.set(session, identity)
    }
    const copy = await this.copies.open(identity, safe, {
      read: async () => diskSnapshot(await session.previewTextFile(safe)),
      write: async (text, revision) => {
        const result = await session.saveTextFile({
          relativePath: safe,
          content: text,
          expectedRevision: revision,
        })
        return result.status === "conflict"
          ? result
          : { status: "saved", snapshot: diskSnapshot(result.file) }
      },
    })
    await copy.refresh()
    if (draft || workbenchAuthoritative) {
      // A formatter operates on the native workbench buffer, including native
      // undo and a clean buffer after discarding a prior formatting result.
      const incoming = draft
        ? parseChange(draft)
        : { text: current.text, expectedRevision: current.revision }
      if (
        incoming.expectedRevision !== current.revision ||
        (!workbenchAuthoritative &&
          copy.snapshot().dirty &&
          copy.snapshot().text !== incoming.text)
      )
        throw new PluginError(
          "STALE_REVISION",
          "Workbench draft conflicts with the shared document"
        )
      const adoption = new Scope()
      try {
        await copy.bind(adoption, "write").edit({
          text: incoming.text,
          expectedVersion: copy.snapshot().version,
        })
      } finally {
        adoption.dispose()
      }
    }
    return copy
  }
  html(url: string): string | null {
    const parsed = new URL(url)
    if (
      parsed.protocol !== "eidos-plugin:" ||
      parsed.pathname !== "/index.html" ||
      parsed.search ||
      parsed.hash
    )
      return null
    return (
      [...this.instances.values()].find((i) => i.resource === parsed.hostname)
        ?.html ?? null
    )
  }
  csp(url: string): string {
    return (
      [...this.instances.values()].find(
        (i) => i.resource === new URL(url).hostname
      )?.csp ?? sandboxCsp()
    )
  }
  close(owner: number, ticket: string) {
    const instance = this.instances.get(ticket)
    if (instance?.owner === owner) {
      instance.invocation?.finish(
        new PluginError("INSTANCE_CLOSED", "Extension closed")
      )
      instance.scope.dispose()
      this.instances.delete(ticket)
      this.onClose(owner, ticket)
    }
  }
  closeOwner(owner: number) {
    this.formatterContexts.delete(owner)
    for (const [ticket, instance] of this.instances)
      if (instance.owner === owner) this.close(owner, ticket)
  }
  revoke(pluginId: string, spaceId?: string) {
    for (const [ticket, instance] of this.instances)
      if (
        instance.pluginId === pluginId &&
        (!spaceId || instance.session.canonical.id === spaceId)
      )
        this.close(instance.owner, ticket)
  }
  async request(
    owner: number,
    session: PluginDocumentSession,
    ticket: string,
    value: unknown,
    emit: (event: PluginEvent) => void = () => {}
  ): Promise<PluginRpcResult> {
    const request = parseRequest(value)
    const base = {
      protocol: PLUGIN_PROTOCOL,
      apiVersion: 1,
      id: request.id,
    } as const
    try {
      const instance = this.instances.get(ticket)
      if (!instance || instance.owner !== owner || instance.session !== session)
        throw new PluginError("INSTANCE_CLOSED", "Plugin instance closed")
      const binding = await this.store.binding(
        instance.pluginId,
        session.canonical.id
      )
      if (!binding?.enabled) {
        this.close(owner, ticket)
        throw new PluginError("PERMISSION_DENIED", "Plugin grant revoked")
      }
      instance.scope.assertActive()
      if (request.method === "network.read") {
        const pkg = await this.store.read(instance.hash)
        if (binding.hash !== instance.hash)
          throw new PluginError("PERMISSION_DENIED", "Plugin revision changed")
        const result = await readPluginNetwork(
          request.params,
          pkg.manifest.browser?.networkOrigins ?? [],
          instance.scope.signal
        )
        instance.scope.assertActive()
        return { response: { ...base, result } }
      }
      if (request.method.startsWith("storage.")) {
        const pkg = await this.store.read(instance.hash)
        if (!pkg.manifest.storage || binding.hash !== instance.hash)
          throw new PluginError(
            "PERMISSION_DENIED",
            "Plugin storage not granted"
          )
        let storage = this.storage.get(instance.pluginId)
        if (!storage) {
          storage = new PluginStorage(
            path.join(this.store.directory, "data", instance.pluginId)
          )
          this.storage.set(instance.pluginId, storage)
        }
        const result = await storage.request(
          request.method,
          request.params,
          pkg.manifest.storage.maxBytes,
          () => instance.scope.assertActive()
        )
        instance.scope.assertActive()
        return { response: { ...base, result } }
      }
      if (request.method.startsWith("table.")) {
        if (!instance.table)
          throw new PluginError("PERMISSION_DENIED", "Not a table view")
        // The workbench adapter supplies only this mounted view's data source;
        // guests cannot send runtime session handles across this boundary.
        return { response: { ...base, result: null } }
      }
      if (
        request.method.startsWith("extension.") ||
        request.method === "action.complete" ||
        request.method === "formatter.complete"
      ) {
        const extension = instance.extension
        if (!extension)
          throw new PluginError(
            "PERMISSION_DENIED",
            "Not an extension container"
          )
        const p = object(request.params)
        if (request.method === "extension.ready") {
          if (
            extension.registered ||
            Object.keys(p).some(
              (k) => !["actions", "formatters"].includes(k)
            ) ||
            !Array.isArray(p.formatters ?? []) ||
            ((p.formatters as unknown[] | undefined) ?? []).length !==
              extension.formatters.length ||
            new Set((p.formatters as unknown[] | undefined) ?? []).size !==
              extension.formatters.length ||
            ((p.formatters as unknown[] | undefined) ?? []).some(
              (id) => !extension.formatters.some((f) => f.id === id)
            ) ||
            !Array.isArray(p.actions) ||
            p.actions.length !== extension.declarations.length ||
            new Set(p.actions).size !== p.actions.length ||
            p.actions.some(
              (id) => !extension.declarations.some((a) => a.id === id)
            )
          ) {
            this.close(owner, ticket)
            throw new PluginError(
              "REGISTRATION_CONFLICT",
              "Activation must register all declared actions exactly once"
            )
          }
          extension.registered = new Set(p.actions as string[])
          extension.registeredFormatters = new Set(
            (p.formatters as string[] | undefined) ?? []
          )
          extension.resolve()
        } else if (request.method === "extension.failed") {
          extension.reject(
            new PluginError(
              "IO_ERROR",
              typeof p.message === "string"
                ? p.message.slice(0, 4096)
                : "Activation failed"
            )
          )
          this.close(owner, ticket)
        } else if (request.method === "extension.unregister") {
          if (
            typeof p.id !== "string" ||
            Object.keys(p).some((k) => !["id", "kind"].includes(k)) ||
            (p.kind !== undefined && p.kind !== "formatter")
          )
            throw new PluginError("INVALID_REQUEST", "Invalid registration")
          if (p.kind === "formatter")
            extension.registeredFormatters.delete(p.id)
          else extension.registered?.delete(p.id)
        } else if (request.method === "formatter.complete") {
          const invocation = instance.invocation
          if (
            !invocation?.format ||
            invocation.id !== p.invocation ||
            invocation.format.applying
          )
            throw new PluginError(
              "INSTANCE_CLOSED",
              "Formatter already finished"
            )
          invocation.format.applying = true
          try {
            if (
              Object.keys(p).some(
                (k) => !["invocation", "text", "error"].includes(k)
              )
            )
              throw new Error("Invalid formatter result")
            if (p.error !== undefined)
              throw new Error(String(p.error).slice(0, 4096))
            if (typeof p.text !== "string")
              throw new Error("Formatter must return text")
            const result = await invocation.document!.edit({
              text: p.text,
              expectedVersion: invocation.format.version,
              label: "Format document",
            })
            if (result.status === "stale")
              throw new PluginError(
                "STALE_REVISION",
                "Document changed during formatting; result discarded"
              )
            invocation.finish()
          } catch (error) {
            invocation.finish(
              error instanceof Error ? error : new Error(String(error))
            )
          }
        } else {
          if (
            typeof p.invocation !== "string" ||
            p.invocation !== instance.invocation?.id ||
            instance.invocation?.format ||
            Object.keys(p).some((k) => !["invocation", "error"].includes(k)) ||
            (p.error !== undefined &&
              (typeof p.error !== "string" || p.error.length > 4096))
          )
            throw new PluginError("INSTANCE_CLOSED", "Action already finished")
          instance.invocation.finish(
            typeof p.error === "string"
              ? new PluginError("IO_ERROR", p.error)
              : undefined
          )
        }
        return { response: { ...base, result: null } }
      }
      let params = request.params
      let copy = instance.copy,
        doc = instance.document
      let draftPath = instance.path
      if (instance.extension && request.method !== "view.ready") {
        const invocation = instance.invocation
        if (!invocation || invocation.format)
          throw new PluginError(
            "PERMISSION_DENIED",
            "No active action capability"
          )
        const envelope = object(params)
        if (
          !invocation ||
          Object.keys(envelope).sort().join() !== "args,invocation" ||
          envelope.invocation !== invocation.id
        )
          throw new PluginError(
            "PERMISSION_DENIED",
            "No active action capability"
          )
        invocation.scope.assertActive()
        params = envelope.args
        copy = invocation.copy
        doc = invocation.document
        draftPath = invocation.path ?? ""
      }
      if (
        [
          "view.ready",
          "document.read",
          "document.save",
          "document.undo",
          "document.redo",
        ].includes(request.method) &&
        params !== null
      )
        throw new PluginError("INVALID_REQUEST", "Unexpected parameters")
      if (instance.pending >= 64 || instance.ids.has(request.id))
        throw new PluginError(
          "INVALID_REQUEST",
          "Duplicate or excessive pending requests"
        )
      instance.pending++
      instance.ids.add(request.id)
      try {
        if (request.method.startsWith("document.") && !doc)
          throw new PluginError(
            "PERMISSION_DENIED",
            "This contribution has no document binding"
          )
        let result: unknown
        let navigation: PluginRpcResult["navigation"]
        switch (request.method) {
          case "view.ready":
            instance.mounted?.()
            result = null
            break
          case "document.read":
            result = await doc!.read()
            break
          case "document.edit": {
            const p = object(params)
            if (
              Object.keys(p).some(
                (k) =>
                  !["text", "expectedVersion", "label", "group"].includes(k)
              )
            )
              throw new PluginError("INVALID_REQUEST", "Unknown edit field")
            result = await doc!.edit(
              p as unknown as Parameters<TextDocument["edit"]>[0]
            )
            break
          }
          case "document.save":
            result = await doc!.save()
            break
          case "document.undo":
            result = await doc!.undo()
            break
          case "document.redo":
            result = await doc!.redo()
            break
          case "document.observe":
          case "document.unobserve": {
            const p = object(params)
            if (
              Object.keys(p).join() !== "id" ||
              typeof p.id !== "string" ||
              !p.id ||
              p.id.length > 128
            )
              throw new PluginError("INVALID_REQUEST", "Invalid observer")
            if (request.method === "document.unobserve") {
              instance.observations.get(p.id)?.dispose()
              instance.observations.delete(p.id)
              result = null
              break
            }
            if (
              instance.observations.has(p.id) ||
              instance.observations.size >= 64
            )
              throw new PluginError(
                "INVALID_REQUEST",
                "Duplicate or excessive observers"
              )
            const observation = p.id
            const observed = await doc!.observe((value) => {
              if (!instance.scope.signal.aborted)
                emit({
                  protocol: PLUGIN_PROTOCOL,
                  apiVersion: 1,
                  observation,
                  value,
                  draftPath,
                  draft: value.dirty
                    ? {
                        text: value.text,
                        expectedRevision: copy!.persistedRevision(),
                      }
                    : null,
                })
            })
            instance.observations.set(observation, observed.subscription)
            result = observed.snapshot
            break
          }
          case "ui.notify": {
            const p = object(params)
            if (
              Object.keys(p).join() !== "message" ||
              typeof p.message !== "string" ||
              Buffer.byteLength(p.message) > 4096
            )
              throw new PluginError("INVALID_REQUEST", "Invalid notification")
            result = null
            break
          }
          case "ui.navigate": {
            const p = object(params)
            if (
              Object.keys(p).some(
                (key) => !["viewId", "route"].includes(key)
              ) ||
              typeof p.viewId !== "string" ||
              (p.route !== undefined &&
                (typeof p.route !== "string" ||
                  Buffer.byteLength(p.route) > 2048))
            )
              throw new PluginError("INVALID_REQUEST", "Invalid navigation")
            const pkg = await this.store.read(instance.hash)
            if (
              !pkg.manifest.views?.some(
                (view) => view.id === p.viewId && view.context === "page"
              )
            )
              throw new PluginError(
                "PERMISSION_DENIED",
                "Navigation is limited to this plugin's declared pages"
              )
            const key = `${instance.pluginId}/${p.viewId}`
            const route =
              typeof p.route === "string"
                ? p.route
                : await this.store.pageRoute(session.canonical.id, key)
            await this.store.setPageRoute(session.canonical.id, key, route)
            navigation = { key, route }
            result = null
            break
          }
        }
        const state = copy?.snapshot()
        return {
          response: { ...base, result },
          ...(state ? { draftPath } : {}),
          ...(navigation ? { navigation } : {}),
          ...(state
            ? {
                draft: state.dirty
                  ? {
                      text: state.text,
                      expectedRevision: copy!.persistedRevision(),
                    }
                  : null,
              }
            : {}),
          ...(request.method === "ui.notify"
            ? { notification: String(object(params).message) }
            : {}),
        }
      } finally {
        instance.pending--
        instance.ids.delete(request.id)
      }
    } catch (error) {
      return {
        response: {
          ...base,
          error: {
            code: error instanceof PluginError ? error.code : "IO_ERROR",
            message:
              error instanceof Error ? error.message : "Plugin request failed",
          },
        },
      }
    }
  }
}
