import { APIAgentFormValues } from "@/apps/web-app/settings/api/store"
import { MsgType } from "@/lib/const"
import { EIDOS_VERSION, logger } from "@/lib/env"
import { getConfig } from "@/lib/storage/indexeddb"

import { DataSpace } from "./DataSpace"
import { initWs } from "./api-agent/ws"
import { Sqlite } from "./sql"
import { workerStore } from "./store"

// current DB
let _dataspace: DataSpace | null = null
const sqlite = new Sqlite()
let ws: WebSocket

const handleFunctionCall = async (
  data: {
    space: string
    dbName: string
    method: string
    params: any[]
    userId: string
  },
  id: string,
  port: MessagePort
) => {
  if (!sqlite.sqlite3) {
    throw new Error("sqlite3 not initialized")
  }

  const { method, params = [] } = data
  const dbName = data.dbName || data.space
  workerStore.currentCallUserId = data.userId
  if (!_dataspace || (dbName && dbName !== _dataspace.dbName)) {
    //
    _dataspace = await loadDatabase(dbName)
  }
  let callMethod: Function = () => { }
  if (method.includes(".")) {
    let obj: any = _dataspace
    const properties = method.split(".")
    // const r = await sqlite.table("91ba4dd2ad4447cf943db88dbb861323").rows.query()
    for (const property of properties.slice(0, -1)) {
      // if property like `table("91ba4dd2ad4447cf943db88dbb861323")` it means we need to call table function
      // and pass the result to next function
      if (property.includes("(") && property.includes(")")) {
        const [funcName, funcParams] = property.split("(")
        const func = obj[funcName].bind(obj)
        const params = funcParams.slice(0, -1).split(",")
        obj = await func(...params)
      } else {
        obj = obj[property]
      }
    }
    callMethod = (obj[properties[properties.length - 1]] as Function).bind(obj)
  } else {
    callMethod = (_dataspace[method as keyof DataSpace] as Function).bind(
      _dataspace
    )
  }
  const res = await callMethod(...params)

  port.postMessage({
    id,
    data: {
      result: res,
    },
    type: MsgType.QueryResp,
  })
}

const getSpaceDatabasePath = async (spaceName: string) => {
  return `/spaces/${spaceName}/db.sqlite3`
}

async function loadDatabase(dbName: string) {
  const filename = await getSpaceDatabasePath(dbName)
  if (_dataspace?.db.filename === filename) {
    return _dataspace
  }

  // we will create a draft db for table schema migration

  const draftDb = await sqlite.draftDb()

  const db = await sqlite.db({
    path: filename,
    flags: "c",
    name: dbName,
    draftDb,
  })

  return db
}

async function main() {
  await sqlite.init()
  const data = await getConfig<{ apiAgentConfig: APIAgentFormValues }>(
    "config-api"
  )
  const { url, enabled } = data.apiAgentConfig
  if (!enabled) {
    ws?.close()
  } else {
    setTimeout(() => {
      initWs(handleFunctionCall, url, (_ws) => {
        ws = _ws
      })
    }, 1000)
  }

  postMessage("init")
}

onmessage = async (e) => {
  const { type, data, id } = e.data
  switch (type) {
    case MsgType.CallFunction:
      await handleFunctionCall(data, id, e.ports[0])
      break
    case MsgType.SwitchDatabase:
      _dataspace = await loadDatabase(data.databaseName)
      logger.info(`switch to database[${data.databaseName}]`)
      postMessage({
        id,
        data: {
          msg: "switchDatabase success",
          dbName: data.databaseName,
        },
      })
      return
    case MsgType.CreateSpace:
      /**
       * switch database will auto create database if not exists, but it's not obvious
       * so we add this api to make it more clear
       */
      await loadDatabase(data.spaceName)
      logger.info(`create database[${data.spaceName}]`)
      e.ports[0].postMessage({
        id,
        data: {
          msg: "createSpace success",
          space: data.spaceName,
        },
      })
      return
    case MsgType.Syscall:
      ws.send(
        JSON.stringify({
          id,
          data: {
            method: MsgType.Syscall,
            params: [data],
          },
        })
      )
      break
    default:
      logger.warn("unknown msg type", type)
      break
  }
}

logger.info(`current version: ${EIDOS_VERSION}`)
main()
