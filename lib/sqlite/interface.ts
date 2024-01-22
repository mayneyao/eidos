import { MsgType } from "../const"

export type IQuery = {
  type: MsgType.CallFunction
  data: {
    method: string
    params: [string, string[]]
    dbName: string
    userId: string
  }
  id: string
}

export type IQueryResp = {
  id: string
  data: {
    result: any
  }
  type: MsgType.QueryResp
}

export type ITreeItem = {
  id: string
  name: string
  type: "table" | "doc"
}
