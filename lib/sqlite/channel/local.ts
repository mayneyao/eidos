import { toast } from "@/components/ui/use-toast"
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
  constructor(connector: Worker | IpcRenderer) {
    this.connector = connector
    this.channel = new MessageChannel()
    this.channelMap = new Map()
    this.dataMap = new Map()
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

