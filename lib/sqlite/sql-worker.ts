import { SqlDatabase } from "@/worker/sql"
import { DataConnection } from "peerjs"

import { toast } from "@/components/ui/use-toast"

import {
  ECollaborationMsgType,
  IMsgQueryResp,
} from "../collaboration/interface"
import { MsgType } from "../const"
import { logger } from "../log"
import { uuidv4 } from "../utils"
import { buildSql } from "./helper"

let worker: Worker

export const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("@/worker/index.ts", import.meta.url), {
      type: "module",
    })
    logger.info("load worker")
  }
  return worker
}

export type IQuery = {
  type: MsgType.CallFunction
  data: {
    method: string
    params: [string, string[]]
    dbName: string
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

/**
 * @param dbName
 * @param isShareMode when isShareMode is true, it means the database is shared other user, sql query will execute by other user and return result to us
 * @returns
 */
export const SQLWorker = (
  dbName: string,
  config?: {
    isShareMode?: boolean
    connection?: DataConnection
  }
) =>
  new Proxy<SqlDatabase>({} as any, {
    get(target, method) {
      if (method == "_config") {
        return config
      }
      return function (params: any) {
        const thisCallId = uuidv4()
        const [_params, ...rest] = arguments
        if (method === "sql") {
          /**
           * sql`SELECT * FROM ${Symbol(books)} WHERE id = ${1}`.
           * because sql is a tag function, it will be called with an array of strings and an array of values.
           * if values include Symbol, it will can't be transported to worker via postMessage
           * we need parse to sql first before transport to worker
           * just for sql`SELECT * FROM ${Symbol(books)} WHERE id = ${1}`. work in main thread and worker thread
           */
          const { sql, bind } = buildSql(_params, ...rest)
          const data: IQuery = {
            type: MsgType.CallFunction,
            data: {
              method: "sql4mainThread",
              params: [sql, bind],
              dbName,
            },
            id: thisCallId,
          }
          if (config?.isShareMode) {
            config.connection?.send({
              type: ECollaborationMsgType.QUERY,
              payload: data,
            })
          } else {
            worker.postMessage(data)
          }
        } else {
          worker.postMessage({
            type: MsgType.CallFunction,
            data: {
              method,
              params: [_params, ...rest],
              dbName,
            },
            id: thisCallId,
          })
        }

        return new Promise((resolve, reject) => {
          if (config?.isShareMode) {
            config.connection?.on("data", (data) => {
              console.log("receive data", data, thisCallId)
              const type = (data as any).type as ECollaborationMsgType
              if (type == ECollaborationMsgType.QUERY_RESP) {
                const _data = data as IMsgQueryResp
                if (_data.payload.id === thisCallId) {
                  resolve(_data.payload.data.result)
                }
              }
            })
          } else {
            worker.onmessage = (e) => {
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
          }
        })
      }
    },
  })
