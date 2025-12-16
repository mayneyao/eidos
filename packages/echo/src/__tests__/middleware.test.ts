/**
 * Middleware tests
 */

import { describe, it, expect } from 'vitest'
import { MiddlewareChain, composeMiddleware } from '../middleware/middleware'
import type { Middleware, CallContext } from '../core/types'
import { createMockTransport } from '../core/transport'

describe('Middleware', () => {
  const createMockContext = (): CallContext => ({
    id: 'test-id',
    method: 'test.method',
    params: [],
    data: {},
    transport: createMockTransport(),
    isIterator: false,
  })

  it('should execute middleware in order', async () => {
    const chain = new MiddlewareChain()
    const order: number[] = []

    const mw1: Middleware = async (ctx, next) => {
      order.push(1)
      const result = await next()
      order.push(4)
      return result
    }

    const mw2: Middleware = async (ctx, next) => {
      order.push(2)
      const result = await next()
      order.push(3)
      return result
    }

    chain.use(mw1).use(mw2)

    await chain.execute(createMockContext(), async () => 'result')

    expect(order).toEqual([1, 2, 3, 4])
  })

  it('should pass result through chain', async () => {
    const chain = new MiddlewareChain()

    const mw1: Middleware = async (ctx, next) => {
      const result = await next()
      return result + ' modified'
    }

    chain.use(mw1)

    const result = await chain.execute(createMockContext(), async () => 'original')

    expect(result).toBe('original modified')
  })

  it('should handle errors', async () => {
    const chain = new MiddlewareChain()

    const mw1: Middleware = async (ctx, next) => {
      try {
        return await next()
      } catch (error) {
        return 'caught'
      }
    }

    chain.use(mw1)

    const result = await chain.execute(createMockContext(), async () => {
      throw new Error('test error')
    })

    expect(result).toBe('caught')
  })

  it('should compose middlewares', async () => {
    const order: number[] = []

    const mw1: Middleware = async (ctx, next) => {
      order.push(1)
      return next()
    }

    const mw2: Middleware = async (ctx, next) => {
      order.push(2)
      return next()
    }

    const composed = composeMiddleware(mw1, mw2)

    await composed(createMockContext(), async () => 'result')

    expect(order).toEqual([1, 2])
  })

  it('should modify context', async () => {
    const chain = new MiddlewareChain()

    const mw1: Middleware = async (ctx, next) => {
      ctx.data.modified = true
      return next()
    }

    chain.use(mw1)

    const context = createMockContext()
    await chain.execute(context, async () => 'result')

    expect(context.data.modified).toBe(true)
  })
})

