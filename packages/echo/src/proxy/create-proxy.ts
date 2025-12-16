/**
 * Create Echo proxy for remote API calls
 * Unified implementation migrated from getSqliteProxy and makeSpaceProxy
 */

import type {
  EchoTransport,
  ProxyOptions,
  CallContext,
  EchoClient,
} from '../core/types'
import { createCallMessage } from '../core/message'
import { isIteratorFunction } from '../core/registry'
import { serialize } from '../serialization/serializer'
import { MiddlewareChain } from '../middleware/middleware'
import { createIteratorProxy } from '../proxy/iterator'
import { isFunctionCall, parseFunctionCall } from './method-router'

/**
 * Create an Echo client proxy
 */
export function createEchoClient<T extends object>(
  transport: EchoTransport,
  options: ProxyOptions = {}
): EchoClient<T> {
  const {
    context = {},
    middlewares = [],
    timeout = 30000,
    iteratorFunctions: customIteratorFunctions,
  } = options

  const middlewareChain = new MiddlewareChain()
  middlewares.forEach((mw) => middlewareChain.use(mw))

  // Helper to check if a method is an iterator
  const checkIsIterator = (method: string): boolean => {
    if (customIteratorFunctions) {
      return customIteratorFunctions.has(method)
    }
    return isIteratorFunction(method)
  }

  // Create the main proxy
  return createProxy([], transport, context, middlewareChain, checkIsIterator, timeout) as EchoClient<T>
}

/**
 * Internal proxy creation (recursive for nested objects)
 */
function createProxy(
  path: string[],
  transport: EchoTransport,
  context: Record<string, any>,
  middlewareChain: MiddlewareChain,
  isIterator: (method: string) => boolean,
  timeout: number
): any {
  return new Proxy(() => {}, {
    get(_target, prop: string) {
      // Handle special properties
      if (prop === '_config' || prop === 'then' || prop === 'catch') {
        return undefined
      }

      // Build new path
      const newPath = [...path, prop]

      // Return a new proxy for chaining
      return createProxy(newPath, transport, context, middlewareChain, isIterator, timeout)
    },

    apply(_target, _thisArg, args: any[]) {
      // When called as a function, decide whether to return a new proxy or execute remote call
      const methodPath = path.join('.')
      const lastProp = path[path.length - 1]
      
      // Special handling for table(id) - returns a new proxy for chaining
      // Example: table(id).rows.query()
      if (lastProp === 'table' && path.length === 1 && args.length >= 1) {
        const newPath = [`table(${JSON.stringify(args[0])})`]
        return createProxy(newPath, transport, context, middlewareChain, isIterator, timeout)
      }
      
      // For method calls with Capital letter (like PascalCase table names), also return proxy
      // Example: MyTable.rows.query()
      if (path.length === 1 && /^[A-Z]/.test(lastProp) && args.length >= 1) {
        const newPath = [`${lastProp}(${JSON.stringify(args[0])})`]
        return createProxy(newPath, transport, context, middlewareChain, isIterator, timeout)
      }

      // All other cases: execute the remote call
      // This includes script.get(id), doc.create(...), etc.
      return executeRemoteCall(
        methodPath,
        args,
        transport,
        context,
        middlewareChain,
        isIterator,
        timeout
      )
    },
  })
}

/**
 * Execute a remote method call
 * For iterator functions, returns AsyncIterable synchronously
 * For regular functions, returns Promise<any>
 */
function executeRemoteCall(
  method: string,
  params: any[],
  transport: EchoTransport,
  context: Record<string, any>,
  middlewareChain: MiddlewareChain,
  isIterator: (method: string) => boolean,
  timeout: number
): any {
  // Serialize parameters
  const { serialized, extracted } = serialize(params)

  // Extract AbortSignal if present
  let abortSignal: AbortSignal | undefined
  for (const [, item] of extracted.entries()) {
    if (item.type === 'AbortSignal') {
      abortSignal = item.value
      break
    }
  }

  // Create message
  const message = createCallMessage(method, serialized, {
    ...context,
    extracted: Array.from(extracted.entries()),
  })

  // Check if this is an iterator function
  const isIterFunc = isIterator(method)

  // Create call context
  const callContext: CallContext = {
    id: message.id,
    method,
    params,
    data: context,
    transport,
    isIterator: isIterFunc,
  }

  // Execute through middleware chain
  const executeCall = async () => {
    try {
      // For regular functions, set up response handler BEFORE sending
      // to avoid race condition with Electron IPC
      const responsePromise = isIterFunc 
        ? null 
        : waitForResponse(transport, message.id, timeout)
      
      // Send message
      await transport.send(message)

      // Handle iterator functions
      if (isIterFunc) {
        if (!transport.onIterator) {
          throw new Error(
            `Method "${method}" is registered as an iterator function, but the transport does not support iterators. ` +
            `Please ensure the transport implements the onIterator method.`
          )
        }
        return createIteratorProxy(transport, message.id, abortSignal, method)
      }

      // Handle regular functions - return the already-waiting promise
      return responsePromise
    } catch (error) {
      throw error
    }
  }

  // For iterator functions, execute synchronously to return AsyncIterable directly
  if (isIterFunc) {
    if (middlewareChain.length > 0) {
      console.warn('[Echo] Warning: Middleware not supported for iterator functions')
    }
    
    // Send message (fire and forget for iterators)
    const sendResult = transport.send(message)
    if (sendResult && typeof sendResult.catch === 'function') {
      sendResult.catch((err: Error) => {
        console.error('[Echo] Error sending iterator message:', err)
      })
    }
    
    if (!transport.onIterator) {
      throw new Error(
        `Method "${method}" is registered as an iterator function, but the transport does not support iterators.`
      )
    }
    
    return createIteratorProxy(transport, message.id, abortSignal, method)
  }

  // For regular functions, use async execution
  if (middlewareChain.length > 0) {
    return middlewareChain.execute(callContext, executeCall)
  }

  return executeCall()
}

/**
 * Wait for a response message
 */
function waitForResponse(
  transport: EchoTransport,
  callId: string,
  timeout: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`))
    }, timeout)

    const handler = (message: any) => {
      console.log('[waitForResponse] Handler called:', {
        messageId: message?.id,
        expectedId: callId,
        messageType: message?.type,
        hasData: !!message?.data,
        fullMessage: message
      })
      
      if (message.id !== callId) return

      clearTimeout(timeoutId)

      if (message.type === 'QueryResp') {
        console.log('[waitForResponse] Resolving with result:', message.data.result)
        resolve(message.data.result)
      } else if (message.type === 'Error') {
        console.log('[waitForResponse] Rejecting with error:', message.data.message)
        reject(new Error(message.data.message))
      } else {
        console.warn('[waitForResponse] Unexpected message type:', message.type)
      }
    }

    // Use onCallback if available (for transport-specific optimization)
    if ('onCallback' in transport && typeof (transport as any).onCallback === 'function') {
      (transport as any).onCallback(callId, handler)
    } else {
      // Fallback to global onMessage
      transport.onMessage(handler)
    }
  })
}

