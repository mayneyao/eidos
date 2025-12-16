/**
 * Core types for Echo RPC library
 */

/**
 * Message types for RPC communication
 */
export enum MessageType {
  // Request/Response
  CallFunction = 'CallFunction',
  QueryResp = 'QueryResp',
  Error = 'Error',

  // Iterator-related
  IteratorValue = 'IteratorValue',
  IteratorDone = 'IteratorDone',
  IteratorError = 'IteratorError',
  IteratorCancel = 'IteratorCancel',

  // Special
  DataUpdateSignal = 'DataUpdateSignal',
}

/**
 * Base message interface
 */
export interface EchoMessage {
  id: string
  type: MessageType
  data: Record<string, any>
}

/**
 * Function call message
 */
export interface CallFunctionMessage extends EchoMessage {
  type: MessageType.CallFunction
  data: {
    method: string
    params: any[]
    [key: string]: any
  }
}

/**
 * Response message
 */
export interface QueryRespMessage extends EchoMessage {
  type: MessageType.QueryResp
  data: {
    result: any
  }
}

/**
 * Error message
 */
export interface ErrorMessage extends EchoMessage {
  type: MessageType.Error
  data: {
    message: string
    stack?: string
  }
}

/**
 * Iterator value message
 */
export interface IteratorValueMessage extends EchoMessage {
  type: MessageType.IteratorValue
  data: {
    value: any
  }
}

/**
 * Iterator done message
 */
export interface IteratorDoneMessage extends EchoMessage {
  type: MessageType.IteratorDone
  data: Record<string, never>
}

/**
 * Iterator error message
 */
export interface IteratorErrorMessage extends EchoMessage {
  type: MessageType.IteratorError
  data: {
    message: string
    stack?: string
  }
}

/**
 * Iterator cancel message
 */
export interface IteratorCancelMessage extends EchoMessage {
  type: MessageType.IteratorCancel
  data: Record<string, never>
}

/**
 * Message handler function
 */
export type MessageHandler = (message: EchoMessage) => void | Promise<void>

/**
 * Transport interface - all transports must implement this
 */
export interface EchoTransport<TConnector = any> {
  /**
   * The underlying connector (Worker, IpcRenderer, etc.)
   */
  connector: TConnector

  /**
   * Send a message through the transport
   */
  send(message: EchoMessage): Promise<void> | void

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): void

  /**
   * Create an async iterator for streaming responses
   * Returns undefined if the transport doesn't support iterators
   */
  onIterator?<TValue = any>(callId: string): AsyncIterable<TValue>

  /**
   * Close the transport and clean up resources
   */
  close(): void
}

/**
 * Proxy creation options
 */
export interface ProxyOptions {
  /**
   * Additional data to include in every message
   */
  context?: Record<string, any>

  /**
   * Middleware to apply to requests
   */
  middlewares?: Middleware[]

  /**
   * Timeout for requests in milliseconds
   */
  timeout?: number

  /**
   * Custom iterator function registry
   */
  iteratorFunctions?: Set<string>
}

/**
 * Call context passed to middleware
 */
export interface CallContext {
  /**
   * Unique call ID
   */
  id: string

  /**
   * Method being called
   */
  method: string

  /**
   * Call parameters
   */
  params: any[]

  /**
   * Additional context data
   */
  data: Record<string, any>

  /**
   * Transport used for this call
   */
  transport: EchoTransport

  /**
   * Whether this is an iterator function
   */
  isIterator: boolean
}

/**
 * Middleware function type
 */
export type Middleware = (
  context: CallContext,
  next: () => Promise<any>
) => Promise<any>

/**
 * Serialization result
 */
export interface SerializationResult {
  /**
   * Serialized parameters (safe for postMessage)
   */
  serialized: any[]

  /**
   * Extracted non-serializable items
   */
  extracted: Map<string, ExtractedItem>
}

/**
 * Extracted non-serializable item
 */
export interface ExtractedItem {
  /**
   * Type of the extracted item
   */
  type: string

  /**
   * The actual value (may still be non-serializable)
   */
  value: any

  /**
   * Serialized representation (if applicable)
   */
  serialized?: any
}

/**
 * Type helper: Convert all methods to async and preserve iterators
 */
export type EchoClient<T extends object> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Ret
    ? Ret extends AsyncIterable<infer Item>
      ? (...args: Args) => AsyncIterable<Item>
      : (...args: Args) => Promise<Awaited<Ret>>
    : T[K] extends object
    ? EchoClient<T[K]>
    : T[K]
}

/**
 * Server handler options
 */
export interface ServerHandlerOptions {
  /**
   * Middleware to apply to incoming requests
   */
  middlewares?: Middleware[]

  /**
   * Custom iterator function registry
   */
  iteratorFunctions?: Set<string>

  /**
   * Enable debug logging
   */
  debug?: boolean
}

