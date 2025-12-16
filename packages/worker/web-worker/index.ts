import { MsgType } from "@/lib/const"
import { EIDOS_VERSION, logger } from "@/lib/env"
import { getConfig } from "@/lib/storage/indexeddb"
import {
  WORKER_INIT_MESSAGES,
  WORKER_INIT_CONFIG,
  WORKER_MESSAGE_TYPES
} from "@/lib/const"

import type { DataSpace } from "../../core/data-space"
import { initWs } from "./api-agent/ws"
import { SqliteServer } from "./sqlite-wasm-server"
import { workerStore } from "./store"
import type { APIAgentFormValues } from "@/packages/shared/types/api-agent-form"
import { EchoServerHandler } from "@eidos.space/echo/server"
import type { EchoMessage } from "@eidos.space/echo"

// current DB
let _dataspace: DataSpace | null = null
const sqlite = new SqliteServer()
let ws: WebSocket

// Cache for Echo server handlers
let echoHandler: EchoServerHandler | null = null

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

  const dbName = data.dbName || data.space
  workerStore.currentCallUserId = data.userId
  
  if (!_dataspace || (dbName && dbName !== _dataspace.dbName)) {
    _dataspace = await loadDatabase(dbName)
    // Reset handler when switching databases
    echoHandler = null
  }
  
  // Create Echo server handler if needed
  if (!echoHandler && _dataspace) {
    echoHandler = new EchoServerHandler(_dataspace)
  }
  
  // Construct Echo message format
  const message: EchoMessage = {
    id,
    type: 'CallFunction' as any,
    data: {
      method: data.method,
      params: data.params || [],
      extracted: [],
      ...data
    }
  }
  
  // Handle the message using Echo's server handler
  await echoHandler!.handle(message, port)
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

let isInitialized = false
async function main() {
  try {
    await sqlite.init()
    const data = await getConfig<{ apiAgentConfig: APIAgentFormValues }>(
      "config-api"
    )

    const { url, enabled } = data?.apiAgentConfig || {}
    if (!enabled) {
      ws?.close()
    } else if (url) {
      setTimeout(() => {
        initWs(handleFunctionCall, url, (_ws) => {
          ws = _ws
        })
      }, WORKER_INIT_CONFIG.WEBSOCKET_DELAY)
    }

    isInitialized = true
    console.log("worker init success")
    postMessage(WORKER_INIT_MESSAGES.INIT)
  } catch (error) {
    console.error("Worker initialization failed:", error)
    isInitialized = true
    postMessage(WORKER_INIT_MESSAGES.INIT_FAILED)
  }
}

onmessage = async (e) => {
  const { type, data, id } = e.data
  switch (type) {
    case WORKER_MESSAGE_TYPES.IS_WORKER_INITIALIZED:
      if (isInitialized) {
        postMessage(WORKER_INIT_MESSAGES.INIT)
      } else {
        let retryCount = 0

        const waitForInit = () => {
          if (isInitialized) {
            postMessage(WORKER_INIT_MESSAGES.INIT)
          } else if (retryCount < WORKER_INIT_CONFIG.MAX_RETRIES) {
            retryCount++
            setTimeout(waitForInit, WORKER_INIT_CONFIG.RETRY_INTERVAL)
          } else {
            console.error(`Worker initialization timeout after ${WORKER_INIT_CONFIG.MAX_RETRIES * WORKER_INIT_CONFIG.RETRY_INTERVAL / 1000} seconds`)
            postMessage(WORKER_INIT_MESSAGES.INIT_TIMEOUT)
          }
        }
        waitForInit()
      }
      break
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
