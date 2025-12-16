/**
 * Logger middleware
 */

import type { Middleware, CallContext } from '../core/types'

export interface LoggerOptions {
  /**
   * Whether to log requests
   */
  logRequests?: boolean

  /**
   * Whether to log responses
   */
  logResponses?: boolean

  /**
   * Whether to log errors
   */
  logErrors?: boolean

  /**
   * Whether to log timing
   */
  logTiming?: boolean

  /**
   * Custom logger function
   */
  logger?: {
    log: (message: string, ...args: any[]) => void
    error: (message: string, ...args: any[]) => void
  }

  /**
   * Filter function to determine which calls to log
   */
  filter?: (context: CallContext) => boolean
}

/**
 * Create a logger middleware
 */
export function createLoggerMiddleware(options: LoggerOptions = {}): Middleware {
  const {
    logRequests = true,
    logResponses = true,
    logErrors = true,
    logTiming = true,
    logger = console,
    filter,
  } = options

  return async (context, next) => {
    // Apply filter if provided
    if (filter && !filter(context)) {
      return next()
    }

    const startTime = Date.now()

    if (logRequests) {
      logger.log(
        `[Echo] → ${context.method}`,
        context.params.length > 0 ? context.params : ''
      )
    }

    try {
      const result = await next()

      if (logResponses) {
        const duration = Date.now() - startTime
        logger.log(
          `[Echo] ← ${context.method}`,
          logTiming ? `(${duration}ms)` : '',
          result !== undefined ? result : ''
        )
      }

      return result
    } catch (error) {
      if (logErrors) {
        const duration = Date.now() - startTime
        logger.error(
          `[Echo] ✗ ${context.method}`,
          logTiming ? `(${duration}ms)` : '',
          error
        )
      }
      throw error
    }
  }
}

/**
 * Simple logger middleware with default options
 */
export const loggerMiddleware: Middleware = createLoggerMiddleware()

