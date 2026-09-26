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
  mediaViewHtml,
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
  workspaceFiles?: boolean | { read?: boolean; write?: boolean }
  file?: {
    path: string
    name: string
    baseName: string
    extension: string
    mimeType?: string
    size: number
  }
  eidos?: boolean
  media?: boolean
  mediaPreviewUrl?: string
  tableWritable?: boolean
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
    access: "read" | "write"
    context: "workspace" | "document" | "file" | "table"
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
  path?: string
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
    id: string,
    table?: { tableId: string; viewId: string }
  ): Promise<PluginOpenResult> {
    const binding = await this.store.binding(id, session.canonical.id)
    if (!binding?.enabled)
      throw new PluginError("PERMISSION_DENIED", "Plugin disabled")
    for (const [ticket, instance] of this.instances) {
      if (
        instance.owner === owner &&
        instance.session === session &&
        instance.pluginId === id &&
        instance.extension &&
        !table &&
        !instance.table
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
      workspaceFiles: pkg.manifest.workspace?.files,
      html: extensionHtml(
        pkg.modules[pkg.manifest.extension]!,
        (pkg.manifest.actions ?? []).map((a) => a.id),
        (pkg.manifest.formatters ?? []).map((f) => f.id)
      ),
      table,
      tableWritable:
        !!table &&
        pkg.manifest.actions?.some(
          (a) => a.context === "table" && a.access === "write"
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
  async connectionAccess(
    owner: number,
    session: PluginDocumentSession,
    ticket: string,
    id: string,
    management = false
  ) {
    const instance = this.instances.get(ticket)
    if (
      !instance ||
      instance.owner !== owner ||
      instance.session !== session ||
      (!instance.table &&
        !instance.eidos &&
        !(management && instance.extension))
    )
      throw new PluginError(
        "PERMISSION_DENIED",
        "Connection requires a live table plugin"
      )
    instance.scope.assertActive()
    const binding = await this.store.binding(
      instance.pluginId,
      session.canonical.id
    )
    if (!binding?.enabled || binding.hash !== instance.hash)
      throw new PluginError("PERMISSION_DENIED", "Plugin changed or disabled")
    const pkg = await this.store.read(instance.hash)
    const connection = pkg.manifest.connections?.[id]
    if (!connection)
      throw new PluginError("PERMISSION_DENIED", "Connection is not declared")
    if (instance.eidos && !connection.configurable)
      throw new PluginError(
        "PERMISSION_DENIED",
        "File views require a configurable connection"
      )
    return {
      scope: [session.canonical.id, instance.pluginId, id, connection.url],
      url: connection.url,
      configurable: connection.configurable === true,
      signal: instance.scope.signal,
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
      access: declaration.access ?? "read",
      context: declaration.context,
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
      } else if (declaration.context === "file") {
        if (!path)
          throw new PluginError("DOCUMENT_UNAVAILABLE", "Select a file first")
        const safe = normalizeMutableRelativePath(path)
        invocation.path = safe
        if (
          declaration.extensions?.length &&
          !declaration.extensions.some((ext) =>
            safe.toLowerCase().endsWith(ext)
          )
        )
          throw new PluginError(
            "DOCUMENT_UNAVAILABLE",
            "Action does not match this file"
          )
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
          : {
              invocation: id,
              action,
              kind: declaration.context,
              ...(invocation.path ? { path: invocation.path } : {}),
            },
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
      workspaceFiles: pkg.manifest.workspace?.files,
      html: viewHtml(
        pkg.modules[view.entry]!,
        table ? { kind: "table", ...table } : { kind: "page", route }
      ),
      table,
      tableWritable: view.access === "write",
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
    const isEidos = safe.toLowerCase().endsWith(".eidos")
    const view = pkg.manifest.views?.find(
      (view) =>
        `${id}/${view.id}` === selected.editor!.key &&
        (view.context === "file" ||
          view.context === "media" ||
          view.context === (isEidos ? "eidos" : "document"))
    )
    if (!view || pkg.manifest.id !== id)
      throw new PluginError("DOCUMENT_UNAVAILABLE", "View is unavailable")
    const isFileContext = view.context === "file"
    const eidos = view.context === "eidos" || (isFileContext && isEidos)
    const media = view.context === "media"
    let mediaInfo:
      | {
          path: string
          name: string
          baseName: string
          extension: string
          mimeType: string
          size: number
          previewUrl: string
        }
      | undefined
    if (media) {
      if (!session.previewMediaFile)
        throw new PluginError(
          "DOCUMENT_UNAVAILABLE",
          "Media view unavailable in this session"
        )
      mediaInfo = await session.previewMediaFile(safe).catch(() => undefined)
    } else if (isFileContext && session.previewMediaFile) {
      mediaInfo = await session.previewMediaFile(safe).catch(() => undefined)
    }
    const copy =
      view.context === "document"
        ? await this.documentCopy(session, safe, draft)
        : isFileContext && !isEidos
          ? await this.documentCopy(session, safe, draft).catch(() => undefined)
          : undefined
    const fileInfo = mediaInfo ?? {
      path: safe,
      name: path.basename(safe),
      baseName: path.parse(safe).name,
      extension: path.extname(safe),
      size: copy ? copy.snapshot().text.length : 0,
    }
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
      file: fileInfo,
      workspaceFiles: pkg.manifest.workspace?.files,
      resource,
      scope,
      copy,
      eidos,
      media: !!mediaInfo,
      mediaPreviewUrl: mediaInfo?.previewUrl,
      tableWritable: view.access === "write",
      html: eidos
        ? viewHtml(pkg.modules[view.entry]!, { kind: "eidos", file: fileInfo })
        : media
          ? mediaViewHtml(pkg.modules[view.entry]!, mediaInfo!)
          : isFileContext
            ? viewHtml(pkg.modules[view.entry]!, { kind: "file", ...fileInfo })
            : documentViewHtml(pkg.modules[view.entry]!, fileInfo),
      csp: sandboxCsp(pkg.manifest.browser),
      document: copy?.bind(scope, view.access ?? "read"),
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
      let capabilityParams = request.params
      let capabilityScope = instance.scope
      if (
        instance.extension &&
        (request.method === "network.read" ||
          request.method.startsWith("storage."))
      ) {
        const invocation = instance.invocation
        const envelope = object(request.params)
        if (
          !invocation ||
          invocation.format ||
          Object.keys(envelope).sort().join() !== "args,invocation" ||
          envelope.invocation !== invocation.id
        ) {
          throw new PluginError(
            "PERMISSION_DENIED",
            "No active action capability"
          )
        }
        capabilityScope = invocation.scope
        capabilityScope.assertActive()
        capabilityParams = envelope.args
      }
      if (request.method === "network.read") {
        const pkg = await this.store.read(instance.hash)
        if (binding.hash !== instance.hash)
          throw new PluginError("PERMISSION_DENIED", "Plugin revision changed")
        const result = await readPluginNetwork(
          capabilityParams,
          pkg.manifest.browser?.networkOrigins ?? [],
          capabilityScope.signal
        )
        capabilityScope.assertActive()
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
          capabilityParams,
          pkg.manifest.storage.maxBytes,
          () => capabilityScope.assertActive()
        )
        capabilityScope.assertActive()
        return { response: { ...base, result } }
      }
      if (request.method.startsWith("eidos.")) {
        if (
          !instance.eidos ||
          binding.hash !== instance.hash ||
          (request.method === "eidos.pluginConfig.write" &&
            !instance.tableWritable)
        )
          throw new PluginError(
            "PERMISSION_DENIED",
            "Eidos file access not granted"
          )
        return { response: { ...base, result: null } }
      }
      if (request.method.startsWith("table.")) {
        if (binding.hash !== instance.hash)
          throw new PluginError("PERMISSION_DENIED", "Plugin revision changed")
        // Provider registration carries no table data authority.
        if (request.method === "table.actions.ready" && instance.extension)
          return { response: { ...base, result: null } }
        if (!instance.table)
          throw new PluginError("PERMISSION_DENIED", "Not a table view")
        if (
          request.method === "table.pluginConfig.write" &&
          !instance.tableWritable
        )
          throw new PluginError(
            "PERMISSION_DENIED",
            "Table view has no write access"
          )
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
        let openFile: string | undefined
        if (
          (request.method.startsWith("settings.") ||
            request.method.startsWith("fs.") ||
            request.method === "ui.openFile") &&
          binding.hash !== instance.hash
        )
          throw new PluginError("PERMISSION_DENIED", "Plugin revision changed")
        const hasWorkspaceFiles =
          instance.workspaceFiles === true ||
          (typeof instance.workspaceFiles === "object" &&
            instance.workspaceFiles.read !== false) ||
          instance.invocation?.context === "workspace"
        const hasWorkspaceWrite =
          instance.workspaceFiles === true ||
          (typeof instance.workspaceFiles === "object" &&
            instance.workspaceFiles.write === true) ||
          (instance.invocation?.context === "workspace" &&
            instance.invocation?.access === "write")
        const activeFilePath = instance.invocation?.path || instance.path
        const isFileView = !!activeFilePath
        switch (request.method) {
          case "view.ready":
            instance.mounted?.()
            result = null
            break
          case "fs.url": {
            const p = params ? object(params) : {}
            const target =
              typeof p.path === "string" && p.path.trim() ? p.path : undefined
            if (!session.previewMediaFile)
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "Media preview unavailable in this session"
              )
            if (!target && isFileView) {
              if (instance.mediaPreviewUrl) {
                result = { url: instance.mediaPreviewUrl }
              } else {
                const info = await session.previewMediaFile(activeFilePath)
                result = { url: info.previewUrl }
              }
            } else if (target) {
              if (hasWorkspaceFiles) {
                const norm = normalizeMutableRelativePath(target)
                const info = await session.previewMediaFile(norm)
                result = { url: info.previewUrl }
              } else if (isFileView) {
                const info = await session.previewMediaFile(
                  activeFilePath,
                  target
                )
                result = { url: info.previewUrl }
              } else {
                throw new PluginError(
                  "PERMISSION_DENIED",
                  "Workspace file access was not declared"
                )
              }
            } else {
              throw new PluginError(
                "INVALID_REQUEST",
                "Target file path is required"
              )
            }
            break
          }
          case "fs.readText": {
            const p = object(params)
            if (typeof p.path !== "string" || !p.path.trim())
              throw new PluginError("INVALID_REQUEST", "Invalid file path")
            let targetPath: string
            if (hasWorkspaceFiles) {
              try {
                targetPath = normalizeMutableRelativePath(p.path)
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid file path")
              }
            } else if (isFileView) {
              const currentDir = path.dirname(activeFilePath)
              if (
                /[\\/\u0000-\u001f]|\.\./.test(p.path) &&
                p.path.includes("/")
              ) {
                try {
                  const norm = normalizeMutableRelativePath(p.path)
                  if (
                    currentDir === "."
                      ? norm.includes("/")
                      : !norm.startsWith(`${currentDir}/`)
                  ) {
                    throw new PluginError(
                      "PERMISSION_DENIED",
                      "Access outside file directory denied"
                    )
                  }
                  targetPath = norm
                } catch (e) {
                  if (e instanceof PluginError) throw e
                  throw new PluginError("INVALID_REQUEST", "Invalid file path")
                }
              } else {
                if (session.readSidecarText) {
                  const sidecar = await session.readSidecarText(
                    activeFilePath,
                    p.path
                  )
                  if (sidecar) {
                    result = { text: sidecar.text }
                    break
                  }
                }
                const filename = p.path.startsWith("./")
                  ? p.path.slice(2)
                  : p.path
                targetPath =
                  currentDir === "." ? filename : `${currentDir}/${filename}`
              }
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace file access was not declared"
              )
            }
            if (session.readTextFile) {
              result = { text: await session.readTextFile(targetPath) }
            } else {
              const preview = await session.previewTextFile(targetPath)
              if (preview.type !== "text" || preview.truncated) {
                throw new PluginError(
                  "DOCUMENT_UNAVAILABLE",
                  "File is unavailable or too large"
                )
              }
              result = { text: preview.content }
            }
            break
          }
          case "fs.writeText": {
            const p = object(params)
            if (typeof p.path !== "string" || typeof p.content !== "string")
              throw new PluginError(
                "INVALID_REQUEST",
                "Invalid write arguments"
              )
            let targetPath: string
            if (hasWorkspaceWrite) {
              try {
                targetPath = normalizeMutableRelativePath(p.path)
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid file path")
              }
            } else if (
              isFileView &&
              (instance.tableWritable ||
                (instance.invocation && instance.invocation.access === "write"))
            ) {
              const currentDir = path.dirname(activeFilePath)
              const filename = p.path.startsWith("./")
                ? p.path.slice(2)
                : p.path
              if (/[\\/\u0000-\u001f]|\.\./.test(filename)) {
                throw new PluginError(
                  "PERMISSION_DENIED",
                  "Access outside file directory denied"
                )
              }
              targetPath =
                currentDir === "." ? filename : `${currentDir}/${filename}`
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            if (!session.writeTextFile) {
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "File writing unavailable"
              )
            }
            await session.writeTextFile(targetPath, p.content)
            result = null
            break
          }
          case "fs.readBinary": {
            const p = object(params)
            if (typeof p.path !== "string" || !p.path.trim())
              throw new PluginError("INVALID_REQUEST", "Invalid file path")
            let targetPath: string
            if (hasWorkspaceFiles) {
              try {
                targetPath = normalizeMutableRelativePath(p.path)
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid file path")
              }
            } else if (isFileView) {
              const currentDir = path.dirname(activeFilePath)
              const filename = p.path.startsWith("./")
                ? p.path.slice(2)
                : p.path
              if (/[\\/\u0000-\u001f]|\.\./.test(filename)) {
                throw new PluginError(
                  "PERMISSION_DENIED",
                  "Access outside file directory denied"
                )
              }
              targetPath =
                currentDir === "." ? filename : `${currentDir}/${filename}`
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace file access was not declared"
              )
            }
            if (!session.readBinaryFile) {
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "Binary read unavailable"
              )
            }
            const buf = await session.readBinaryFile(targetPath)
            result = { data: Buffer.from(buf).toString("base64") }
            break
          }
          case "fs.writeBinary": {
            if (!hasWorkspaceWrite && !isFileView) {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            const p = object(params)
            if (typeof p.path !== "string" || typeof p.data !== "string")
              throw new PluginError(
                "INVALID_REQUEST",
                "Invalid write arguments"
              )
            let targetPath: string
            if (hasWorkspaceWrite) {
              try {
                targetPath = normalizeMutableRelativePath(p.path)
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid file path")
              }
            } else if (
              isFileView &&
              (instance.tableWritable ||
                (instance.invocation && instance.invocation.access === "write"))
            ) {
              const currentDir = path.dirname(activeFilePath)
              const filename = p.path.startsWith("./")
                ? p.path.slice(2)
                : p.path
              if (/[\\/\u0000-\u001f]|\.\./.test(filename)) {
                throw new PluginError(
                  "PERMISSION_DENIED",
                  "Access outside file directory denied"
                )
              }
              targetPath =
                currentDir === "." ? filename : `${currentDir}/${filename}`
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            if (!session.writeBinaryFile) {
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "Binary write unavailable"
              )
            }
            const buf = Buffer.from(p.data, "base64")
            await session.writeBinaryFile(targetPath, buf)
            result = null
            break
          }
          case "fs.delete": {
            if (!hasWorkspaceWrite && !isFileView) {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            const p = object(params)
            if (typeof p.path !== "string" || !p.path.trim())
              throw new PluginError("INVALID_REQUEST", "Invalid file path")
            let targetPath: string
            if (hasWorkspaceWrite) {
              try {
                targetPath = normalizeMutableRelativePath(p.path)
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid file path")
              }
            } else if (
              isFileView &&
              (instance.tableWritable ||
                (instance.invocation && instance.invocation.access === "write"))
            ) {
              const currentDir = path.dirname(activeFilePath)
              const filename = p.path.startsWith("./")
                ? p.path.slice(2)
                : p.path
              if (/[\\/\u0000-\u001f]|\.\./.test(filename)) {
                throw new PluginError(
                  "PERMISSION_DENIED",
                  "Access outside file directory denied"
                )
              }
              targetPath =
                currentDir === "." ? filename : `${currentDir}/${filename}`
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            if (!session.deleteFile) {
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "File deletion unavailable"
              )
            }
            await session.deleteFile(targetPath)
            result = null
            break
          }
          case "fs.rename": {
            if (!hasWorkspaceWrite && !isFileView) {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            const p = object(params)
            if (typeof p.oldPath !== "string" || typeof p.newPath !== "string")
              throw new PluginError(
                "INVALID_REQUEST",
                "Invalid rename arguments"
              )
            let oldTarget: string
            let newTarget: string
            if (hasWorkspaceWrite) {
              try {
                oldTarget = normalizeMutableRelativePath(p.oldPath)
                newTarget = normalizeMutableRelativePath(p.newPath)
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid file path")
              }
            } else if (
              isFileView &&
              (instance.tableWritable ||
                (instance.invocation && instance.invocation.access === "write"))
            ) {
              const currentDir = path.dirname(activeFilePath)
              const oldFile = p.oldPath.startsWith("./")
                ? p.oldPath.slice(2)
                : p.oldPath
              const newFile = p.newPath.startsWith("./")
                ? p.newPath.slice(2)
                : p.newPath
              if (
                /[\\/\u0000-\u001f]|\.\./.test(oldFile) ||
                /[\\/\u0000-\u001f]|\.\./.test(newFile)
              ) {
                throw new PluginError(
                  "PERMISSION_DENIED",
                  "Access outside file directory denied"
                )
              }
              oldTarget =
                currentDir === "." ? oldFile : `${currentDir}/${oldFile}`
              newTarget =
                currentDir === "." ? newFile : `${currentDir}/${newFile}`
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace write access was not declared"
              )
            }
            if (!session.renameFile) {
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "File rename unavailable"
              )
            }
            await session.renameFile(oldTarget, newTarget)
            result = null
            break
          }
          case "fs.list": {
            const p = params ? object(params) : {}
            const extensions =
              p.extensions === undefined
                ? undefined
                : Array.isArray(p.extensions) &&
                    p.extensions.every((e) => typeof e === "string")
                  ? (p.extensions as string[])
                  : (() => {
                      throw new PluginError(
                        "INVALID_REQUEST",
                        "Invalid extensions filter"
                      )
                    })()
            if (hasWorkspaceFiles) {
              const folder =
                typeof p.folder === "string" && p.folder.trim()
                  ? normalizeMutableRelativePath(p.folder)
                  : ""
              if (session.listFiles) {
                result = await session.listFiles(folder, { extensions })
              } else {
                result = []
              }
            } else if (isFileView) {
              const currentDir = path.dirname(activeFilePath)
              if (p.folder && typeof p.folder === "string") {
                const requested = normalizeMutableRelativePath(p.folder)
                if (
                  requested !== currentDir &&
                  !(currentDir === "." && requested === "")
                ) {
                  throw new PluginError(
                    "PERMISSION_DENIED",
                    "Access outside file directory denied"
                  )
                }
              }
              if (session.listSidecars) {
                const sidecars = await session.listSidecars(
                  activeFilePath,
                  extensions
                )
                result = sidecars.map((s) => ({
                  path: s.path,
                  name: s.name,
                  extension: s.extension,
                  size: s.size,
                  isDirectory: false,
                }))
              } else if (session.listFiles) {
                result = await session.listFiles(
                  currentDir === "." ? "" : currentDir,
                  { extensions }
                )
              } else {
                result = []
              }
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace file access was not declared"
              )
            }
            break
          }
          case "fs.stat": {
            const p = object(params)
            if (typeof p.path !== "string" || !p.path.trim())
              throw new PluginError("INVALID_REQUEST", "Invalid file path")
            let targetPath: string
            if (hasWorkspaceFiles) {
              try {
                targetPath = normalizeMutableRelativePath(p.path)
              } catch {
                result = null
                break
              }
            } else if (isFileView) {
              const currentDir = path.dirname(activeFilePath)
              const filename = p.path.startsWith("./")
                ? p.path.slice(2)
                : p.path
              if (
                /[\\/\u0000-\u001f]|\.\./.test(filename) &&
                filename.includes("/")
              ) {
                try {
                  const norm = normalizeMutableRelativePath(p.path)
                  if (
                    currentDir === "."
                      ? norm.includes("/")
                      : !norm.startsWith(`${currentDir}/`)
                  ) {
                    throw new PluginError(
                      "PERMISSION_DENIED",
                      "Access outside file directory denied"
                    )
                  }
                  targetPath = norm
                } catch (e) {
                  if (e instanceof PluginError) throw e
                  result = null
                  break
                }
              } else {
                targetPath =
                  currentDir === "." ? filename : `${currentDir}/${filename}`
              }
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace file access was not declared"
              )
            }
            if (session.statFile) {
              result = await session.statFile(targetPath)
            } else {
              result = null
            }
            break
          }
          case "fs.watch":
          case "fs.unwatch": {
            const p = object(params)
            const watching = request.method === "fs.watch"
            if (
              Object.keys(p).sort().join() !== (watching ? "id,path" : "id") ||
              typeof p.id !== "string" ||
              !p.id ||
              p.id.length > 128
            )
              throw new PluginError(
                "INVALID_REQUEST",
                "Invalid watcher request"
              )
            if (!watching) {
              instance.observations.get(p.id)?.dispose()
              instance.observations.delete(p.id)
              result = null
              break
            }
            if (
              typeof p.path !== "string" ||
              Buffer.byteLength(p.path) > 1024 ||
              instance.observations.has(p.id) ||
              instance.observations.size >= 64
            )
              throw new PluginError(
                "INVALID_REQUEST",
                "Invalid watcher request"
              )
            let folder: string
            if (hasWorkspaceFiles) {
              try {
                folder = p.path ? normalizeMutableRelativePath(p.path) : ""
              } catch {
                throw new PluginError("INVALID_REQUEST", "Invalid folder path")
              }
            } else if (isFileView) {
              const currentDir = path.dirname(activeFilePath)
              folder = currentDir === "." ? "" : currentDir
            } else {
              throw new PluginError(
                "PERMISSION_DENIED",
                "Workspace file access was not declared"
              )
            }
            const observation = p.id
            const watchFn = session.watchFiles
            if (!watchFn) {
              throw new PluginError(
                "DOCUMENT_UNAVAILABLE",
                "File watching unavailable"
              )
            }
            const subscription = watchFn.call(session, folder, () => {
              if (!instance.scope.signal.aborted)
                emit({
                  protocol: PLUGIN_PROTOCOL,
                  apiVersion: 1,
                  observation,
                  value: null,
                })
            })
            instance.observations.set(observation, subscription)
            instance.scope.subscriptions.add(subscription)
            result = null
            break
          }
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
          case "settings.get":
          case "settings.update":
          case "settings.reset": {
            const p = object(params)
            if (
              typeof p.key !== "string" ||
              Object.keys(p).some((key) => !["key", "value"].includes(key))
            )
              throw new PluginError("INVALID_REQUEST", "Invalid plugin setting")
            if (request.method === "settings.get") {
              if ("value" in p)
                throw new PluginError(
                  "INVALID_REQUEST",
                  "Unexpected setting value"
                )
              const settings = await this.store.pluginSettings(
                session.canonical.id,
                instance.pluginId
              )
              if (!(p.key in settings))
                throw new PluginError(
                  "INVALID_REQUEST",
                  "Unknown plugin setting"
                )
              result = settings[p.key]
            } else {
              if (request.method === "settings.reset" && "value" in p)
                throw new PluginError(
                  "INVALID_REQUEST",
                  "Unexpected setting value"
                )
              await this.store.setPluginSetting(
                session.canonical.id,
                instance.pluginId,
                p.key,
                request.method === "settings.reset"
                  ? null
                  : (p.value as string | boolean | number)
              )
              result = null
            }
            break
          }
          case "ui.openFile": {
            const p = object(params)
            if (
              Object.keys(p).join() !== "relativePath" ||
              typeof p.relativePath !== "string" ||
              Buffer.byteLength(p.relativePath) > 1024
            )
              throw new PluginError("INVALID_REQUEST", "Invalid file path")
            let relativePath: string
            try {
              relativePath = normalizeMutableRelativePath(p.relativePath)
            } catch {
              throw new PluginError("INVALID_REQUEST", "Invalid file path")
            }
            openFile = relativePath
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
          ...(openFile ? { openFile } : {}),
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
