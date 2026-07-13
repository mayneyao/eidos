import { parentPort } from "node:worker_threads"

import type {
  BaseQueryWorkerRequest,
  BaseQueryWorkerResponse,
} from "./base-query-worker-protocol"
import { BaseQueryRuntimeCache } from "./base-query-runtime-cache"

if (!parentPort) throw new Error("Base query worker requires a parent port")
const port = parentPort
const cache = new BaseQueryRuntimeCache()

function errorResponse(
  request: BaseQueryWorkerRequest,
  error: unknown
): BaseQueryWorkerResponse {
  return {
    id: request.id,
    ok: false,
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  }
}

function run(request: BaseQueryWorkerRequest): BaseQueryWorkerResponse {
  try {
    const base = cache.get(request.filePath)
    if (request.operation === "page") {
      const { offset, limit, query, totalHint } = request.options
      return {
        id: request.id,
        ok: true,
        operation: "page",
        page: base.getRowPage(request.tableId, offset, limit, query, totalHint),
      }
    }
    if (request.operation === "column-stats") {
      return {
        id: request.id,
        ok: true,
        operation: "column-stats",
        stats: base.calculateColumnStats(
          request.tableId,
          request.configs,
          request.query
        ),
      }
    }
    return {
      id: request.id,
      ok: true,
      operation: "group-counts",
      counts: base.countRowsByField(
        request.tableId,
        request.columnName,
        request.query
      ),
    }
  } catch (error) {
    return errorResponse(request, error)
  }
}

port.on("message", (request: BaseQueryWorkerRequest) => {
  port.postMessage(run(request))
})

const close = () => cache.close()
port.once("close", close)
process.once("exit", close)
