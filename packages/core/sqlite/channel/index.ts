import type { DataSpace, EidosTable } from "../../data-space"
import type { DataConnection } from "peerjs"

import { HttpSqlite } from "./http"
import type { ILocalSendData } from "./local"
import { LocalSqlite } from "./local"
import { buildSql } from "../helper"
import type { IQuery, ISqlite } from "../interface"
import { getWorker } from "../worker"
import { RemoteSqlite } from "./webrtc"
import { MsgType } from "@/lib/const"
import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { uuidv7 } from "uuidv7"
import { isIteratorFunction, serializeParams } from "./iterator-utils"

type IConfig = {
  isShareMode?: boolean
  connection?: DataConnection
  isReadonly?: boolean
}
export const getSqliteChannel = (
  dbName: string,
  userId: string,
  config?: IConfig
) => {
  let sqlite: ISqlite<any, ILocalSendData>
  if (isDesktopMode) {
    if (config?.isReadonly) {
      sqlite = new LocalSqlite((window as any).eidosReadonly, {
        readonly: true,
      })
    } else {
      sqlite = new LocalSqlite((window as any).eidos)
    }
  } else if (isInkServiceMode) {
    const serverSqlite = new HttpSqlite("/server/api")
    sqlite = serverSqlite
  } else if (config) {
    const { isShareMode, connection } = config
    if (connection) {
      sqlite = new RemoteSqlite(connection)
    } else {
      throw new Error("connection is required")
    }
  } else {
    sqlite = new LocalSqlite(getWorker())
  }
  return sqlite
}

export const getSqliteProxy = (
  dbName: string,
  userId: string,
  config?: IConfig
) => {
  const sqlite = getSqliteChannel(dbName, userId, config)
  return new Proxy<DataSpace>({} as any, {
    get(target, method) {
      if (method == "_config") {
        return config
      }
      // const r = await sqlite.table("91ba4dd2ad4447cf943db88dbb861323").rows.query()
      // Legacy table API (deprecated, kept for internal use)
      if (
        method === "_table" ||
        /^[A-Z][A-Za-z0-9_]*$/.test(method as string)
      ) {
        return function (id: string) {
          const tableId = /^[A-Z]/.test(method as string)
            ? (method as string)
            : id
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
                          method: `_table(${tableId}).rows.${method as string}`,
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
                    method: `_table("${tableId}").${method as string}`,
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

      // Prisma-style table() API - official
      if (method === "table") {
        return function (id: string) {
          const tableMethods = [
            "create",
            "createMany",
            "findUnique",
            "findFirst",
            "findMany",
            "count",
            "update",
            "updateMany",
            "delete",
            "deleteMany",
          ]
          return new Proxy<DataSpace>({} as any, {
            get(target, method) {
              if (tableMethods.includes(method as string)) {
                return function (args: any) {
                  const thisCallId = uuidv7()
                  const res = sqlite.send({
                    type: MsgType.CallFunction,
                    data: {
                      method: `table(${id}).${method as string}`,
                      params: [args],
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
              }
              return undefined
            },
          })
        }
      }
      if (
        [
          "doc",
          "graft",
          "node",
          "action",
          "schema",
          // deprecated, use extension instead
          "script",
          "extension",
          "tree",
          "view",
          "column",
          "embedding",
          "file",
          "chat",
          "message",
          "queue",
          "extNode",
          "theme",
          "dataView",
          "kv",
          "fs",
        ].includes(method as string)
      ) {
        return new Proxy<EidosTable>({} as any, {
          get(target, subMethod) {
            return function (params: any) {
              const thisCallId = uuidv7()
              const [_params, ...rest] = arguments
              const methodName = `${method as string}.${subMethod as string}`

              // Check if this is an iterator function using the registry
              const isIterFunc = isIteratorFunction(methodName)

              // Smart parameter serialization - extract non-serializable values
              const { serialized: serializedParams, extracted } =
                serializeParams([_params, ...rest])

              // Extract AbortSignal if present (for cancellation support)
              let abortSignal: AbortSignal | undefined
              for (const [path, item] of extracted.entries()) {
                if (item.type === "AbortSignal") {
                  abortSignal = item.value
                  break
                }
              }

              const res = sqlite.send({
                type: MsgType.CallFunction,
                data: {
                  method: methodName,
                  params: serializedParams,
                  dbName,
                  userId,
                },
                id: thisCallId,
              })

              // Use iterator mode for iterator functions
              if (isIterFunc && sqlite.onIterator) {
                const iterator = sqlite.onIterator(thisCallId)

                // If AbortSignal is provided, set up cancellation
                if (abortSignal) {
                  const cancelHandler = () => {
                    // Send cancel message to remote
                    // For Electron, we need to use IPC send instead of the regular send method
                    if (sqlite instanceof LocalSqlite) {
                      const connector = (sqlite as any).connector
                      if (!(connector instanceof Worker)) {
                        // Electron mode: use IPC to send cancel
                        const cancelChannel = `sqlite-iterator-cancel-${thisCallId}`
                        if (connector && typeof connector.send === "function") {
                          connector.send(cancelChannel, {
                            type: MsgType.IteratorCancel,
                            id: thisCallId,
                          })
                        }
                      } else {
                        // Worker mode: use postMessage
                        connector.postMessage({
                          type: MsgType.IteratorCancel,
                          id: thisCallId,
                        })
                      }
                    }
                  }
                  abortSignal.addEventListener("abort", cancelHandler)
                }

                return iterator
              }
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
          // FIXME:should not be depends on specific sqlite implementation
          if (sqlite instanceof HttpSqlite) {
            return sqlite.onCallBack(thisCallId)
          }
          if (res) {
            return res
          }
        }
        return sqlite.onCallBack(thisCallId)
      }
    },
  })
}
