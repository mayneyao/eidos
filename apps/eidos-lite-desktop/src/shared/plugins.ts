import type {
  PluginManifest,
  PluginRequest,
  PluginResponse,
  PluginEvent,
  TextChange,
} from "@eidos.space/plugin-runtime/rpc"
import type {
  SettingValue,
  ExplorerState,
  ViewConfiguration,
} from "@eidos.space/plugin-sdk"
import type { OpenEidosFileResult, SpacePathMutationResult } from "./contracts"
export interface PluginBinding {
  hash: string
  enabled: boolean
}
export interface PluginSpaceConfig {
  plugins: Record<string, { enabled: boolean }>
  associations: Record<string, string>
  formatters?: Record<string, string>
  explorer?: string
}
export interface PluginListing {
  plugins: {
    manifest: PluginManifest
    hash: string
    enabled: boolean
    developmentPath?: string
    unavailable?: boolean
  }[]
  space: PluginSpaceConfig | null
  associations?: Record<string, string>
  activeThemeId?: string | null
}
export interface MarketplaceScreenshot {
  path: string
  alt: string
}
export interface MarketplacePlugin {
  kind?: "theme"
  id: string
  name: string
  description: string
  repo: string
  version: string
  tag: string
  asset: string
  sha256: string
  preview: boolean
  compatibility: string
  icon?: PluginManifest["icon"]
  screenshots?: MarketplaceScreenshot[]
}
export interface PluginMarketplace {
  plugins: MarketplacePlugin[]
  cached: boolean
  fetchedAt: string
}
export interface PluginEditorChoice {
  key: string
  label: string
  pluginName: string
  icon?: PluginManifest["icon"] | null
}
export interface PluginOpenResult {
  instance: { ticket: string; url: string; editor: PluginEditorChoice } | null
  warning?: string
}
export interface PluginRpcResult {
  /** Trusted workbench payload; never forwarded to a plugin guest. */
  resource?: PluginResourceChange
  draftPath?: string
  navigation?: { key: string; route: string }
  notification?: string
  openFile?: string
  response: PluginResponse
  draft?: TextChange | null
}
export type PluginResourceContent =
  | { kind: "file-view"; path: string; plugin: PluginOpenResult }
  | { kind: "text"; text: string; path: string }
  | { kind: "image"; url: string; path: string }
  | {
      kind: "eidos-view"
      opened: OpenEidosFileResult
      tableId: string
      viewId: string
      plugin: PluginOpenResult | null
      configuration?: ViewConfiguration
    }
export interface PluginResourceRect {
  occlusions?: Array<{ x: number; y: number; width: number; height: number }>
  interactive?: boolean
  x: number
  y: number
  width: number
  height: number
  clipTop: number
  clipRight: number
  clipBottom: number
  clipLeft: number
}
export type PluginResourceChange =
  | { kind: "mount"; id: string; content: PluginResourceContent }
  | { kind: "layout"; id: string; rect: PluginResourceRect }
  | { kind: "dispose"; id: string }
