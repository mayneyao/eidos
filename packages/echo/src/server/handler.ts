/**
 * Unified server-side request handler
 * Migrated and unified from worker.ts, web-worker/index.ts, and rpc.ts
 */

import type {
  EchoMessage,
  ServerHandlerOptions,
} from '../core/types'
import {
  MessageType,
  isCallMessage,
  createResponseMessage,
  createErrorMessage,
  createIteratorValueMessage,
  createIteratorDoneMessage,
  createIteratorErrorMessage,
  createIteratorCancelMessage,
} from '../core/message'
import { isIteratorFunction } from '../core/registry'
import { deserialize } from '../serialization/serializer'
import { MiddlewareChain } from '../middleware/middleware'
import { isFunctionCall, parseFunctionCall } from '../proxy/method-router'

/**
 * Server-side handler for Echo requests
 */
export class EchoServerHandler {
  private target: any
  private options: ServerHandlerOptions
  private middlewareChain: MiddlewareChain
  private abortControllers = new Map<string, AbortController>()

  constructor(target: any, options: ServerHandlerOptions = {}) {
    this.target = target
    this.options = {
      debug: false,
      ...options,
    }

    this.middlewareChain = new MiddlewareChain()
    if (options.middlewares) {
      options.middlewares.forEach((mw) => this.middlewareChain.use(mw))
    }
  }

  /**
   * Handle an incoming message
   * @param message The Echo message to handle
   * @param port MessagePort for sending responses (for Web Worker/Electron)
   */
  async handle(message: EchoMessage, port?: MessagePort | any): Promise<void> {
    if (!isCallMessage(message)) {
      if (this.options.debug) {
        console.log('[Echo Server] Ignoring non-call message:', message.type)
      }
      return
    }

    const { id, data } = message
    const { method, params = [], extracted } = data

    try {
      // Check if this is an iterator function
      const isIterFunc = this.options.iteratorFunctions
        ? this.options.iteratorFunctions.has(method)
        : isIteratorFunction(method)

      // Deserialize parameters
      const extractedMap = extracted ? new Map(extracted) : new Map()
      let finalParams = deserialize(params, extractedMap)

      // For iterator functions, create AbortController
      if (isIterFunc) {
        const abortController = new AbortController()
        this.abortControllers.set(id, abortController)

        // Add signal to params if options object exists
        if (
          finalParams.length > 0 &&
          typeof finalParams[finalParams.length - 1] === 'object' &&
          finalParams[finalParams.length - 1] !== null
        ) {
          const lastParam = finalParams[finalParams.length - 1]
          finalParams[finalParams.length - 1] = {
            ...lastParam,
            signal: abortController.signal,
          }
        } else {
          finalParams.push({ signal: abortController.signal })
        }

        // Listen for cancel messages
        if (port) {
          const cancelHandler = (e: any) => {
            const msg = e.data || e
            if (msg?.type === MessageType.IteratorCancel && msg?.id === id) {
              abortController.abort()
            }
          }
          if (typeof port.addEventListener === 'function') {
            port.addEventListener('message', cancelHandler)
          }
        }
      }

      // Execute the method call
      const result = await this.executeMethod(method, finalParams)

      // Handle iterator results
      if (isIterFunc && result && typeof result === 'object' && Symbol.asyncIterator in result) {
        await this.handleIteratorResult(result, id, port)
      } else {
        // Regular response
        const response = createResponseMessage(id, result)
        this.sendMessage(response, port)
      }
    } catch (error) {
      const errorResponse = createErrorMessage(
        id,
        error instanceof Error ? error : new Error(String(error))
      )
      this.sendMessage(errorResponse, port)
    } finally {
      // Cleanup
      this.abortControllers.delete(id)
    }
  }

  /**
   * Execute a method on the target object
   */
  private async executeMethod(method: string, params: any[]): Promise<any> {
    let callMethod: Function

    if (method.includes('.')) {
      // Handle nested method calls like "table(id).rows.query"
      let obj: any = this.target
      const properties = method.split('.')

      for (const property of properties.slice(0, -1)) {
        if (isFunctionCall(property)) {
          // Call function and move to its result
          const { name, params: callParams } = parseFunctionCall(property)
          const func = obj[name].bind(obj)
          // Parse string params (they come as strings from the path)
          const parsedParams = callParams.map((p) => {
            try {
              return JSON.parse(p)
            } catch {
              return p
            }
          })
          obj = await func(...parsedParams)
        } else {
          obj = obj[property]
        }
      }

      const lastProperty = properties[properties.length - 1]
      callMethod = (obj[lastProperty] as Function).bind(obj)
    } else {
      callMethod = (this.target[method] as Function).bind(this.target)
    }

    return await callMethod(...params)
  }

  /**
   * Handle async iterator results
   */
  private async handleIteratorResult(
    iterator: AsyncIterable<any>,
    callId: string,
    port?: MessagePort | any
  ): Promise<void> {
    const abortController = this.abortControllers.get(callId)

    try {
      for await (const value of iterator) {
        // Check if cancelled
        if (abortController?.signal.aborted) {
          break
        }

        const valueMessage = createIteratorValueMessage(callId, value)
        this.sendMessage(valueMessage, port)
      }

      // Signal completion
      const doneMessage = createIteratorDoneMessage(callId)
      this.sendMessage(doneMessage, port)
    } catch (error) {
      // Check if it's an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        const doneMessage = createIteratorDoneMessage(callId)
        this.sendMessage(doneMessage, port)
      } else {
        const errorMessage = createIteratorErrorMessage(
          callId,
          error instanceof Error ? error : new Error(String(error))
        )
        this.sendMessage(errorMessage, port)
      }
    }
  }

  /**
   * Send a message to the client
   */
  private sendMessage(message: EchoMessage, port?: MessagePort | any): void {
    if (port && typeof port.postMessage === 'function') {
      port.postMessage(message)
    } else if (this.options.debug) {
      console.log('[Echo Server] No port to send message:', message)
    }
  }
}

