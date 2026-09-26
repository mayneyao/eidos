export type PluginIconDefinition =
  | string
  | { paths: string[] }
  | { src: string }
  | { file: string }

// Public type-only SDK for Eidos Plugins 1.0.
export interface PluginManifest {
  apiVersion: 1
  /** Omitted for ordinary executable plugins. */
  kind?: "theme"
  id: string
  name: string
  version: string
  /** Minimum plugin API contract (stable major.minor.patch, not the SDK npm version). */
  requires?: { pluginApi: string }
  /**
   * Plugin icon. Can be:
   * - A relative file path (e.g. "./icon.png", "icon.svg")
   * - A data URL string (e.g. "data:image/svg+xml;base64,...")
   * - An object with { paths: string[] } (monochrome SVG paths)
   * - An object with { src: string } (image/svg source or data URL)
   * - An object with { file: string } (relative file path)
   */
  icon?: PluginIconDefinition
  extension?: string
  views?: ViewDeclaration[]
  actions?: ActionDeclaration[]
  formatters?: FormatterDeclaration[]
  placements?: Placement[]
  settings?: Record<string, SettingDeclaration>
  browser?: { workers?: boolean; networkOrigins?: string[] }
  storage?: { maxBytes: number }
  /** Explicit permission to access files in the current Space. */
  workspace?: {
    files?: boolean | { read?: boolean; write?: boolean }
  }
  /** @deprecated Legacy resource declarations. Use workspace.files instead. */
  resources?: Record<string, ResourceDeclaration>
  connections?: Record<
    string,
    { title: string; url: string; configurable?: boolean }
  >
  /** Standalone Eidos Lite host theme. Theme packages contain no executable contributions. */
  theme?: ThemeDeclaration
}
/** @deprecated Legacy resource declaration. Use workspace.files and ctx.fs instead. */
export type ResourceDeclaration =
  | { kind: "text"; title: string; access: Array<"read" | "write"> }
  | {
      kind: "directory"
      title: string
      access: Array<"read" | "write" | "create" | "delete" | "list">
      include: string[]
    }
  | { kind: "output"; title: string; access: ["write"] }

export interface ThemeDeclaration {
  /** Source path, replaced with validated CSS and embedded fonts when packaged. */
  stylesheet: string
}
export interface ViewDeclaration {
  id: string
  title: string
  entry: string
  context: "page" | "file" | "document" | "media" | "eidos" | "table"
  access?: "read" | "write"
  /** Host-rendered, per-table-view configuration stored in view.properties.plugin. */
  configuration?: ViewConfiguration
  /** Optional icon for this view. When omitted, the host may fall back to the plugin manifest icon. */
  icon?: PluginIconDefinition
}
export interface ViewConfiguration {
  type: "object"
  properties: Record<string, SettingDeclaration & { "x-field"?: true }>
}
export type ActionConfigProperty =
  | (SettingDeclaration & { "x-field"?: true; "x-multiline"?: true })
  | {
      type: "array"
      title: string
      description?: string
      items: { type: "string" }
      "x-field": true
      default?: string[]
    }
export interface ActionConfiguration {
  type: "object"
  properties: Record<string, ActionConfigProperty>
}
export interface ActionDeclaration {
  id: string
  title: string
  context: "workspace" | "file" | "document" | "table"
  access?: "read" | "write"
  extensions?: string[]
  /** @deprecated Reserved legacy design; rejected by current hosts. Use table.pluginConfig. */
  configuration?: ActionConfiguration
  /** @deprecated Reserved legacy design; action lists are owned by the plugin. */
  multiple?: boolean
  /** Optional icon for this action. When omitted, the host may fall back to the plugin manifest icon. */
  icon?: PluginIconDefinition
}
export interface FormatterDeclaration {
  id: string
  title: string
  extensions: string[]
}
export interface FormatterInput {
  text: string
  path: string
  signal: AbortSignal
}
export interface FormatterProvider {
  format(input: FormatterInput): { text: string } | Promise<{ text: string }>
}
export type Placement =
  | { location: "plugin/settings"; view: string }
  | { location: "navigation"; view: string }
  | { location: "file/open"; view: string; extensions: string[] }
  | { location: "table/view"; view: string }
  | { location: "command-palette"; action: string }
  | { location: "file/context"; action: string }
  | { location: "table/context"; action: string }
  | { location: "view/toolbar"; action: string; view: string }
  | {
      location: "keybinding"
      action: string
      key: string
      mac?: string
      linux?: string
    }

