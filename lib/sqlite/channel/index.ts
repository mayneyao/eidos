import { DataSpace, EidosTable } from "@/worker/web-worker/DataSpace"
import { DataConnection } from "peerjs"

import { MsgType } from "../../const"
import { isDesktopMode, isInkServiceMode } from "../../env"
import { uuidv7 } from "../../utils"
import { HttpSqlite } from "./http"
import { ILocalSendData, LocalSqlite } from "./local"
import { buildSql } from "../helper"
import { IQuery, ISqlite } from "../interface"
import { getWorker } from "../worker"
import { RemoteSqlite } from "./webrtc"


export const getSqliteChannel = (dbName: string, userId: string, config?: {
  isShareMode: boolean
  connection: DataConnection
}) => {
  let sqlite: ISqlite<any, ILocalSendData>
  if (isDesktopMode) {
    sqlite = new LocalSqlite((window as any).eidos)
  } else if (isInkServiceMode) {
    const serverSqlite = new HttpSqlite("/server/api")
    sqlite = serverSqlite
  } else if (config) {
    const { isShareMode, connection } = config
    sqlite = new RemoteSqlite(connection)
  } else {
    sqlite = new LocalSqlite(getWorker())
  }
  return sqlite
}

export const getSqliteProxy = (
  dbName: string,
  userId: string,
  config?: {
    isShareMode: boolean
    connection: DataConnection
  }
) => {
  const sqlite = getSqliteChannel(dbName, userId, config)
  return new Proxy<DataSpace>({} as any, {
    get(target, method) {
      if (method == "_config") {
        return config
      }
      // const r = await sqlite.table("91ba4dd2ad4447cf943db88dbb861323").rows.query()
      if (method == "table") {
        return function (id: string) {
          return new Proxy<DataSpace>({} as any, {
            get(target, method) {
              if (method == "rows") {
                return new Proxy<DataSpace>({} as any, {
                  get(target, method) {
                    return function (params: any) {
                      const thisCallId = uuidv7()
                      const [_params, ...rest] = arguments
                      const res = sqlite.send({
                        type: MsgType.CallFunction,
                        data: {
                          method: `table(${id}).rows.${method as string}`,
                          params: [_params, ...rest],
                          dbName,
                          tableId: id,
                          userId,
                        },
                        id: thisCallId,
                      })
                      if (res) {
                        return res
                      }
                      return sqlite.onCallBack(thisCallId)
                    }
                  },
                })
              }
              return function (params: any) {
                const thisCallId = uuidv7()
                const [_params, ...rest] = arguments
                const res = sqlite.send({
                  type: MsgType.CallFunction,
                  data: {
                    method: `table("${id}").${method as string}`,
                    params: [_params, ...rest],
                    dbName,
                    tableId: id,
                    userId,
                  },
                  id: thisCallId,
                })
                if (res) {
                  return res
                }
                return sqlite.onCallBack(thisCallId)
              }
            },
          })
        }
      }
      if (
        [
          "doc",
          "action",
          "script",
          "tree",
          "view",
          "column",
          "embedding",
          "file",
        ].includes(method as string)
      ) {
        return new Proxy<EidosTable>({} as any, {
          get(target, subMethod) {
            return function (params: any) {
              const thisCallId = uuidv7()
              const [_params, ...rest] = arguments
              const res = sqlite.send({
                type: MsgType.CallFunction,
                data: {
                  method: `${method as string}.${subMethod as string}`,
                  params: [_params, ...rest],
                  dbName,
                  userId,
                },
                id: thisCallId,
              })
              if (res) {
                return res
              }
              return sqlite.onCallBack(thisCallId)
            }
          },
        })
      }
      return function (params: any) {
        const thisCallId = uuidv7()
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
          // console.log(sql, bind)
          const callMethod =
            method == "sql2" ? "sql4mainThread2" : "sql4mainThread"
          const data: IQuery = {
            type: MsgType.CallFunction,
            data: {
              method: callMethod,
              params: [sql, bind],
              dbName,
              userId,
            },
            id: thisCallId,
          }
          const r = sqlite.send(data)
          if (r) {
            return r
          }
        } else {
          const res = sqlite.send({
            type: MsgType.CallFunction,
            data: {
              method: method as string,
              params: [_params, ...rest],
              dbName,
              userId,
            },
            id: thisCallId,
          })
          if (res) {
            return res
          }
        }
        return sqlite.onCallBack(thisCallId)
      }
    },
  })
}
