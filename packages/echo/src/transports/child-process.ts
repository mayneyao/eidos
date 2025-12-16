/**
 * Node.js Child Process transport
 * New implementation for Node.js child process IPC
 */

import { BaseTransport } from '../core/transport'
import type { EchoMessage, MessageHandler } from '../core/types'
import { MessageType } from '../core/types'

/**
 * ChildProcess interface (to avoid node dependency in type checking)
 */
export interface ChildProcess {
  send(message: any, callback?: (error: Error | null) => void): boolean
  on(event: string, listener: (...args: any[]) => void): this
  removeListener(event: string, listener: (...args: any[]) => void): this
  kill(signal?: string): boolean
}

export class ChildProcessTransport extends BaseTransport<ChildProcess> {
  private messageHandlers: Set<MessageHandler> = new Set()
  private callbacksMap = new Map<string, (message: EchoMessage) => void>()

  constructor(public connector: ChildProcess) {
    super()
    this.setupMessageHandlers()
  }

  private setupMessageHandlers(): void {
    this.connector.on('message', (message: any) => {
      // Call the specific callback for this message ID if it exists
      if (message && message.id) {
        const callback = this.callbacksMap.get(message.id)
        if (callback) {
          callback(message)
          // For non-iterator messages, remove the callback after handling
          if (message.type === MessageType.QueryResp || message.type === MessageType.Error) {
            this.callbacksMap.delete(message.id)
          }
        }
      }
      // Also call global handlers
      this.messageHandlers.forEach((handler) => handler(message))
    })
  }

  send(message: EchoMessage): void {
    this.connector.send(message, (error) => {
      if (error) {
        const errorMessage: EchoMessage = {
          id: message.id,
          type: MessageType.Error,
          data: {
            message: error.message,
            stack: error.stack,
          },
        }
        // Call the specific callback if it exists
        const callback = this.callbacksMap.get(message.id)
        if (callback) {
          callback(errorMessage)
          this.callbacksMap.delete(message.id)
        }
        // Also call global handlers
        this.messageHandlers.forEach((handler) => handler(errorMessage))
      }
    })
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

    const messageHandler = (message: any) => {
      const { id: returnId, type, data } = message

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
          this.connector.removeListener('message', messageHandler)
          break

        case MessageType.IteratorError:
          const error = new Error(data.message || 'Iterator error')
          if (resolveNext) {
            resolveNext({ done: true, error })
            resolveNext = null
          } else {
            messageQueue.push({ done: true, error })
          }
          this.connector.removeListener('message', messageHandler)
          break
      }
    }

    this.connector.on('message', messageHandler)

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
          self.connector.removeListener('message', messageHandler)
        }
      },
    }
  }

  close(): void {
    this.messageHandlers.clear()
    this.connector.kill()
  }
}

