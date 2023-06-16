import { MsgType } from "@/lib/const"
import { logger } from "@/lib/log"

import { SqlDatabase, Sqlite } from "./sql"
import { getSpaceDatabasePath } from "@/lib/fs"

// current DB
let _db: SqlDatabase | null = null
const sqlite = new Sqlite()

const handleFunctionCall = async (data: any, id: string, port: MessagePort) => {
  if (!sqlite.sqlite3) {
    throw new Error("sqlite3 not initialized")
  }

  const { dbName, method, params } = data
  if (!_db || (dbName && dbName !== _db.db.filename)) {
    _db = await loadDatabase(dbName)
  }
  const _method = method as keyof SqlDatabase
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
  console.log(filename)
  const db = sqlite.db(filename, "c")
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
