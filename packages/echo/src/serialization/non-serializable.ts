/**
 * Handle non-serializable objects (AbortSignal, Date, RegExp, etc.)
 * Migrated and improved from iterator-utils.ts
 */

import type { ExtractedItem, SerializationResult } from '../core/types'

/**
 * Extract non-serializable values from parameters
 * Returns serialized params + map of extracted items
 */
export function extractNonSerializable(
  params: any[],
  basePath = ''
): SerializationResult {
  const extracted = new Map<string, ExtractedItem>()

  function processValue(val: any, currentPath: string): any {
    if (val === null || val === undefined) {
      return val
    }

    // AbortSignal
    if (val instanceof AbortSignal || (val && val.aborted !== undefined && typeof val.addEventListener === 'function')) {
      const key = currentPath || 'signal'
      extracted.set(key, { type: 'AbortSignal', value: val })
      return { __serialized: 'AbortSignal', __path: key }
    }

    // AbortController (extract its signal)
    if (val instanceof AbortController || (val && val.signal && val.abort)) {
      const key = currentPath || 'controller'
      extracted.set(key, { type: 'AbortSignal', value: val.signal })
      return { __serialized: 'AbortSignal', __path: key }
    }

    // Date
    if (val instanceof Date) {
      const key = currentPath || 'date'
      extracted.set(key, {
        type: 'Date',
        value: val,
        serialized: val.toISOString(),
      })
      return { __serialized: 'Date', __path: key, __value: val.toISOString() }
    }

    // RegExp
    if (val instanceof RegExp) {
      const key = currentPath || 'regexp'
      extracted.set(key, {
        type: 'RegExp',
        value: val,
        serialized: { source: val.source, flags: val.flags },
      })
      return {
        __serialized: 'RegExp',
        __path: key,
        __value: { source: val.source, flags: val.flags },
      }
    }

    // Map
    if (val instanceof Map) {
      const key = currentPath || 'map'
      const entries = Array.from(val.entries())
      extracted.set(key, {
        type: 'Map',
        value: val,
        serialized: entries,
      })
      return {
        __serialized: 'Map',
        __path: key,
        __value: entries.map(([k, v]) => [
          processValue(k, `${currentPath}.key`),
          processValue(v, `${currentPath}.value`),
        ]),
      }
    }

    // Set
    if (val instanceof Set) {
      const key = currentPath || 'set'
      const values = Array.from(val.values())
      extracted.set(key, {
        type: 'Set',
        value: val,
        serialized: values,
      })
      return {
        __serialized: 'Set',
        __path: key,
        __value: values.map((v, i) => processValue(v, `${currentPath}[${i}]`)),
      }
    }

    // Error
    if (val instanceof Error) {
      const key = currentPath || 'error'
      extracted.set(key, {
        type: 'Error',
        value: val,
        serialized: { name: val.name, message: val.message, stack: val.stack },
      })
      return {
        __serialized: 'Error',
        __path: key,
        __value: { name: val.name, message: val.message, stack: val.stack },
      }
    }

    // Array
    if (Array.isArray(val)) {
      return val.map((item, index) =>
        processValue(item, `${currentPath}[${index}]`)
      )
    }

    // Plain object
    if (typeof val === 'object' && val.constructor === Object) {
      const result: Record<string, any> = {}
      for (const [key, value] of Object.entries(val)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key
        result[key] = processValue(value, newPath)
      }
      return result
    }

    // Primitive or unknown - return as-is
    return val
  }

  const serialized = params.map((param, index) =>
    processValue(param, `param${index}`)
  )

  return { serialized, extracted }
}

/**
 * Restore non-serializable values from extracted map
 */
export function restoreNonSerializable(
  params: any[],
  extracted: Map<string, ExtractedItem>
): any[] {
  if (extracted.size === 0) {
    return params
  }

  function processValue(val: any): any {
    if (val === null || val === undefined) {
      return val
    }

    // Check if this is a serialized marker
    if (
      typeof val === 'object' &&
      val.__serialized &&
      val.__path
    ) {
      const extractedItem = extracted.get(val.__path)
      if (!extractedItem) {
        // If we can't find the extracted item, try to restore from __value
        return restoreFromValue(val)
      }

      switch (extractedItem.type) {
        case 'AbortSignal':
          // We can't restore the original signal, caller should create a new one
          return undefined

        case 'Date':
          return new Date(val.__value)

        case 'RegExp':
          return new RegExp(val.__value.source, val.__value.flags)

        case 'Map':
          return new Map(
            val.__value.map(([k, v]: [any, any]) => [
              processValue(k),
              processValue(v),
            ])
          )

        case 'Set':
          return new Set(val.__value.map(processValue))

        case 'Error': {
          const error = new Error(val.__value.message)
          error.name = val.__value.name
          error.stack = val.__value.stack
          return error
        }

        default:
          return val
      }
    }

    // Array
    if (Array.isArray(val)) {
      return val.map(processValue)
    }

    // Plain object
    if (typeof val === 'object' && val.constructor === Object) {
      const result: Record<string, any> = {}
      for (const [key, value] of Object.entries(val)) {
        result[key] = processValue(value)
      }
      return result
    }

    return val
  }

  function restoreFromValue(val: any): any {
    if (!val.__value) return undefined

    switch (val.__serialized) {
      case 'Date':
        return new Date(val.__value)
      case 'RegExp':
        return new RegExp(val.__value.source, val.__value.flags)
      case 'Map':
        return new Map(val.__value)
      case 'Set':
        return new Set(val.__value)
      case 'Error': {
        const error = new Error(val.__value.message)
        error.name = val.__value.name
        error.stack = val.__value.stack
        return error
      }
      default:
        return undefined
    }
  }

  return params.map(processValue)
}

/**
 * Serialize parameters for transport
 * This is the main entry point for parameter serialization
 */
export function serializeParams(params: any[]): SerializationResult {
  return extractNonSerializable(params)
}

/**
 * Deserialize parameters after transport
 */
export function deserializeParams(
  params: any[],
  extracted: Map<string, ExtractedItem>
): any[] {
  return restoreNonSerializable(params, extracted)
}