export interface Disposable {
  dispose(): void
}
export interface Lifetime {
  readonly signal: AbortSignal
  readonly subscriptions: { add<T extends Disposable>(value: T): T }
}
export interface CommonContext extends Lifetime {
  readonly fs: PluginFileSystem
  readonly storage: PluginStorage
  readonly network: PluginNetwork
  readonly settings: Settings
  readonly ui: HostUI
}
export interface FileStat {
  readonly path: string
  readonly name: string
  readonly extension: string
  readonly size: number
  readonly isDirectory: boolean
}

export interface PluginFileSystem {
  /** Reads the text content of a file in the Space (up to 2 MiB). */
  readText(path: string): Promise<string>
  /** Writes text to a file in the Space, creating parent directories if needed. */
  writeText(path: string, content: string): Promise<void>
  /** Reads the binary content of a file in the Space (up to 16 MiB). */
  readBinary(path: string): Promise<Uint8Array>
  /** Writes binary data to a file in the Space (up to 16 MiB). */
  writeBinary(path: string, content: Uint8Array): Promise<void>
  /** Deletes a file in the Space. */
  delete(path: string): Promise<void>
  /** Renames or moves a regular file within the Space; rejects existing targets with ALREADY_EXISTS. */
  rename(oldPath: string, newPath: string): Promise<void>
  /**
   * Lists files under a Space folder.
   * In a file-backed view without workspace permission, defaults to companion files in the current directory.
   */
  list(
    folder?: string,
    options?: { extensions?: string[] }
  ): Promise<FileStat[]>
  /** Returns metadata for a file, or null if the file does not exist. */
  stat(path: string): Promise<FileStat | null>
  /**
   * Returns a streaming URL (eidos-space-media:) for a file.
   * In a media or file-backed view, path is optional and defaults to the current file.
   */
  getUrl(path?: string): Promise<string>
  /** Watches a folder or file for changes. */
  watch(pathOrFolder: string, listener: () => void): Promise<Disposable>
}

export interface FileContext {
  readonly path: string
  readonly name: string
  readonly baseName: string
  readonly extension: string
  readonly mimeType?: string
  readonly size: number
}

/** Anonymous bounded HTTPS GETs to manifest-declared network origins. */
export interface PluginNetwork {
  read(request: {
    url: string
    range?: { offset: number; length: number }
  }): Promise<{ data: Uint8Array; status: number; etag?: string }>
}
/** Device-local, plugin-private binary objects. Survives view and app restarts. */
export interface PluginStorage {
  list(prefix?: string): Promise<Array<{ key: string; size: number }>>
  read(key: string): Promise<Uint8Array | null>
  write(key: string, value: Uint8Array): Promise<void>
  remove(key: string): Promise<void>
}

export type ViewBinding =
  | { kind: "eidos"; file: EidosFileContext }
  | { kind: "page"; route: string }
  | { kind: "document"; document: TextDocument }
  | { kind: "table"; table: TableContext }
  | { kind: "media"; media: FileContext }
  | { kind: "file"; file: FileContext }

export interface ViewContext extends CommonContext {
  readonly binding: ViewBinding
  readonly file?: FileContext
  readonly editor?: TextDocument
  readonly table?: TableContext
  readonly eidos?: EidosFileContext
}
export interface TableActionInstance {
  id: string
  pluginId: string
  actionId: string
  title: string
  config: Record<string, unknown>
}
export type ActionBinding =
  | { kind: "workspace" }
  | { kind: "file"; file: FileContext }
  | { kind: "document"; document: TextDocument }
  | {
      kind: "table"
      table: TableContext
      rowId?: string
      instanceId?: string
      actionTitle?: string
      config?: Readonly<Record<string, unknown>>
    }
