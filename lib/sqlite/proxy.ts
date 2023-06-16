import { SqlDatabase } from "@/worker/sql"
import { DataConnection } from "peerjs"

import { toast } from "@/components/ui/use-toast"

import {
  ECollaborationMsgType,
  IMsgQueryResp,
} from "../collaboration/interface"
import { MsgType } from "../const"
import { uuidv4 } from "../utils"
import { buildSql } from "./helper"
import { IQuery } from "./interface"
import { getWorker } from "./worker"

interface ISqlite<T> {
  connector: T
  send: (data: any) => void
  onCallBack: (thisCallId: string) => Promise<any>
}

export class LocalSqlite implements ISqlite<Worker> {
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

  send(data: any) {
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

export class RemoteSqlite implements ISqlite<DataConnection> {
  connector: DataConnection

  constructor(connector: DataConnection) {
    this.connector = connector
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
      })
    })
  }
}

export const getSqliteProxy = (
  dbName: string,
  config?: {
    isShareMode: boolean
    connection: DataConnection
  }
) => {
  let sqlite: ISqlite<any>
  if (config) {
    const { isShareMode, connection } = config
    sqlite = new RemoteSqlite(connection)
  } else {
    sqlite = new LocalSqlite(getWorker())
  }

  return new Proxy<SqlDatabase>({} as any, {
    get(target, method) {
      if (method == "_config") {
        return config
      }
      return function (params: any) {
        const thisCallId = uuidv4()
        const [_params, ...rest] = arguments

        if (["sql", "sql2"].includes(method as string)) {
          /**
           * sql`SELECT * FROM ${Symbol(books)} WHERE id = ${1}`.
           * because sql is a tag function, it will be called with an array of strings and an array of values.
           * if values include Symbol, it will can't be transported to worker via postMessage
           * we need parse to sql first before transport to worker
           * this make sql`SELECT * FROM ${Symbol(books)} WHERE id = ${1}`  works in main thread and worker thread
           *
           * sql return array of array, for performance reason
           * sql2 return array of object, for easy to use
           */
          const { sql, bind } = buildSql(_params, ...rest)
          const callMethod =
            method == "sql2" ? "sql4mainThread2" : "sql4mainThread"
          const data: IQuery = {
            type: MsgType.CallFunction,
            data: {
              method: callMethod,
              params: [sql, bind],
              dbName,
            },
            id: thisCallId,
          }
          sqlite.send(data)
        } else {
          sqlite.send({
            type: MsgType.CallFunction,
            data: {
              method,
              params: [_params, ...rest],
              dbName,
            },
            id: thisCallId,
          })
        }
        return sqlite.onCallBack(thisCallId)
      }
    },
  })
}
