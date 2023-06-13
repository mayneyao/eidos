import { MsgType } from "../const"
import { IQueryResp } from "../sqlite/interface"

export interface ICollaborator {
  id: string
  name: string
}

export enum ECollaborationMsgType {
  // basic
  JOIN = "JOIN",
  LEAVE = "LEAVE",

  // actions
  MOVE_CURSOR = "MOVE_CURSOR",
  QUERY = "QUERY",
  QUERY_RESP = "QUERY_RESP",
}

export interface IMsgJoin {
  type: ECollaborationMsgType.JOIN
  payload: {
    collaborator: ICollaborator
  }
}

export interface IMsgLeave {
  type: ECollaborationMsgType.LEAVE
  payload: {
    collaborator: ICollaborator
  }
}

export interface IMsgMoveCursor {
  type: ECollaborationMsgType.MOVE_CURSOR
  payload: {
    collaboratorId: string
    cursor: [number, number]
  }
}

export interface IMsgQuery {
  type: ECollaborationMsgType.QUERY
  payload: {
    collaboratorId: string
    query: {
      type: MsgType.CallFunction
      data: {
        method: string
        params: [string, string[]]
        dbName: string
      }
      id: string
    }
  }
}

export interface IMsgQueryResp {
  type: ECollaborationMsgType.QUERY_RESP
  payload: IQueryResp
}

export type IMsg = IMsgJoin | IMsgLeave | IMsgMoveCursor | IMsgQuery
