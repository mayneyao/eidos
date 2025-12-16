/**
 * Electron IPC transport
 * Migrated from LocalSqlite (Electron part)
 */

import { BaseTransport } from '../core/transport'
import type { EchoMessage, MessageHandler } from '../core/types'
import { MessageType } from '../core/types'

/**
 * IpcRenderer interface (to avoid electron dependency)
 */
export interface IpcRenderer {
  invoke(channel: string, ...args: any[]): Promise<any>
  on(channel: string, listener: (event: any, ...args: any[]) => void): this
  removeListener(channel: string, listener: (...args: any[]) => void): this
  send(channel: string, ...args: any[]): void
}

export interface ElectronIPCOptions {
  /**
   * Whether this is a readonly connection
   */
  readonly?: boolean

  /**
   * Channel name for sending messages
   */
  sendChannel?: string

  /**
   * Channel name for receiving messages
   */
  receiveChannel?: string
}

export class ElectronIPCTransport extends BaseTransport<IpcRenderer> {
  private messageHandlers: Set<MessageHandler> = new Set()
  private callbacksMap = new Map<string, (message: EchoMessage) => void>()
  private options: ElectronIPCOptions

  constructor(public connector: IpcRenderer, options: ElectronIPCOptions = {}) {
    super()
    this.options = {
      sendChannel: options.readonly ? 'sqlite-msg-read' : 'sqlite-msg',
      receiveChannel: 'sqlite-iterator',
      ...options,
    }
  }

  async send(message: EchoMessage): Promise<void> {
    const result = await this.connector.invoke(
      this.options.sendChannel!,
      message
    )
    
    // For non-iterator calls, immediately notify handlers
    if (result) {
      // Call the specific callback for this message ID if it exists
      const callback = this.callbacksMap.get(result.id || message.id)
      if (callback) {
        callback(result)
        // For non-iterator messages, remove the callback after handling
        if (result.type === MessageType.QueryResp || result.type === MessageType.Error) {
          this.callbacksMap.delete(result.id || message.id)
        }
      }
      // Also call global handlers
      this.messageHandlers.forEach((handler) => handler(result))
    }
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
    const iteratorChannel = `${this.options.receiveChannel}-${callId}`

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

        const messageHandler = (_event: any, message: any) => {
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
          this.connector.removeListener(iteratorChannel, messageHandler)
              break

            case MessageType.IteratorError:
              const error = new Error(data.message || 'Iterator error')
              if (resolveNext) {
                resolveNext({ done: true, error })
                resolveNext = null
              } else {
                messageQueue.push({ done: true, error })
              }
          this.connector.removeListener(iteratorChannel, messageHandler)
              break
          }
        }

    // Set up listener immediately when onIterator is called (not when iteration starts)
    this.connector.on(iteratorChannel, messageHandler)

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
          self.connector.removeListener(iteratorChannel, messageHandler)
        }
      },
    }
  }

  close(): void {
    this.messageHandlers.clear()
    this.callbacksMap.clear()
  }
}

