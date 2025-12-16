/**
 * WebRTC transport
 * Migrated from RemoteSqlite
 */

import { BaseTransport } from '../core/transport'
import type { EchoMessage, MessageHandler } from '../core/types'
import { MessageType } from '../core/types'

/**
 * DataConnection interface (to avoid peerjs dependency)
 */
export interface DataConnection {
  send(data: any): void
  on(event: string, callback: (data: any) => void): void
  off(event: string, callback?: (data: any) => void): void
  close(): void
}

export class WebRTCTransport extends BaseTransport<DataConnection> {
  private messageHandlers: Set<MessageHandler> = new Set()
  private callbacksMap = new Map<string, (message: EchoMessage) => void>()

  constructor(public connector: DataConnection) {
    super()
    this.setupConnectionHandlers()
  }

  private setupConnectionHandlers(): void {
    this.connector.on('data', (data: any) => {
      // Call the specific callback for this message ID if it exists
      if (data && data.id) {
        const callback = this.callbacksMap.get(data.id)
        if (callback) {
          callback(data)
          // For non-iterator messages, remove the callback after handling
          if (data.type === MessageType.QueryResp || data.type === MessageType.Error) {
            this.callbacksMap.delete(data.id)
          }
        }
      }
      // Also call global handlers
      this.messageHandlers.forEach((handler) => handler(data))
    })
  }

  send(message: EchoMessage): void {
    this.connector.send(message)
  }

  /**
   * Register a message handler (global)
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.add(handler)
  }

  /**
   * Register a callback for a specific call ID
   * @internal
   */
  onCallback(callId: string, callback: (message: EchoMessage) => void): void {
    this.callbacksMap.set(callId, callback)
  }

  onIterator<TValue = any>(callId: string): AsyncIterable<TValue> {
    const messageQueue: Array<{
      value?: TValue
      done: boolean
      error?: Error
    }> = []
    let resolveNext: ((value: {
      value?: TValue
      done: boolean
      error?: Error
    }) => void) | null = null
    let isDone = false

    const messageHandler = (data: any) => {
      const { id: returnId, type, data: payload } = data

      if (returnId !== callId) return

      switch (type) {
        case MessageType.IteratorValue:
          if (resolveNext) {
            resolveNext({ value: payload.value, done: false })
            resolveNext = null
          } else {
            messageQueue.push({ value: payload.value, done: false })
          }
          break

        case MessageType.IteratorDone:
          isDone = true
          if (resolveNext) {
            resolveNext({ done: true })
            resolveNext = null
          } else {
            messageQueue.push({ done: true })
          }
          this.connector.off('data', messageHandler)
          break

        case MessageType.IteratorError:
          const error = new Error(payload.message || 'Iterator error')
          if (resolveNext) {
            resolveNext({ done: true, error })
            resolveNext = null
          } else {
            messageQueue.push({ done: true, error })
          }
          this.connector.off('data', messageHandler)
          break
      }
    }

    this.connector.on('data', messageHandler)

    const self = this
    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          while (!isDone) {
            if (messageQueue.length > 0) {
              const next = messageQueue.shift()!
              if (next.error) throw next.error
              if (next.done) break
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

            if (next.error) throw next.error
            if (next.done) break
            yield next.value as TValue
          }
        } finally {
          self.connector.off('data', messageHandler)
        }
      },
    }
  }

  close(): void {
    this.messageHandlers.clear()
    this.callbacksMap.clear()
    this.connector.close()
  }
}

