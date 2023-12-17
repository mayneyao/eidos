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
  DataUpdateSignal = "DataUpdateSignal",
  WebSocketConnected = "WebSocketConnected",
  WebSocketDisconnected = "WebSocketDisconnected",

  ConvertMarkdown2State = "ConvertMarkdown2State",
  GetDocMarkdown = "GetDocMarkdown",
}

export enum MainServiceWorkerMsgType {
  // msg window => service worker
  SetData = "SetData",
}

export enum EidosDataEventChannelMsgType {
  DataUpdateSignalType = "DataUpdateSignalType",
}
export enum DataUpdateSignalType {
  Update = "update",
  Insert = "insert",
  Delete = "delete",
}

export const EidosDataEventChannelName = "eidos-data-event"
export const EidosSharedEnvChannelName = "eidos-shared-env"
