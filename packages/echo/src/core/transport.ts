/**
 * Base transport class and utilities
 */

import type { EchoTransport, MessageHandler, EchoMessage } from './types'

/**
 * Abstract base class for transports
 * Provides common functionality for all transport implementations
 */
export abstract class BaseTransport<TConnector = any>
  implements EchoTransport<TConnector>
{
  abstract connector: TConnector

  abstract send(message: EchoMessage): Promise<void> | void

  abstract onMessage(handler: MessageHandler): void

  abstract close(): void

  /**
   * Optional iterator support
   * Transports that don't support streaming can leave this undefined
   */
  onIterator?<TValue = any>(callId: string): AsyncIterable<TValue>
}

/**
 * Check if a transport supports iterators
 */
export function supportsIterators(transport: EchoTransport): boolean {
  return typeof transport.onIterator === 'function'
}

/**
 * Wrap a transport with error handling
 */
export function withErrorHandling<T extends EchoTransport>(
  transport: T,
  onError: (error: Error) => void
): T {
  const originalSend = transport.send.bind(transport)

  transport.send = async (message: EchoMessage) => {
    try {
      await originalSend(message)
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  return transport
}

/**
 * Create a mock transport for testing
 */
export function createMockTransport(): EchoTransport<null> {
  const handlers: MessageHandler[] = []
  const sentMessages: EchoMessage[] = []

  return {
    connector: null,
    
    send(message: EchoMessage) {
      sentMessages.push(message)
    },

    onMessage(handler: MessageHandler) {
      handlers.push(handler)
    },

    close() {
      handlers.length = 0
      sentMessages.length = 0
    },

    // Expose for testing
    _handlers: handlers,
    _sentMessages: sentMessages,
  } as any
}

