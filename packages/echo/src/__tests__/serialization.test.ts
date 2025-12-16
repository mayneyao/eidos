/**
 * Serialization tests
 */

import { describe, it, expect } from 'vitest'
import {
  serialize,
  deserialize,
  containsBinaryData,
} from '../serialization/serializer'
import { SerializationStrategy } from '../serialization/serializer'

describe('Serialization', () => {
  it('should serialize simple params', () => {
    const params = [1, 'test', true]
    const result = serialize(params)
    
    expect(result.strategy).toBe(SerializationStrategy.JSON)
    expect(result.serialized).toEqual(params)
  })

  it('should extract AbortSignal', () => {
    const controller = new AbortController()
    const params = [{ signal: controller.signal }]
    
    const result = serialize(params)
    
    expect(result.extracted.size).toBeGreaterThan(0)
    expect(result.serialized[0]).not.toHaveProperty('signal')
  })

  it('should handle Date objects', () => {
    const date = new Date('2024-01-01')
    const params = [{ date }]
    
    const { serialized, extracted } = serialize(params)
    const restored = deserialize(serialized, extracted)
    
    expect(restored[0].date).toBeInstanceOf(Date)
    expect(restored[0].date.toISOString()).toBe(date.toISOString())
  })

  it('should detect binary data', () => {
    const buffer = new ArrayBuffer(10)
    expect(containsBinaryData(buffer)).toBe(true)
    expect(containsBinaryData('string')).toBe(false)
    expect(containsBinaryData([buffer])).toBe(true)
  })

  it('should handle RegExp', () => {
    const regex = /test/gi
    const params = [{ pattern: regex }]
    
    const { serialized, extracted } = serialize(params)
    const restored = deserialize(serialized, extracted)
    
    expect(restored[0].pattern).toBeInstanceOf(RegExp)
    expect(restored[0].pattern.source).toBe(regex.source)
    expect(restored[0].pattern.flags).toBe(regex.flags)
  })

  it('should handle Map', () => {
    const map = new Map([['a', 1], ['b', 2]])
    const params = [{ data: map }]
    
    const { serialized, extracted } = serialize(params)
    const restored = deserialize(serialized, extracted)
    
    expect(restored[0].data).toBeInstanceOf(Map)
    expect(restored[0].data.get('a')).toBe(1)
    expect(restored[0].data.get('b')).toBe(2)
  })

  it('should handle Set', () => {
    const set = new Set([1, 2, 3])
    const params = [{ data: set }]
    
    const { serialized, extracted } = serialize(params)
    const restored = deserialize(serialized, extracted)
    
    expect(restored[0].data).toBeInstanceOf(Set)
    expect(restored[0].data.has(1)).toBe(true)
    expect(restored[0].data.has(2)).toBe(true)
    expect(restored[0].data.has(3)).toBe(true)
  })
})

