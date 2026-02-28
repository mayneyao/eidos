import { MsgType } from "@/lib/const"
import { EIDOS_VERSION, logger } from "@/lib/env"
import { getConfig } from "@/lib/storage/indexeddb"
import {
  WORKER_INIT_MESSAGES,
  WORKER_INIT_CONFIG,
  WORKER_MESSAGE_TYPES,
} from "@/lib/const"

import type { DataSpace } from "../../core/data-space"
import { initWs } from "./api-agent/ws"
import { SqliteServer } from "./sqlite-wasm-server"
import { workerStore } from "./store"
import type { APIAgentFormValues } from "@/packages/shared/types/api-agent-form"
import {
  isIteratorFunction,
  restoreNonSerializable,
} from "../../core/sqlite/channel/iterator-utils"

// current DB
let _dataspace: DataSpace | null = null
const sqlite = new SqliteServer()
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

  // Check if this is an iterator function using the registry
  const isIterFunc = isIteratorFunction(method)

  // For iterator functions, create an AbortController to handle cancellation
  let abortController: AbortController | undefined

  // Prepare params - for iterator functions, we'll add AbortSignal
  let finalParams = [...params]

  // Check if this is an iterator function and create AbortController
  if (isIterFunc) {
    abortController = new AbortController()

    // Listen for cancel messages
    const cancelHandler = (e: MessageEvent) => {
      if (e.data?.type === MsgType.IteratorCancel && e.data?.id === id) {
        abortController?.abort()
      }
    }
    port.addEventListener("message", cancelHandler)

    // Add signal to params if options object exists
    // Note: params come serialized (AbortSignal was removed), so we add our new signal
    if (
      finalParams.length > 0 &&
      typeof finalParams[finalParams.length - 1] === "object" &&
      finalParams[finalParams.length - 1] !== null
    ) {
      const lastParam = finalParams[finalParams.length - 1]
      // Replace or add signal with our controller's signal
      finalParams[finalParams.length - 1] = {
        ...lastParam,
        signal: abortController.signal,
      }
    } else {
      // Add options with signal
      finalParams.push({ signal: abortController.signal })
    }
  }

  let callMethod: Function = () => {}
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

  const res = await callMethod(...finalParams)

  // Check if the result is an AsyncIterable (for iterator functions like watch)
  // Only treat as iterator if it's explicitly an iterator function
  // and the result is actually an AsyncIterable
  if (
    isIterFunc &&
    res &&
    typeof res === "object" &&
    Symbol.asyncIterator in res
  ) {
    // Handle async iterator: yield values as they come
    try {
      for await (const value of res as AsyncIterable<any>) {
        // Check if cancelled
        if (abortController?.signal.aborted) {
          break
        }
        port.postMessage({
          id,
          data: {
            value,
          },
          type: MsgType.IteratorValue,
        })
      }
      // Signal that iterator is done
      port.postMessage({
        id,
        data: {},
        type: MsgType.IteratorDone,
      })
    } catch (error) {
      // Check if it's an abort error
      if (error instanceof Error && error.name === "AbortError") {
        port.postMessage({
          id,
          data: {},
          type: MsgType.IteratorDone,
        })
      } else {
        // Signal iterator error
        port.postMessage({
          id,
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
          type: MsgType.IteratorError,
        })
      }
    }
  } else {
    // Regular response
    port.postMessage({
      id,
      data: {
        result: res,
      },
      type: MsgType.QueryResp,
    })
  }
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
            console.error(
              `Worker initialization timeout after ${(WORKER_INIT_CONFIG.MAX_RETRIES * WORKER_INIT_CONFIG.RETRY_INTERVAL) / 1000} seconds`
            )
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
