import { MsgType } from "@/lib/const"
import type { IpcRenderer } from 'electron';

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

export class LocalSqlite implements ISqlite<Worker | IpcRenderer, ILocalSendData> {
  connector: Worker | IpcRenderer
  channel: MessageChannel
  channelMap: Map<string, MessageChannel>
  dataMap: Map<string, any>
  options?: {
    readonly?: boolean
  }
  constructor(connector: Worker | IpcRenderer, options?: {
    readonly?: boolean
  }) {
    this.connector = connector
    this.channel = new MessageChannel()
    this.channelMap = new Map()
    this.dataMap = new Map()
    this.options = options
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
    if (this.connector instanceof Worker) {
      this.connector.postMessage(data, [channel.port2])
    } else {
      if (this.options?.readonly) {
        return this.connector.invoke('sqlite-msg-read', data)
      }
      return this.connector.invoke('sqlite-msg', data)
    }
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
            // Log error instead of showing toast - core package shouldn't handle UI notifications
            console.error("SQLite operation failed:", data.message)
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

