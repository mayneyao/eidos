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
  DataUpdateSignal = "DataUpdateSignal",
  WebSocketConnected = "WebSocketConnected",
  WebSocketDisconnected = "WebSocketDisconnected",
}

export enum MainServiceWorkerMsgType {
  // msg window => service worker
  SetData = "SetData",
}

export const mainServiceWorkerChannel = new BroadcastChannel("main-sw")
