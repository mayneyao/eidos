import { MsgType } from "@/lib/const"
import type { IpcRenderer } from 'electron';

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

export interface ILocalSendData {
  type: MsgType.CallFunction
  data: {
    method: string
    params: any[]
    dbName: string
    tableId?: string
    userId?: string
  }
  id: string
}

export class LocalSqlite implements ISqlite<Worker | IpcRenderer, ILocalSendData> {
  connector: Worker | IpcRenderer
  channel: MessageChannel
  channelMap: Map<string, MessageChannel>
  dataMap: Map<string, any>
  options?: {
    readonly?: boolean
  }
  constructor(connector: Worker | IpcRenderer, options?: {
    readonly?: boolean
  }) {
    this.connector = connector
    this.channel = new MessageChannel()
    this.channelMap = new Map()
    this.dataMap = new Map()
    this.options = options
  }

  getChannel(id: string) {
    return this.channelMap.get(id)
  }
  destroyChannel(id: string) {
    this.channelMap.delete(id)
  }

  send(data: ILocalSendData) {
    /**
     * every msg need to have a unique id,
     * one msg id, one channel
     * channel map used to avoid parallel sending
     */
    const msgId = data.id
    const channel = new MessageChannel()
    this.channelMap.set(msgId, channel)
    if (this.connector instanceof Worker) {
      this.connector.postMessage(data, [channel.port2])
    } else {
      // For Electron, use invoke for regular calls
      // For iterator functions, the channel will be used in onIterator
      if (this.options?.readonly) {
        return this.connector.invoke('sqlite-msg-read', data)
      }
      return this.connector.invoke('sqlite-msg', data)
    }
  }
  onCallBack(thisCallId: string) {
    return new Promise((resolve, reject) => {
      // https://advancedweb.hu/how-to-use-async-await-with-postmessage/ saves me, there is a bug when use id to match msg, channel is the right way
      const channel = this.getChannel(thisCallId)
      if (!channel) {
        reject(new Error(`Channel not found for call: ${thisCallId}`))
        return
      }
      
      // Set up timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.destroyChannel(thisCallId)
        reject(new Error(`Timeout waiting for response: ${thisCallId}`))
      }, 30000) // 30 second timeout
      
      channel.port1.onmessage = (e) => {
        const { id: returnId, type, data } = e.data
        
        // Only process messages for this call
        if (returnId !== thisCallId) {
          return
        }
        
        switch (type) {
          case MsgType.Error:
            clearTimeout(timeout)
            this.channel.port1.close()
            this.destroyChannel(thisCallId)
            // Log error instead of showing toast - core package shouldn't handle UI notifications
            console.error("SQLite operation failed:", data.message)
            reject(new Error(data.message || "SQLite operation failed"))
            break
          case MsgType.DataUpdateSignal:
            console.log("data update signal", e)
            window.postMessage(e.data)
            // Don't close channel or resolve - continue waiting for QueryResp
            break
          // req-resp msg need to match id
          case MsgType.QueryResp:
            clearTimeout(timeout)
            this.channel.port1.close()
            this.destroyChannel(thisCallId)
            resolve(data.result)
            break
          // Ignore iterator messages in onCallBack - those should use onIterator
          case MsgType.IteratorValue:
          case MsgType.IteratorDone:
          case MsgType.IteratorError:
            // These should not happen in onCallBack, but if they do, reject
            clearTimeout(timeout)
            this.channel.port1.close()
            this.destroyChannel(thisCallId)
            reject(new Error("Received iterator message in onCallBack - use onIterator instead"))
            break
          default:
            break
        }
      }
    })
  }

  /**
   * Handle iterator/streaming functions that return AsyncIterable
   * Creates an async iterator that yields values from the remote iterator
   */
  onIterator<TValue = any>(thisCallId: string): AsyncIterable<TValue> {
    // Check if we're in Electron mode (IpcRenderer)
    if (!(this.connector instanceof Worker)) {
      // For Electron, use IPC events to receive iterator messages
      const iteratorChannel = `sqlite-iterator-${thisCallId}`
      const self = this
      
      return {
        [Symbol.asyncIterator]: async function* () {
          const messageQueue: Array<{ value?: TValue; done: boolean; error?: Error }> = []
          let resolveNext: ((value: { value?: TValue; done: boolean; error?: Error }) => void) | null = null
          let isDone = false

          const messageHandler = (_event: any, message: any) => {
            const { id: returnId, type, data } = message

            // Only process messages for this iterator
            if (returnId !== thisCallId) {
              return
            }

            switch (type) {
              case MsgType.IteratorValue:
                if (resolveNext) {
                  resolveNext({ value: data.value, done: false })
                  resolveNext = null
                } else {
                  messageQueue.push({ value: data.value, done: false })
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
                // Remove listener when done
                if (self.connector && typeof (self.connector as any).removeListener === 'function') {
                  (self.connector as any).removeListener(iteratorChannel, messageHandler)
                }
                break

              case MsgType.IteratorError:
                const error = new Error(data.message || "Iterator error")
                if (resolveNext) {
                  resolveNext({ done: true, error })
                  resolveNext = null
                } else {
                  messageQueue.push({ done: true, error })
                }
                if (self.connector && typeof (self.connector as any).removeListener === 'function') {
                  (self.connector as any).removeListener(iteratorChannel, messageHandler)
                }
                break

              default:
                break
            }
          }

          // Listen for iterator messages via IPC
          if (self.connector && typeof (self.connector as any).on === 'function') {
            (self.connector as any).on(iteratorChannel, messageHandler)
          }

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

              const next = await new Promise<{ value?: TValue; done: boolean; error?: Error }>((resolve) => {
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
            // Clean up
            if (self.connector && typeof (self.connector as any).removeListener === 'function') {
              (self.connector as any).removeListener(iteratorChannel, messageHandler)
            }
          }
        }
      }
    }

    // For Worker mode, use MessageChannel
    const channel = this.getChannel(thisCallId)
    if (!channel) {
      throw new Error(`Channel not found for iterator call: ${thisCallId}`)
    }

    const self = this
    return {
      [Symbol.asyncIterator]: async function* () {
        const messageQueue: Array<{ value?: TValue; done: boolean; error?: Error }> = []
        let resolveNext: ((value: { value?: TValue; done: boolean; error?: Error }) => void) | null = null
        let isDone = false
        let shouldCleanup = false

        const messageHandler = (e: MessageEvent) => {
          const { id: returnId, type, data } = e.data

          // Only process messages for this iterator
          if (returnId !== thisCallId) {
            return
          }

          switch (type) {
            case MsgType.IteratorValue:
              // Yield a value from the iterator
              if (resolveNext) {
                resolveNext({ value: data.value, done: false })
                resolveNext = null
              } else {
                messageQueue.push({ value: data.value, done: false })
              }
              break

            case MsgType.IteratorDone:
              // Iterator is done
              isDone = true
              if (resolveNext) {
                resolveNext({ done: true })
                resolveNext = null
              } else {
                messageQueue.push({ done: true })
              }
              // Clean up channel after iterator is done
              shouldCleanup = true
              break

            case MsgType.IteratorError:
              // Iterator encountered an error
              const error = new Error(data.message || "Iterator error")
              if (resolveNext) {
                resolveNext({ done: true, error })
                resolveNext = null
              } else {
                messageQueue.push({ done: true, error })
              }
              shouldCleanup = true
              break

            case MsgType.Error:
              // General error
              const generalError = new Error(data.message || "SQLite operation failed")
              if (resolveNext) {
                resolveNext({ done: true, error: generalError })
                resolveNext = null
              } else {
                messageQueue.push({ done: true, error: generalError })
              }
              shouldCleanup = true
              break

            default:
              // Ignore other message types
              break
          }
        }

        channel.port1.addEventListener('message', messageHandler)

        try {
          while (!isDone) {
            // Check if we have a queued message
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

            // Wait for next message
            const next = await new Promise<{ value?: TValue; done: boolean; error?: Error }>((resolve) => {
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
          // Clean up
          channel.port1.removeEventListener('message', messageHandler)
          if (shouldCleanup) {
            // Clean up channel when iterator is done
            self.destroyChannel(thisCallId)
          }
        }
      }
    }
  }
}

