import { DataSpace, EidosTable } from "@/worker/web-worker/DataSpace"
import { DataConnection } from "peerjs"

import {
  ECollaborationMsgType,
  IMsgForward,
  IMsgQueryResp,
} from "@/lib/collaboration/interface"
import { EidosDataEventChannelName, MsgType } from "@/lib/const"
import { toast } from "@/components/ui/use-toast"

export interface ISqlite<T, D> {
  connector: T
  send: (data: D) => void
  onCallBack: (thisCallId: string) => Promise<any>
}

export interface ILocalSendData {
  type: MsgType.CallFunction
  data: {
    method: string
    params: any[]
    dbName: string
    tableId?: string
    userId?: string
  }
  id: string
}

export class LocalSqlite implements ISqlite<Worker, ILocalSendData> {
  connector: Worker
  channel: MessageChannel
  channelMap: Map<string, MessageChannel>
  constructor(connector: Worker) {
    this.connector = connector
    this.channel = new MessageChannel()
    this.channelMap = new Map()
  }

  getChannel(id: string) {
    return this.channelMap.get(id)
  }
  destroyChannel(id: string) {
    this.channelMap.delete(id)
  }

  send(data: ILocalSendData) {
    /**
     * every msg need to have a unique id,
     * one msg id, one channel
     * channel map used to avoid parallel sending
     */
    const msgId = data.id
    const channel = new MessageChannel()
    this.channelMap.set(msgId, channel)
    return this.connector.postMessage(data, [channel.port2])
  }
  onCallBack(thisCallId: string) {
    return new Promise((resolve, reject) => {
      // https://advancedweb.hu/how-to-use-async-await-with-postmessage/ saves me, there is a bug when use id to match msg, channel is the right way
      const channel = this.getChannel(thisCallId)
      if (!channel) {
        return
      }
      channel.port1.onmessage = (e) => {
        this.channel.port1.close()
        this.destroyChannel(thisCallId)
        const { id: returnId, type, data } = e.data
        switch (type) {
          case MsgType.Error:
            toast({
              title: "Error",
              description: data.message,
              duration: 5000,
            })
            break
          case MsgType.DataUpdateSignal:
            console.log("data update signal", e)
            window.postMessage(e.data)
            break
          // req-resp msg need to match id
          case MsgType.QueryResp:
            if (returnId === thisCallId) {
              resolve(data.result)
            }
            break
          default:
            break
        }
      }
    })
  }
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
