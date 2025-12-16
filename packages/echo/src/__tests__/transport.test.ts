/**
 * Transport tests
 */

import { describe, it, expect } from 'vitest'
import { createMockTransport } from '../core/transport'
import { MessageType } from '../core/types'
import { createCallMessage } from '../core/message'

describe('Transport', () => {
  it('should create mock transport', () => {
    const transport = createMockTransport()
    expect(transport).toBeDefined()
    expect(transport.connector).toBeNull()
  })

  it('should send messages', () => {
    const transport = createMockTransport() as any
    const message = createCallMessage('test.method', [1, 2, 3])
    
    transport.send(message)
    
    expect(transport._sentMessages).toHaveLength(1)
    expect(transport._sentMessages[0]).toEqual(message)
  })

  it('should register message handlers', () => {
    const transport = createMockTransport() as any
    const handler = () => {}
    
    transport.onMessage(handler)
    
    expect(transport._handlers).toHaveLength(1)
    expect(transport._handlers[0]).toBe(handler)
  })
})

