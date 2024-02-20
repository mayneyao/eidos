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
