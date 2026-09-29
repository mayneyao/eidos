export type PluginIconDefinition =
  | string
  | { paths: string[] }
  | { src: string }
  | { file: string }

// Public type-only SDK for Eidos Plugin API 3.0.
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
  connections?: Record<
    string,
    { title: string; url: string; configurable?: boolean }
  >
  /** Standalone Eidos Lite host theme. Theme packages contain no executable contributions. */
  theme?: ThemeDeclaration
}
export interface ThemeDeclaration {
  /** Source path, replaced with validated CSS and embedded fonts when packaged. */
  stylesheet: string
}
export type ViewCapability =
  | "document"
  | "eidos/schema"
  | "eidos/table"
  | "eidos/config"

export interface ViewDeclaration {
  id: string
  title: string
  entry: string
  kind: "page" | "file"
  /** Required data capabilities. Eidos capabilities can be combined. */
  capabilities?: ViewCapability[]
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
export interface ActionDeclaration {
  id: string
  title: string
  context: "workspace" | "file" | "document" | "table"
  access?: "read" | "write"
  extensions?: string[]
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
export interface CommonCapabilities {
  readonly fs?: PluginFileSystem
  readonly storage?: PluginStorage
  readonly network?: PluginNetwork
  readonly settings?: Pick<PluginSettings, "get">
  readonly connections?: PluginConnections
  readonly ui: HostUI
}
export interface CommonContext extends Lifetime {
  readonly capabilities: CommonCapabilities
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

export interface FileMetadata {
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
  delete(key: string): Promise<void>
}

/** Display identity only. IDs and paths are never authority for operations. */
export interface FileRef extends Partial<FileMetadata> {
  readonly id: string
}
export type ViewBinding =
  | { kind: "page"; route: string }
  | {
      kind: "file"
      file: FileRef
      location?: { kind: "eidos-table"; tableId: string; viewId: string }
    }

export interface ViewCapabilities extends CommonCapabilities {
  readonly document?: TextDocument
  readonly eidos?: EidosCapabilities
}

export interface ViewContext extends CommonContext {
  readonly binding: ViewBinding
  readonly capabilities: ViewCapabilities
}
export type TextFileViewContext = ViewContext & {
  readonly binding: Extract<ViewBinding, { kind: "file" }>
  readonly capabilities: ViewCapabilities & { readonly document: TextDocument }
}
export type TableFileViewContext = ViewContext & {
  readonly binding: Extract<ViewBinding, { kind: "file" }>
  readonly capabilities: ViewCapabilities & {
    readonly eidos: EidosCapabilities & { readonly table: EidosTable }
  }
}
export type ActionBinding =
  | { kind: "workspace" }
  | { kind: "file"; file: FileRef }
export interface ActionContext extends CommonContext {
  readonly binding: ActionBinding
  readonly capabilities: CommonCapabilities & {
    readonly document?: TextDocument
    readonly settings: PluginSettings
  }
}
export interface ExtensionContext extends Lifetime {
  readonly capabilities: {
    readonly formatters: {
      register(id: string, provider: FormatterProvider): Disposable
    }
    readonly actions: {
      registerTableProvider(
        id: string,
        provider: TableActionProvider
      ): Disposable
      register(
        id: string,
        handler: (ctx: ActionContext) => void | Promise<void>
      ): Disposable
    }
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
  readonly capabilities: TableActionCapabilities
}
export interface TableActionCapabilities {
  readonly eidos: {
    readonly table: Pick<EidosTable, "tableId" | "viewId" | "readContext">
    readonly config: Pick<EidosConfig, "read">
  }
  readonly target: {
    count: number
    readRows(options: {
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
    /** Validates output samples and establishes the fields this run may update. */
    declareOutputs(
      rows: Array<{ readToken: string; values: Record<string, LogicalValue> }>
    ): Promise<void>
    report(progress: { completed: number; message?: string }): Promise<void>
  }
}
export interface TableActionProvider {
  getItems(context: {
    readonly signal: AbortSignal
    readonly capabilities: Pick<TableActionCapabilities, "eidos">
  }): Promise<TableActionItem[]> | TableActionItem[]
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
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
export interface EidosTable {
  readonly tableId: string
  readonly viewId: string
  readContext(): Promise<EidosTableSnapshot>
  readRows(options: {
    offset: number
    limit: number
  }): Promise<EidosFileRowPage>
  aggregate(options: TableAggregateOptions): Promise<TableAggregateResult>
  /** Replaces the saved view's plugin configuration. Merge retained keys before setting. */
  setViewConfig(config: Record<string, unknown>): Promise<void>
  openRecord(rowId: string): Promise<void>
  /** Invalidation notifications only; readContext/readRows supply current values. */
  watch(listener: () => void): Disposable
}
export interface EidosConfigSnapshot {
  value: JsonObject | null
  version: string
}
export interface EidosTableSnapshot {
  fields: EidosFileFieldInfo[]
  view: EidosFileViewInfo
}

/** Capabilities for the current Eidos file and optional table location. */
export interface EidosCapabilities {
  readonly schema?: EidosSchema
  readonly table?: EidosTable
  readonly config?: EidosConfig
}
export interface EidosSchema {
  listTables(): Promise<Array<{ id: string; name: string }>>
  readTable(tableId: string): Promise<{ fields: EidosFileFieldInfo[] }>
}
/** Config is scoped to this plugin; a table binding restricts tableId to that table. */
export interface EidosConfig {
  read(tableId: string): Promise<EidosConfigSnapshot>
  write(
    tableId: string,
    input: { value: JsonObject | null; expectedVersion: string }
  ): Promise<EidosConfigSnapshot>
  /** Invalidation hint; may include unrelated changes. Read again for current values. */
  watch(tableId: string, listener: () => void): Disposable
}
export interface PluginConnections {
  isConfigured(connection: string): Promise<boolean>
  request(input: { connection: string; body: JsonObject }): Promise<JsonObject>
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
export interface PluginSettings {
  get(key: string): Promise<SettingValue>
  set(key: string, value: SettingValue): Promise<void>
  reset(key: string): Promise<void>
}
export interface HostUI {
  notify(message: string): Promise<void>
  /** Opens an existing file in the host editor or viewer. */
  openFile?(relativePath: string): Promise<void>
  navigate?(viewId: string, route?: string): Promise<void>
}

export type ObserverErrorHandler = (error: {
  code: string
  message: string
}) => void
