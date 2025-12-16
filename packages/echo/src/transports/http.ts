/**
 * HTTP transport
 * Migrated from HttpSqlite
 */

import { BaseTransport } from '../core/transport'
import type { EchoMessage, MessageHandler } from '../core/types'
import { MessageType } from '../core/types'
import type {
  UniversalFormData} from '../serialization/serializer';
import {
  serialize,
  toFormData,
  fromFormData,
  SerializationStrategy
} from '../serialization/serializer'

export interface HTTPTransportOptions {
  /**
   * Request timeout in milliseconds
   */
  timeout?: number

  /**
   * Custom headers
   */
  headers?: Record<string, string>

  /**
   * Whether to include credentials
   */
  credentials?: RequestCredentials
}

export class HTTPTransport extends BaseTransport<string> {
  private responseMap = new Map<string, any>()
  private messageHandlers: Set<MessageHandler> = new Set()
  private callbacksMap = new Map<string, (message: EchoMessage) => void>()
  private options: HTTPTransportOptions

  constructor(public connector: string, options: HTTPTransportOptions = {}) {
    super()
    this.options = {
      timeout: 30000,
      ...options,
    }
  }

  async send(message: EchoMessage): Promise<void> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.timeout
    )

    try {
      // Serialize the message data
      const serialized = serialize(
        message.data.params || [message.data]
      )

      let body: BodyInit
      let headers: Record<string, string> = {
        ...this.options.headers,
      }

      if (serialized.strategy === SerializationStrategy.FORM_DATA) {
        // Use FormData for binary data
        const formData = toFormData(serialized)
        // Add message metadata to FormData
        formData.set('_meta', JSON.stringify({
          id: message.id,
          type: message.type,
          method: message.data.method,
        }))
        body = formData
        // Let browser set Content-Type for FormData
      } else {
        // Use JSON for regular data
        body = JSON.stringify({
          ...message,
          data: {
            ...message.data,
            params: serialized.serialized,
            extracted: Array.from(serialized.extracted.entries()),
          },
        })
        headers['Content-Type'] = 'application/json'
      }

      const response = await fetch(this.connector, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        credentials: this.options.credentials,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      // Check response content type
      const contentType = response.headers.get('content-type')
      let responseData: any

      if (contentType?.includes('multipart/form-data')) {
        // Handle binary response
        const formData = await response.formData()
        const parsed = await fromFormData(formData as UniversalFormData)
        responseData = parsed.params
      } else {
        // Regular JSON response
        responseData = await response.json()
      }

      // Store response and notify handlers
      this.responseMap.set(message.id, responseData)
      
      const responseMessage: EchoMessage = {
        id: message.id,
        type: MessageType.QueryResp,
        data: { result: responseData },
      }
      
      // Call the specific callback for this message ID if it exists
      const callback = this.callbacksMap.get(message.id)
      if (callback) {
        callback(responseMessage)
        this.callbacksMap.delete(message.id)
      }
      // Also call global handlers
      this.messageHandlers.forEach((handler) => handler(responseMessage))
    } catch (error) {
      clearTimeout(timeoutId)
      
      const errorMessage: EchoMessage = {
        id: message.id,
        type: MessageType.Error,
        data: {
          message: error instanceof Error ? error.message : String(error),
        },
      }
      
      // Call the specific callback for this message ID if it exists
      const callback = this.callbacksMap.get(message.id)
      if (callback) {
        callback(errorMessage)
        this.callbacksMap.delete(message.id)
      }
      // Also call global handlers
      this.messageHandlers.forEach((handler) => handler(errorMessage))
      throw error
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

  /**
   * HTTP transport does not support iterators
   * Use Server-Sent Events (SSE) or WebSocket for streaming
   */
  onIterator<TValue = any>(_callId: string): AsyncIterable<TValue> {
    throw new Error(
      'Iterator functions are not supported over HTTP. Use WebSocket or SSE instead.'
    )
  }

  close(): void {
    this.responseMap.clear()
    this.messageHandlers = new Set()
  }
}

