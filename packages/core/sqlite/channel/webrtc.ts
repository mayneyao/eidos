import type { DataConnection } from "peerjs"

import type { IMsgForward, IMsgQueryResp } from "../../types/ICollaboration"
import { ECollaborationMsgType } from "../../types/ICollaboration"
import { EidosDataEventChannelName, MsgType } from "@/lib/const"

export interface ISqlite<T, D> {
  connector: T
  send: (data: D) => void
  onCallBack: (thisCallId: string) => Promise<any>
  /**
   * Handle iterator/streaming functions that return AsyncIterable
   * Returns an AsyncIterable that yields values from the remote iterator
   */
  onIterator?: <TValue = any>(thisCallId: string) => AsyncIterable<TValue>
}

export class RemoteSqlite implements ISqlite<DataConnection, any> {
  connector: DataConnection
  bc: BroadcastChannel
  constructor(connector: DataConnection) {
    this.connector = connector
    this.bc = new BroadcastChannel(EidosDataEventChannelName)
  }

  send(data: any) {
    return this.connector.send({
      type: ECollaborationMsgType.QUERY,
      payload: data,
    })
  }

  onCallBack(thisCallId: string) {
    return new Promise((resolve, reject) => {
      this.connector.on("data", (data) => {
        // console.log("receive data", data, thisCallId)
        const type = (data as any).type as ECollaborationMsgType
        if (type == ECollaborationMsgType.QUERY_RESP) {
          const _data = data as IMsgQueryResp
          if (_data.payload.id === thisCallId) {
            resolve(_data.payload.data.result)
          }
        }
        if (type == ECollaborationMsgType.FORWARD) {
          const _data = data as IMsgForward
          if (_data.payload) {
            this.bc.postMessage(_data.payload)
          }
        }
      })
    })
  }

  /**
   * Handle iterator/streaming functions for WebRTC connections
   * Note: This requires the remote peer to support iterator messages
   */
  onIterator<TValue = any>(thisCallId: string): AsyncIterable<TValue> {
    const messageQueue: Array<{
      value?: TValue
      done: boolean
      error?: Error
    }> = []
    let resolveNext:
      | ((value: { value?: TValue; done: boolean; error?: Error }) => void)
      | null = null
    let isDone = false

    const messageHandler = (data: any) => {
      const type = data.type as ECollaborationMsgType | MsgType
      const payload = data.payload || data

      // Only process messages for this iterator
      if (payload.id !== thisCallId) {
        return
      }

      switch (type) {
        case MsgType.IteratorValue:
          if (resolveNext) {
            resolveNext({ value: payload.data?.value, done: false })
            resolveNext = null
          } else {
            messageQueue.push({ value: payload.data?.value, done: false })
          }
          break

        case MsgType.IteratorDone:
          isDone = true
          if (resolveNext) {
            resolveNext({ done: true })
            resolveNext = null
          } else {
            messageQueue.push({ done: true })
          }
          this.connector.off("data", messageHandler)
          break

        case MsgType.IteratorError:
          const error = new Error(payload.data?.message || "Iterator error")
          if (resolveNext) {
            resolveNext({ done: true, error })
            resolveNext = null
          } else {
            messageQueue.push({ done: true, error })
          }
          this.connector.off("data", messageHandler)
          break

        default:
          break
      }
    }

    this.connector.on("data", messageHandler)

    const self = this
    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          while (!isDone) {
            if (messageQueue.length > 0) {
              const next = messageQueue.shift()!
              if (next.error) {
                throw next.error
              }
              if (next.done) {
                break
              }
              yield next.value as TValue
              continue
            }

            const next = await new Promise<{
              value?: TValue
              done: boolean
              error?: Error
            }>((resolve) => {
              resolveNext = resolve
            })

            if (next.error) {
              throw next.error
            }
            if (next.done) {
              break
            }
            yield next.value as TValue
          }
        } finally {
          self.connector.off("data", messageHandler)
        }
      },
    }
  }
}
