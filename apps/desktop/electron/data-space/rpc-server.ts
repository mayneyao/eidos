import { type DataSpace } from "@/packages/core/data-space"
import { handleFunctionCall } from "@/packages/core/rpc"
import { isIteratorFunction } from "@/packages/core/sqlite/channel/iterator-utils"

import { MsgType } from "@/lib/const"

import type { RpcRequest, RpcResponse } from "./rpc-types"

/**
 * Handles RPC requests on the server side (worker process).
 * Manages execution, streaming for iterators, and cancellation.
 */
export class RpcServer {
  private activeIterators = new Map<string, AbortController>()

  constructor(
    private dataSpaceProvider: () => DataSpace | null,
    private transport: {
      on: (evt: "message", cb: (msg: any) => void) => void
      postMessage: (msg: any) => void
    }
  ) {
    this.transport.on("message", (event) => {
      const payload = event.data || event
      this.handleMessage(payload)
    })
  }

  private async handleMessage(payload: any) {
    if (payload.type === "call" || payload.type === "execute-payload") {
      const dataSpace = this.dataSpaceProvider()
      if (!dataSpace) {
        this.sendResponse(payload.id, {
          error: { message: "DataSpace not initialized" },
        })
        return
      }
      await this.handleCall(payload, dataSpace)
    } else if (payload.type === MsgType.IteratorCancel) {
      const controller = this.activeIterators.get(payload.id)
      if (controller) {
        controller.abort()
        this.activeIterators.delete(payload.id)
      }
    }
  }

  private async handleCall(req: RpcRequest, dataSpace: DataSpace) {
    const isExecutePayload = req.type === "execute-payload"
    const callData = isExecutePayload
      ? req.payload
      : {
          method: req.path.join("."),
          params: req.args,
          space: dataSpace.dbName,
          dbName: dataSpace.dbName,
          userId: "internal",
        }

    const messageId = req.id
    const isIterFunc = isIteratorFunction(callData.method)

    let abortController: AbortController | undefined
    let finalParams = [...(callData.params || [])]

    if (isIterFunc) {
      abortController = new AbortController()
      this.activeIterators.set(messageId, abortController)

      // Add signal to params if options object exists or append it
      if (
        finalParams.length > 0 &&
        typeof finalParams[finalParams.length - 1] === "object" &&
        finalParams[finalParams.length - 1] !== null
      ) {
        finalParams[finalParams.length - 1] = {
          ...finalParams[finalParams.length - 1],
          signal: abortController.signal,
        }
      } else {
        finalParams.push({ signal: abortController.signal })
      }
    }

    try {
      const res = await handleFunctionCall(
        {
          ...callData,
          params: finalParams,
        },
        dataSpace
      )

      if (
        isIterFunc &&
        res &&
        typeof res === "object" &&
        Symbol.asyncIterator in res
      ) {
        await this.handleIterator(
          messageId,
          res as AsyncIterable<any>,
          abortController!
        )
      } else {
        this.sendResponse(messageId, { result: res })
      }
    } catch (e: any) {
      this.sendResponse(messageId, {
        error: { message: e.message, stack: e.stack },
      })
    } finally {
      if (isIterFunc) {
        this.activeIterators.delete(messageId)
      }
    }
  }

  private async handleIterator(
    id: string,
    iterator: AsyncIterable<any>,
    controller: AbortController
  ) {
    try {
      for await (const value of iterator) {
        if (controller.signal.aborted) {
          break
        }
        this.transport.postMessage({
          id,
          type: MsgType.IteratorValue,
          data: { value },
        })
      }
      this.transport.postMessage({ id, type: MsgType.IteratorDone, data: {} })
    } catch (e: any) {
      console.error(`[RpcServer] Iterator error for id: ${id}`, e)
      if (e.name === "AbortError") {
        this.transport.postMessage({ id, type: MsgType.IteratorDone, data: {} })
      } else {
        this.transport.postMessage({
          id,
          type: MsgType.IteratorError,
          data: { message: e.message },
        })
      }
    }
  }

  private sendResponse(id: string, response: Partial<RpcResponse>) {
    this.transport.postMessage({
      id,
      type: "response",
      ...response,
    })
  }
}
