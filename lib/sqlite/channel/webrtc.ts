import { DataConnection } from "peerjs"

import {
    ECollaborationMsgType,
    IMsgForward,
    IMsgQueryResp,
} from "@/lib/collaboration/interface"
import { EidosDataEventChannelName } from "@/lib/const"

export interface ISqlite<T, D> {
  connector: T
  send: (data: D) => void
  onCallBack: (thisCallId: string) => Promise<any>
}

export class RemoteSqlite implements ISqlite<DataConnection, any> {
  connector: DataConnection
  bc: BroadcastChannel
  constructor(connector: DataConnection) {
    this.connector = connector
    this.bc = new BroadcastChannel(EidosDataEventChannelName)
  }

  send(data: any) {
    return this.connector.send({
      type: ECollaborationMsgType.QUERY,
      payload: data,
    })
  }

  onCallBack(thisCallId: string) {
    return new Promise((resolve, reject) => {
      this.connector.on("data", (data) => {
        // console.log("receive data", data, thisCallId)
        const type = (data as any).type as ECollaborationMsgType
        if (type == ECollaborationMsgType.QUERY_RESP) {
          const _data = data as IMsgQueryResp
          if (_data.payload.id === thisCallId) {
            resolve(_data.payload.data.result)
          }
        }
        if (type == ECollaborationMsgType.FORWARD) {
          const _data = data as IMsgForward
          if (_data.payload) {
            this.bc.postMessage(_data.payload)
          }
        }
      })
    })
  }
}
