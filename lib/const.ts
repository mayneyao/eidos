export enum MsgType {
  // msg window => worker
  SetConfig = "SetConfig",
  CallFunction = "CallFunction",
  SwitchDatabase = "SwitchDatabase",
  CreateSpace = "CreateSpace",
  Syscall = "Syscall",

  // msg worker => window
  Error = "Error",
  QueryResp = "QueryResp",
  Notify = "Notify",
  BlockUIMsg = "BlockUIMsg",
  DataUpdateSignal = "DataUpdateSignal",
  WebSocketConnected = "WebSocketConnected",
  WebSocketDisconnected = "WebSocketDisconnected",

  ConvertMarkdown2State = "ConvertMarkdown2State",
  ConvertHtml2State = "ConvertHtml2State",
  ConvertEmail2State = "ConvertEmail2State",

  GetDocMarkdown = "GetDocMarkdown",

  // table related msg
  HighlightRow = "HighlightRow",
}

export enum MainServiceWorkerMsgType {
  // msg window => service worker
  SetData = "SetData",
}

export enum EidosDataEventChannelMsgType {
  DataUpdateSignalType = "DataUpdateSignalType",
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
}

export const EidosDataEventChannelName = "eidos-data-event"
export const EidosSharedEnvChannelName = "eidos-shared-env"
export const EidosMessageChannelName = "eidos-message"

// TODO: replace hard-coded link
export const DOMAINS = {
  IMAGE_PROXY: "https://proxy.eidos.space",
  LINK_PREVIEW: "https://link-preview.eidos.space",
  WIKI: "https://wiki.eidos.space",
  ACTIVATION_SERVER: "https://active.eidos.space",
  EXTENSION_SERVER: "https://ext.eidos.space",
  API_AGENT_SERVER: "https://api.eidos.space",
  DISCORD_INVITE: "https://discord.gg/bsGMPDR23b",
}

// custom Event, dispatch via window
export enum CustomEventType {
  UpdateColumn = "eidos-update-column",
}