export interface ActionContext extends CommonContext {
  readonly binding: ActionBinding
  readonly file?: FileContext
  readonly editor?: TextDocument
  readonly table?: TableContext
}
export interface ExtensionContext extends Lifetime {
  readonly formatters: {
    register(id: string, provider: FormatterProvider): Disposable
  }
  readonly settings: Settings
  readonly actions: {
    registerTableProvider(id: string, provider: TableActionProvider): Disposable
    register(
      id: string,
      handler: (ctx: ActionContext) => void | Promise<void>
    ): Disposable
  }
}
export interface TableActionItem {
  id: string
  title: string
  /** Optional monochrome 24×24 SVG paths; no external resources. */
  icon?: { paths: string[] }
  targets: Array<"row" | "selection" | "view">
}
export interface TableActionRecord {
  id: string
  values: Record<string, LogicalValue>
  readToken: string
}
export interface TableActionContext {
  readonly signal: AbortSignal
  readonly table: Pick<TableContext, "tableId" | "viewId" | "read"> & {
    pluginConfig: Pick<TableContext["pluginConfig"], "read">
  }
  readonly target: {
    count: number
    read(options: {
      offset: number
      limit: number
      fields: string[]
    }): Promise<TableActionRecord[]>
    update(input: {
      readToken: string
      values: Record<string, LogicalValue>
    }): Promise<void>
  }
  readonly connections: {
    request(input: {
      connection: string
      body: JsonObject
    }): Promise<JsonObject>
  }
  readonly task: {
    /** Declares validated sample outputs. Lite applies runs directly and does not show a confirmation preview. */
    preview(
      rows: Array<{ readToken: string; values: Record<string, LogicalValue> }>
    ): Promise<boolean>
    report(progress: { completed: number; message?: string }): Promise<void>
  }
}
export interface TableActionProvider {
  getItems(
    context: Pick<TableActionContext, "table" | "signal">
  ): Promise<TableActionItem[]> | TableActionItem[]
  run(context: TableActionContext, itemId: string): Promise<void>
}
export type Mount = (
  ctx: ViewContext,
  root: HTMLElement
) => void | Disposable | Promise<void | Disposable>
export type Activate = (
  ctx: ExtensionContext
) => void | Disposable | Promise<void | Disposable>

export interface PluginPackage {
  format: 1 | 2
  manifest: PluginManifest
  modules: Record<string, string> // entry key -> self-contained ESM JavaScript
}

export interface TextSnapshot {
  text: string
  version: string
  encoding: "utf-8" | "utf-16le" | "utf-16be"
  bom: boolean
  dirty: boolean
  conflicted: boolean
}
export interface TextDocument {
  read(): Promise<TextSnapshot>
  observe(
    listener: (state: TextSnapshot) => void,
    onError?: ObserverErrorHandler
  ): Promise<{
    snapshot: TextSnapshot
    subscription: Disposable
  }>
  edit(change: {
    text: string
    expectedVersion: string
    label?: string
    group?: string
  }): Promise<{ status: "applied" | "stale"; snapshot: TextSnapshot }>
  save(): Promise<{ status: "saved" | "conflict"; snapshot: TextSnapshot }>
  undo(): Promise<TextSnapshot>
  redo(): Promise<TextSnapshot>
}

