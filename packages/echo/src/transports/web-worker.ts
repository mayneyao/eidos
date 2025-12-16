/**
 * Web Worker transport
 * Migrated from LocalSqlite (Web Worker part)
 */

import { BaseTransport } from '../core/transport'
import type { EchoMessage, MessageHandler } from '../core/types'
import { MessageType } from '../core/types'

export class WebWorkerTransport extends BaseTransport<Worker> {
  private channelMap = new Map<string, MessageChannel>()
  private messageHandlers: Set<MessageHandler> = new Set()
  private callbacksMap = new Map<string, (message: EchoMessage) => void>()

  constructor(public connector: Worker) {
    super()
  }

  send(message: EchoMessage): void {
    const channel = new MessageChannel()
    this.channelMap.set(message.id, channel)
    
    // Set up message handler for this channel
    channel.port1.onmessage = (e) => {
      const msg = e.data
      // Call the specific callback for this message ID if it exists
      const callback = this.callbacksMap.get(msg.id)
      if (callback) {
        callback(msg)
        // For non-iterator messages, remove the callback after handling
        if (msg.type === MessageType.QueryResp || msg.type === MessageType.Error) {
          this.callbacksMap.delete(msg.id)
        }
      }
      // Also call global handlers
      this.messageHandlers.forEach((handler) => handler(msg))
    }
    
    this.connector.postMessage(message, [channel.port2])
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
    const channel = this.channelMap.get(callId)
    if (!channel) {
      throw new Error(`Channel not found for iterator call: ${callId}`)
    }

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
    let shouldCleanup = false

    const messageHandler = (e: MessageEvent) => {
      const { id: returnId, type, data } = e.data

      if (returnId !== callId) return

      switch (type) {
        case MessageType.IteratorValue:
          if (resolveNext) {
            resolveNext({ value: data.value, done: false })
            resolveNext = null
          } else {
            messageQueue.push({ value: data.value, done: false })
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
          shouldCleanup = true
          break

        case MessageType.IteratorError:
          const error = new Error(data.message || 'Iterator error')
          if (resolveNext) {
            resolveNext({ done: true, error })
            resolveNext = null
          } else {
            messageQueue.push({ done: true, error })
          }
          shouldCleanup = true
          break

        case MessageType.Error:
          const generalError = new Error(
            data.message || 'Operation failed'
          )
          if (resolveNext) {
            resolveNext({ done: true, error: generalError })
            resolveNext = null
          } else {
            messageQueue.push({ done: true, error: generalError })
          }
          shouldCleanup = true
          break
      }
    }

    // Set up listener immediately when onIterator is called (not when iteration starts)
    channel.port1.addEventListener('message', messageHandler)

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
          channel.port1.removeEventListener('message', messageHandler)
          if (shouldCleanup) {
            self.channelMap.delete(callId)
          }
        }
      },
    }
  }

  close(): void {
    this.channelMap.forEach((channel) => {
      channel.port1.close()
    })
    this.channelMap.clear()
    this.messageHandlers.clear()
    this.connector.terminate()
  }
}

