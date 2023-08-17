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
