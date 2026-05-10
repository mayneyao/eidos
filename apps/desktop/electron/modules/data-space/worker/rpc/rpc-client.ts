import type { DataSpace } from "@/packages/core/data-space"
import { isIteratorFunction } from "@/packages/core/sqlite/channel/iterator-utils"

import { MsgType } from "@/lib/const"

import type { RpcRequest, RpcResponse } from "./rpc-types"

/**
 * Handles RPC communication on the client side (main process).
 * Manages request/response matching and async iterator streaming.
 */
export class RpcClient {
  private pendingRequests = new Map<
    string,
    {
      resolve: (resp: any) => void
      reject: (err: Error) => void
      isIterator?: boolean
      onValue?: (val: any) => void
      onDone?: () => void
      onError?: (err: Error) => void
    }
  >()

  constructor(
    private transport: {
      on: (evt: "message", cb: (msg: any) => void) => void
      off: (evt: "message", cb: (msg: any) => void) => void
      postMessage: (msg: any) => void
    }
  ) {
    this.transport.on("message", (payload) => {
      this.handleMessage(payload)
    })
  }

  private handleMessage(payload: any) {
    // Determine if the RPC fields are at the top level or nested in .data
    // In some environments, the message content is wrapped in event.data
    const isWrapped = !payload.id && payload.data && payload.data.id
    const data = isWrapped ? payload.data : payload

    const id = data.id
    if (!id) return

    const pending = this.pendingRequests.get(id)
    if (!pending) return

    if (data.type === "response") {
      if (data.error) {
        pending.reject(new Error(data.error.message))
      } else {
        pending.resolve(data.result)
      }
      // If it's a regular call, cleanup. If it's an iterator, wait for Done/Error.
      if (!pending.isIterator) {
        this.pendingRequests.delete(id)
      }
    } else if (data.type === MsgType.IteratorValue) {
      pending.onValue?.(data.data.value)
    } else if (data.type === MsgType.IteratorDone) {
      pending.onDone?.()
      this.pendingRequests.delete(id)
    } else if (data.type === MsgType.IteratorError) {
      console.error(
        `[RpcClient] Received IteratorError from transport for id: ${id}`,
        data.data.message
      )
      pending.onError?.(new Error(data.data.message))
      this.pendingRequests.delete(id)
    }
  }

  async call(
    path: string[],
    args: any[],
    id?: string,
    onIterator?: (msg: any) => void
  ): Promise<any> {
    const messageId = id || Math.random().toString(36).substring(2)
    // Filter out any non-string values (like Symbols) from path
    const stringPath = path.filter((p): p is string => typeof p === "string")
    const methodStr = stringPath.join(".")
    const isIter = isIteratorFunction(methodStr)

    if (isIter) {
      const iter = this.createAsyncIterable(messageId, stringPath, args)
      if (onIterator) {
        this.startForwarding(messageId, iter, onIterator)
        return { type: "iterator-started", id: messageId }
      }
      return iter
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject })
      this.transport.postMessage({
        id: messageId,
        type: "call",
        path: stringPath,
        args,
      } as RpcRequest)
    })
  }

  async executePayload(
    payload: any,
    id?: string,
    onIterator?: (msg: any) => void
  ): Promise<any> {
    const messageId = id || Math.random().toString(36).substring(2)
    const methodStr = payload.method
    const isIter = isIteratorFunction(methodStr)

    if (isIter) {
      const iter = this.createAsyncIterable(messageId, [], [], payload)
      if (onIterator) {
        this.startForwarding(messageId, iter, onIterator)
        return { type: "iterator-started", id: messageId }
      }
      return iter
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject })
      this.transport.postMessage({
        id: messageId,
        type: "execute-payload",
        payload,
      } as RpcRequest)
    })
  }

  private startForwarding(
    id: string,
    iter: AsyncIterable<any>,
    onIterator: (msg: any) => void
  ) {
    ;(async () => {
      try {
        for await (const val of iter) {
          onIterator({
            id,
            type: MsgType.IteratorValue,
            data: { value: val },
          })
        }
        onIterator({ id, type: MsgType.IteratorDone, data: {} })
      } catch (err: any) {
        console.error(`[RpcClient] startForwarding error for id: ${id}`, err)
        onIterator({
          id,
          type: MsgType.IteratorError,
          data: { message: err.message },
        })
      }
    })()
  }

  private createAsyncIterable(
    id: string,
    path: string[],
    args: any[],
    executePayload?: any
  ): AsyncIterable<any> {
    const self = this
    return {
      async *[Symbol.asyncIterator]() {
        const queue: any[] = []
        let done = false
        let error: Error | null = null
        let resolveNext: (() => void) | null = null

        self.pendingRequests.set(id, {
          resolve: () => {},
          reject: (err) => {
            error = err
            resolveNext?.()
          },
          isIterator: true,
          onValue: (val) => {
            queue.push(val)
            if (resolveNext) {
              resolveNext()
            }
          },
          onDone: () => {
            done = true
            if (resolveNext) resolveNext()
          },
          onError: (err) => {
            console.error(`[RpcClient] onError triggered for id: ${id}`, err)
            error = err
            if (resolveNext) resolveNext()
          },
        })

        if (executePayload) {
          self.transport.postMessage({
            id,
            type: "execute-payload",
            payload: executePayload,
          } as RpcRequest)
        } else {
          self.transport.postMessage({
            id,
            type: "call",
            path,
            args,
          } as RpcRequest)
        }

        try {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift()
            } else if (done) {
              break
            } else if (error) {
              throw error
            } else {
              await new Promise<void>((r) => {
                resolveNext = r
              })
              resolveNext = null
            }
          }
        } finally {
          if (!done && !error) {
            self.transport.postMessage({ id, type: MsgType.IteratorCancel })
          }
          self.pendingRequests.delete(id)
        }
      },
    }
  }

  createProxy(): DataSpace {
    const self = this
    const createLevel = (path: string[]): any => {
      const proxy: any = new Proxy(() => {}, {
        get(_, prop) {
          if (prop === "then") return undefined
          if (prop === "toJSON") return () => ({ type: "DataSpaceProxy", path })
          if (prop === "_executePayload" && path.length === 0) {
            return (
              payload: any,
              id?: string,
              onIterator?: (msg: any) => void
            ) => self.executePayload(payload, id, onIterator)
          }
          // Special handling for `table(id).method()` chained calls.
          // Without this, `ds.table("xxx")` would immediately fire an RPC call
          // via apply() and return a Promise, breaking any subsequent .findMany() etc.
          // Instead we intercept here, accept the id synchronously, and return a
          // sub-proxy whose path encodes the call as `"table(id)"` so that the
          // final method call produces path=["table(xxx)","findMany"] which
          // rpc-server joins to "table(xxx).findMany" — exactly what
          // handleFunctionCall() expects.
          if (prop === "table" && path.length === 0) {
            return (id: string) => createLevel([`table(${id})`])
          }
          return createLevel([...path, prop as string])
        },
        apply(_, __, args) {
          // Check for 'bind' at the end of path (some RPC implementations add it)
          const finalPath = [...path]
          if (finalPath[finalPath.length - 1] === "bind") {
            finalPath.pop()
          }
          return self.call(finalPath, args)
        },
      })
      return proxy
    }
    return createLevel([]) as DataSpace
  }
}
