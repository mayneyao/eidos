/**
 * Registry tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerIteratorFunction,
  unregisterIteratorFunction,
  isIteratorFunction,
  getIteratorFunctions,
  createRegistry,
} from '../core/registry'

describe('Registry', () => {
  it('should register iterator functions', () => {
    registerIteratorFunction('test.watch')
    expect(isIteratorFunction('test.watch')).toBe(true)
    
    unregisterIteratorFunction('test.watch')
    expect(isIteratorFunction('test.watch')).toBe(false)
  })

  it('should check pre-registered functions', () => {
    // These are registered by default
    expect(isIteratorFunction('doc.watch')).toBe(true)
    expect(isIteratorFunction('fs.watch')).toBe(true)
  })

  it('should return all registered functions', () => {
    const functions = getIteratorFunctions()
    expect(Array.isArray(functions)).toBe(true)
    expect(functions.length).toBeGreaterThan(0)
  })

  it('should create isolated registry', () => {
    const registry = createRegistry()
    
    registry.register('custom.watch')
    expect(registry.isIterator('custom.watch')).toBe(true)
    
    // Global registry should not be affected
    expect(isIteratorFunction('custom.watch')).toBe(false)
    
    registry.unregister('custom.watch')
    expect(registry.isIterator('custom.watch')).toBe(false)
  })

  it('should get all from custom registry', () => {
    const registry = createRegistry()
    
    registry.register('one')
    registry.register('two')
    
    const all = registry.getAll()
    expect(all).toEqual(['one', 'two'])
  })

  it('should clear custom registry', () => {
    const registry = createRegistry()
    
    registry.register('one')
    registry.register('two')
    registry.clear()
    
    expect(registry.getAll()).toEqual([])
  })
})

