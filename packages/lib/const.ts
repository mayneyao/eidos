import { isDesktopMode } from "./env"

export enum MsgType {
  // msg window => worker
  SetConfig = "SetConfig",
  CallFunction = "CallFunction",
  SwitchDatabase = "SwitchDatabase",
  CreateSpace = "CreateSpace",
  Syscall = "Syscall",

  // sync related commands. git-like
  Status = "Status",
  Pull = "Pull",
  Push = "Push",
  Reset = "Reset",
  Pages = "Pages",
  // msg worker => window
  Error = "Error",
  QueryResp = "QueryResp",
  Notify = "Notify",
  BlockUIMsg = "BlockUIMsg",
  Navigate = "Navigate",
  DataUpdateSignal = "DataUpdateSignal",
  WebSocketConnected = "WebSocketConnected",
  WebSocketDisconnected = "WebSocketDisconnected",

  // Iterator-related messages for streaming/iterable functions
  IteratorValue = "IteratorValue",
  IteratorDone = "IteratorDone",
  IteratorError = "IteratorError",
  IteratorCancel = "IteratorCancel",

  ConvertMarkdown2State = "ConvertMarkdown2State",
  ConvertHtml2State = "ConvertHtml2State",
  ConvertEmail2State = "ConvertEmail2State",

  GetDocMarkdown = "GetDocMarkdown",

  // table related msg
  HighlightRow = "HighlightRow",

  GetTheme = "GetTheme",
  SetTheme = "SetTheme",
  ListThemes = "ListThemes",
  SetCurrentTheme = "SetCurrentTheme",
  ApplyTheme = "ApplyTheme",
}

export enum MainServiceWorkerMsgType {
  // msg window => service worker
  SetData = "SetData",
}

export enum EidosDataEventChannelMsgType {
  // trigger when data of custom table tb_xxx changes
  DataUpdateSignalType = "DataUpdateSignalType",
  // trigger when schema of custom table tb_xxx or eidos__docs changes
  SchemaUpdateSignalType = "SchemaUpdateSignalType",
  // trigger when data of system meta table eidos__xxx changes
  MetaTableUpdateSignalType = "MetaTableUpdateSignalType",

}

export type EidosDataEventChannelMsg = {
  type: EidosDataEventChannelMsgType
  payload: {
    type: DataUpdateSignalType
    table: string
    _new: Record<string, any> & {
      _id: string
    }
    _old: Record<string, any> & {
      _id: string
    }
  }
}

export enum DataUpdateSignalType {
  Update = "update",
  Insert = "insert",
  Delete = "delete",
  // just for generated column
  AddColumn = "addColumn",
  UpdateColumn = "updateColumn",
  DeleteColumn = "deleteColumn",
}

export const EidosDataEventChannelName = "eidos-data-event"
export const EidosSharedEnvChannelName = "eidos-shared-env"
export const EidosMessageChannelName = "eidos-message"
export const EidosProtocolUrlChannelName = "eidos-protocol-url"
// TODO: replace hard-coded link
export const URLS = {
  HOME: "https://eidos.space",
  LINK_PREVIEW: "https://link-preview.eidos.space",
  WIKI: "https://wiki.eidos.space",
  DOWNLOAD: "https://eidos.space/download",
  ACTIVATION_SERVER: "https://active.eidos.space",
  EXTENSION_SERVER: "https://ext.eidos.space",
  API_AGENT_SERVER: "https://api.eidos.space",
  DISCORD_INVITE: "https://discord.gg/cGQqjeFpZq",
  GITHUB_ISSUES: "https://github.com/mayneyao/eidos/issues/",
  // API for Browser running in Electron
  GEOLOCATION_API: "https://geolocation.api.eidos.space/",

  // Account Registration
  ACCOUNT_REGISTRATION: "https://eidos.space/auth/register",

  CHANGELOG: "https://eidos.space/changelog",
}

// custom Event, dispatch via window
export enum CustomEventType {
  UpdateColumn = "eidos-update-column",
}

export const EIDOS_PORT = 13127
export const EIDOS_SPACE_BASE_URL = process.env.NODE_ENV === "production" ? "https://eidos.space" : "http://localhost:4321";

export const EIDOS_CHAT_PROJECT_ID = "EIDOS_CHAT"

export const EIDOS_PROXY_URL = isDesktopMode ? "http://proxy.eidos.localhost:13127/?url=" : "https://proxy.eidos.space/?url="

// Worker initialization constants
export const WORKER_INIT_MESSAGES = {
  INIT: 'init',
  INIT_FAILED: 'init_failed',
  INIT_TIMEOUT: 'init_timeout'
} as const

export const WORKER_INIT_CONFIG = {
  RETRY_INTERVAL: 50, // ms
  MAX_RETRIES: 200,   // 10 seconds total (200 * 50ms)
  WEBSOCKET_DELAY: 1000 // ms
} as const

export const WORKER_MESSAGE_TYPES = {
  IS_WORKER_INITIALIZED: 'isWorkerInitialized'
} as const