/**
 * Iterator handling utilities
 */

import type { EchoTransport, EchoMessage } from '../core/types'
import {  createIteratorCancelMessage } from '../core/message'

/**
 * Create an async iterator proxy for streaming responses
 */
export function createIteratorProxy<TValue = any>(
  transport: EchoTransport,
  callId: string,
  abortSignal?: AbortSignal,
  method?: string
): AsyncIterable<TValue> {
  if (!transport.onIterator) {
    throw new Error('Transport does not support iterators')
  }

  const iterator = transport.onIterator<TValue>(callId)

  // If AbortSignal is provided, set up cancellation
  if (abortSignal) {
    setupCancellation(transport, callId, abortSignal)
  }

  return iterator
}

/**
 * Setup cancellation for an iterator
 */
function setupCancellation(
  transport: EchoTransport,
  callId: string,
  signal: AbortSignal
): void {
  const cancelHandler = () => {
    const cancelMessage = createIteratorCancelMessage(callId)
    
    // Try to send cancel message
    try {
      transport.send(cancelMessage)
    } catch (error) {
      console.error('Failed to send iterator cancel message:', error)
    }
  }

  signal.addEventListener('abort', cancelHandler, { once: true })
}

/**
 * Check if a result is an async iterable
 */
export function isAsyncIterable(value: any): value is AsyncIterable<any> {
  return (
    value != null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value
  )
}

/**
 * Convert an async iterable to an array (for testing/debugging)
 */
export async function iteratorToArray<T>(
  iterable: AsyncIterable<T>,
  maxItems = 1000
): Promise<T[]> {
  const items: T[] = []

  for await (const item of iterable) {
    items.push(item)
    if (items.length >= maxItems) {
      break
    }
  }

  return items
}

/**
 * Wrap an async iterable with a timeout
 */
export function withIteratorTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
  onTimeout?: () => void
): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      const iterator = iterable[Symbol.asyncIterator]()
      
      while (true) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            if (onTimeout) onTimeout()
            reject(new Error(`Iterator timeout after ${timeoutMs}ms`))
          }, timeoutMs)
        })

        const nextPromise = iterator.next()
        const result = await Promise.race([nextPromise, timeoutPromise])

        if (result.done) break
        yield result.value
      }
    },
  }
}

