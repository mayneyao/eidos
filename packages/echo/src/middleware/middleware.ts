/**
 * Middleware system for Echo
 */

import type { Middleware, CallContext } from '../core/types'

/**
 * Middleware chain executor
 */
export class MiddlewareChain {
  private middlewares: Middleware[] = []

  /**
   * Add a middleware to the chain
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware)
    return this
  }

  /**
   * Execute the middleware chain
   */
  async execute(context: CallContext, finalHandler: () => Promise<any>): Promise<any> {
    let index = 0

    const next = async (): Promise<any> => {
      if (index >= this.middlewares.length) {
        return finalHandler()
      }

      const middleware = this.middlewares[index++]
      return middleware(context, next)
    }

    return next()
  }

  /**
   * Get number of registered middlewares
   */
  get length(): number {
    return this.middlewares.length
  }

  /**
   * Clear all middlewares
   */
  clear(): void {
    this.middlewares = []
  }
}

/**
 * Compose multiple middlewares into one
 */
export function composeMiddleware(...middlewares: Middleware[]): Middleware {
  return async (context, next) => {
    const chain = new MiddlewareChain()
    middlewares.forEach((mw) => chain.use(mw))
    return chain.execute(context, next)
  }
}

/**
 * Create a conditional middleware
 */
export function conditionalMiddleware(
  condition: (context: CallContext) => boolean,
  middleware: Middleware
): Middleware {
  return async (context, next) => {
    if (condition(context)) {
      return middleware(context, next)
    }
    return next()
  }
}

/**
 * Create a middleware that catches errors
 */
export function errorHandlerMiddleware(
  handler: (error: Error, context: CallContext) => void | Promise<void>
): Middleware {
  return async (context, next) => {
    try {
      return await next()
    } catch (error) {
      await handler(error instanceof Error ? error : new Error(String(error)), context)
      throw error
    }
  }
}

