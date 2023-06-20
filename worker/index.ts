import { MsgType } from "@/lib/const"
import { getSpaceDatabasePath } from "@/lib/fs"
import { logger } from "@/lib/log"

import { DataSpace, Sqlite } from "./sql"

// current DB
let _db: DataSpace | null = null
const sqlite = new Sqlite()

const handleFunctionCall = async (data: any, id: string, port: MessagePort) => {
  if (!sqlite.sqlite3) {
    throw new Error("sqlite3 not initialized")
  }
  const { dbName, method, params } = data
  if (!_db || (dbName && dbName !== _db.dbName)) {
    //
    _db = await loadDatabase(dbName)
  }
  const _method = method as keyof DataSpace
  const callMethod = (_db[_method] as Function).bind(_db)
  const res = await callMethod(...params)

  port.postMessage({
    id,
    data: {
      result: res,
    },
    type: MsgType.QueryResp,
  })
}

async function loadDatabase(dbName: string) {
  const filename = await getSpaceDatabasePath(dbName)
  if (_db?.db.filename === filename) {
    return _db
  }
  const db = sqlite.db({
    path: filename,
    flags: "c",
    name: dbName,
  })
  logger.info(`switch to database[${dbName}]`)
  return db
}

async function main() {
  await sqlite.init()
  postMessage("init")
}

onmessage = async (e) => {
  const { type, data, id } = e.data
  switch (type) {
    case MsgType.CallFunction:
      await handleFunctionCall(data, id, e.ports[0])
      break
    case MsgType.SwitchDatabase:
      _db = await loadDatabase(data.databaseName)
      postMessage({
        id,
        data: {
          msg: "switchDatabase success",
          dbName: data.databaseName,
        },
      })
      return
    case MsgType.SetConfig:
      sqlite.setConfig(data)
      console.log("load config", data)
      break
    default:
      logger.warn("unknown msg type", type)
      break
  }
}

main()