import type {
  LogicalValue,
  JsonObject,
  EidosFileFieldInfo,
  EidosFileRowPage,
  EidosFileRuntime,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
export type GrantedDataMethod =
  | "inspect"
  | "listTables"
  | "getTable"
  | "listFields"
  | "listViews"
  | "getRow"
  | "queryRows"
  | "countRows"
  | "countRowsByField"
  | "aggregate"
  | "mutateRows"
  | "mutateSchema"
  | "createView"
  | "updateView"
  | "deleteView"
  | "reorderViews"
export type GrantedDataClient = {
  [K in GrantedDataMethod]: (
    ...args: Parameters<EidosFileRuntime[K]>
  ) => Promise<Awaited<ReturnType<EidosFileRuntime[K]>>>
}
/** @deprecated Use GrantedDataMethod */
export type GrantedRuntimeMethod = GrantedDataMethod
/** @deprecated Use GrantedDataClient */
export type GrantedRuntimeClient = GrantedDataClient
export interface EidosResource extends Disposable {
  observeRevision(
    listener: (revision: string) => void,
    onError?: ObserverErrorHandler
  ): Promise<{ revision: string; subscription: Disposable }>
  /** Eidos 表格数据引擎接口（提供 queryRows、mutateRows、listTables 等数据操作） */
  readonly data: GrantedDataClient
  /** @deprecated 建议优先使用 .data 访问数据引擎 */
  readonly runtime: GrantedDataClient
}
export interface TableContext {
  readonly pluginConfig: TablePluginConfig
  readonly tableId: string
  readonly viewId: string
  read(): Promise<TableViewSnapshot>
  getPage(options: { offset: number; limit: number }): Promise<EidosFileRowPage>
  aggregate(options: TableAggregateOptions): Promise<TableAggregateResult>
  updateProperties(properties: Record<string, unknown>): Promise<void>
  openRecord(rowId: string): Promise<void>
  observe(listener: () => void): Disposable
}
/** Portable, plugin-owned JSON stored in the bound table's settings. */
export interface TablePluginConfig {
  read(): Promise<TablePluginConfigSnapshot>
  write(input: {
    value: JsonObject | null
    expectedVersion: string
  }): Promise<TablePluginConfigSnapshot>
  /** Invalidation hint; call read() for current values. May include unrelated table changes. */
  observe(listener: () => void): Disposable
}
export interface TablePluginConfigSnapshot {
  value: JsonObject | null
  version: string
}
export interface TableViewSnapshot {
  fields: EidosFileFieldInfo[]
  view: EidosFileViewInfo
}

/** Bound file only; config writes are scoped to this plugin's namespace. */
export interface EidosFileContext {
  readonly connections: {
    configured(connection: string): Promise<boolean>
    request(input: {
      connection: string
      body: JsonObject
    }): Promise<JsonObject>
  }
  listTables(): Promise<Array<{ id: string; name: string }>>
  readTable(tableId: string): Promise<{ fields: EidosFileFieldInfo[] }>
  readPluginConfig(tableId: string): ReturnType<TablePluginConfig["read"]>
  writePluginConfig(
    tableId: string,
    input: Parameters<TablePluginConfig["write"]>[0]
  ): ReturnType<TablePluginConfig["write"]>
}

export type TableAggregateMetric = "count" | "sum" | "average" | "min" | "max"

export type TableAggregateDateInterval = "exact" | "day" | "month" | "year"

export interface TableAggregateOptions {
  groupBy?: {
    fieldId: string
    dateInterval?: TableAggregateDateInterval
  }
  metric: {
    fieldId?: string
    op: TableAggregateMetric
  }
  sort?: "label" | "value-desc" | "value-asc"
}

export interface TableAggregateItem {
  key: unknown
  label: string
  value: number
}

export interface TableAggregateResult {
  items: TableAggregateItem[]
  totalRecords: number
}

export type SettingValue = boolean | string | number
export type SettingDeclaration = { title: string; description?: string } & (
  | { type: "boolean"; default: boolean }
  | { type: "string"; default: string; enum?: string[] }
  | { type: "number"; default: number; minimum?: number; maximum?: number }
)
export interface Settings {
  get(key: string): Promise<SettingValue>
  update(key: string, value: SettingValue): Promise<void>
  reset(key: string): Promise<void>
  observe(
    listener: (values: Record<string, SettingValue>) => void,
    onError?: ObserverErrorHandler
  ): Promise<{
    values: Record<string, SettingValue>
    subscription: Disposable
  }>
}
export interface HostUI {
  notify(message: string): Promise<void>
  select(options: {
    title: string
    options: Array<{ id: string; label: string }>
  }): Promise<{ status: "selected"; id: string } | { status: "cancelled" }>
  confirm(options: {
    title: string
    message: string
  }): Promise<{ status: "confirmed" | "cancelled" }>
  /** Opens an existing file in the host editor or viewer. */
  openFile(relativePath: string): Promise<void>
  navigate(viewId: string, route?: string): Promise<void>
}

export type ObserverErrorHandler = (error: {
  code: string
  message: string
}) => void