export interface PluginInstallProgress {
  id: string
  phase: "downloading" | "installing"
  loaded?: number
  total?: number
  percent?: number
}
export type PluginInstallStatus = "queued" | "downloading" | "installing"
export interface PluginInstallTask {
  id: string
  status: PluginInstallStatus
  percent: number
}
export interface PluginApi {
  createPluginFile(
    key: string,
    parent: string | null,
    name: string
  ): Promise<SpacePathMutationResult>
  pluginSettings(id: string): Promise<Record<string, SettingValue>>
  setPluginSetting(
    id: string,
    key: string,
    value: SettingValue | null
  ): Promise<void>
  pluginMarketplace(refresh?: boolean): Promise<PluginMarketplace>
  pluginReadme(id: string): Promise<string | null>
  installMarketplacePlugin(id: string): Promise<boolean>
  onPluginInstallProgress(
    listener: (progress: PluginInstallProgress) => void
  ): () => void
  onPluginInstallIntent(listener: (id: string) => void): () => void
  openPluginTable(
    key: string,
    tableId: string,
    viewId: string
  ): Promise<PluginOpenResult>
  setFormatterContext(path: string | null, version: string): Promise<void>
  setDefaultFormatter(
    extension: string,
    formatter: string | null
  ): Promise<void>
  invokePluginFormatter(
    ticket: string,
    formatter: string,
    path: string,
    draft?: TextChange,
    contextVersion?: string
  ): Promise<{ draft?: TextChange | null; changed?: boolean }>
  setPluginShortcuts(bindings: string[]): Promise<string[]>
  onPluginShortcut(listener: (binding: string) => void): () => void
  openPluginPage(key: string, route?: string): Promise<PluginOpenResult>
  openPluginExplorer(
    key: string,
    state: ExplorerState
  ): Promise<PluginOpenResult>
  setPluginExplorer(key: string | null): Promise<void>
  openPluginExtension(
    id: string,
    table?: { tableId: string; viewId: string }
  ): Promise<PluginOpenResult>
  pluginConnection(
    ticket: string,
    connection: string,
    operation: "status" | "save" | "configure" | "request" | "cancel",
    value?: unknown,
    invocation?: string
  ): Promise<unknown>
  invokePluginAction(
    ticket: string,
    action: string,
    relativePath?: string,
    draft?: TextChange
  ): Promise<{ draft?: TextChange | null }>
  onPluginEvent(
    listener: (event: { ticket: string; event: PluginEvent }) => void
  ): () => void
  listPlugins(): Promise<PluginListing>
  installPlugin(development?: boolean): Promise<boolean>
  installDroppedPlugin(file: File): Promise<boolean>
  uninstallPlugin(id: string): Promise<boolean>
  setPluginEnabled(id: string, enabled: boolean): Promise<void>
  selectPluginTheme(id: string | null): Promise<void>
  setPluginDefault(extension: string, editor: string | null): Promise<void>
  pluginEditors(relativePath: string): Promise<PluginEditorChoice[]>
  openPluginEditor(
    relativePath: string,
    explicit?: string,
    draft?: TextChange
  ): Promise<PluginOpenResult>
  pluginRequest(
    ticket: string,
    request: PluginRequest
  ): Promise<PluginRpcResult>
  closePluginEditor(ticket: string): Promise<void>
}
export const PLUGIN_CHANNELS = {
  createFile: "eidos-lite:plugins-create-file",
  settings: "eidos-lite:plugins-settings",
  setSetting: "eidos-lite:plugins-set-setting",
  connection: "eidos-lite:plugins-connection",
  marketplace: "eidos-lite:plugins-marketplace",
  readme: "eidos-lite:plugins-readme",
  table: "eidos-lite:plugins-table",
  formatterContext: "eidos-lite:plugins-formatter-context",
  formatter: "eidos-lite:plugins-formatter",
  defaultFormatter: "eidos-lite:plugins-default-formatter",
  shortcuts: "eidos-lite:plugins-shortcuts",
  shortcut: "eidos-lite:plugins-shortcut",
  page: "eidos-lite:plugins-page",
  explorer: "eidos-lite:plugins-explorer",
  selectExplorer: "eidos-lite:plugins-select-explorer",
  extension: "eidos-lite:plugins-extension",
  invoke: "eidos-lite:plugins-invoke",
  event: "eidos-lite:plugins-event",
  list: "eidos-lite:plugins-list",
  install: "eidos-lite:plugins-install",
  installProgress: "eidos-lite:plugins-install-progress",
  installIntent: "eidos-lite:plugins-install-intent",
  uninstall: "eidos-lite:plugins-uninstall",
  enable: "eidos-lite:plugins-enable",
  selectTheme: "eidos-lite:plugins-select-theme",
  associate: "eidos-lite:plugins-associate",
  editors: "eidos-lite:plugins-editors",
  open: "eidos-lite:plugins-open",
  request: "eidos-lite:plugins-request",
  close: "eidos-lite:plugins-close",
} as const

export * from "./plugin-version"
