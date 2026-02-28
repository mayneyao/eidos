/**
 * Utilities for handling iterator functions and parameter serialization
 */

/**
 * Registry of iterator functions that return AsyncIterable
 * Format: "methodName" or "namespace.methodName"
 */
export const ITERATOR_FUNCTIONS = new Set<string>([
  "fs.watch",
  // Add more iterator functions here as needed
  // Example: "stream.read", "events.on"
])

/**
 * Check if a method name represents an iterator function
 */
export function isIteratorFunction(methodName: string): boolean {
  return ITERATOR_FUNCTIONS.has(methodName)
}

/**
 * Register a new iterator function
 */
export function registerIteratorFunction(methodName: string): void {
  ITERATOR_FUNCTIONS.add(methodName)
}

/**
 * Extract non-serializable values from an object and replace them with placeholders
 * Returns the serialized object and a map of extracted values
 */
export function extractNonSerializable(
  value: any,
  path: string = ""
): {
  serialized: any
  extracted: Map<string, { type: string; value: any }>
} {
  const extracted = new Map<string, { type: string; value: any }>()

  function processValue(val: any, currentPath: string): any {
    // Handle null and undefined
    if (val === null || val === undefined) {
      return val
    }

    // Handle primitives
    if (typeof val !== "object") {
      return val
    }

    // Handle ArrayBuffer and ArrayBufferView (TypedArrays, DataView)
    // These are supported by Electron IPC / Structured Clone
    if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
      return val
    }

    // Handle arrays
    if (Array.isArray(val)) {
      return val.map((item, index) =>
        processValue(item, `${currentPath}[${index}]`)
      )
    }

    // Handle Date
    if (val instanceof Date) {
      const key = currentPath || "date"
      extracted.set(key, { type: "Date", value: val.toISOString() })
      return { __serialized: "Date", __path: key }
    }

    // Handle AbortSignal
    if (val instanceof AbortSignal) {
      const key = currentPath || "signal"
      extracted.set(key, { type: "AbortSignal", value: val })
      return { __serialized: "AbortSignal", __path: key }
    }

    // Handle AbortController
    if (val instanceof AbortController) {
      const key = currentPath || "controller"
      extracted.set(key, { type: "AbortController", value: val.signal })
      return { __serialized: "AbortSignal", __path: key }
    }

    // Handle RegExp
    if (val instanceof RegExp) {
      const key = currentPath || "regexp"
      extracted.set(key, {
        type: "RegExp",
        value: { source: val.source, flags: val.flags },
      })
      return { __serialized: "RegExp", __path: key }
    }

    // Handle Map
    if (val instanceof Map) {
      const key = currentPath || "map"
      extracted.set(key, { type: "Map", value: Array.from(val.entries()) })
      return { __serialized: "Map", __path: key }
    }

    // Handle Set
    if (val instanceof Set) {
      const key = currentPath || "set"
      extracted.set(key, { type: "Set", value: Array.from(val) })
      return { __serialized: "Set", __path: key }
    }

    // Handle Error objects
    if (val instanceof Error) {
      const key = currentPath || "error"
      extracted.set(key, {
        type: "Error",
        value: {
          name: val.name,
          message: val.message,
          stack: val.stack,
        },
      })
      return { __serialized: "Error", __path: key }
    }

    // Handle plain objects - recursively process
    const result: any = {}
    for (const [key, itemValue] of Object.entries(val)) {
      const itemPath = currentPath ? `${currentPath}.${key}` : key
      result[key] = processValue(itemValue, itemPath)
    }
    return result
  }

  const serialized = processValue(value, path)
  return { serialized, extracted }
}

/**
 * Restore non-serializable values in an object using the extracted map
 */
export function restoreNonSerializable(
  serialized: any,
  extracted: Map<string, { type: string; value: any }>
): any {
  function processValue(val: any): any {
    if (val === null || val === undefined) {
      return val
    }

    if (typeof val !== "object") {
      return val
    }

    // Handle ArrayBuffer and ArrayBufferView (TypedArrays, DataView)
    if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
      return val
    }

    // Check if this is a serialized placeholder
    if (val.__serialized && val.__path) {
      const extractedItem = extracted.get(val.__path)
      if (extractedItem) {
        switch (extractedItem.type) {
          case "Date":
            return new Date(extractedItem.value)
          case "AbortSignal":
            return extractedItem.value // Already an AbortSignal
          case "RegExp":
            return new RegExp(
              extractedItem.value.source,
              extractedItem.value.flags
            )
          case "Map":
            return new Map(extractedItem.value)
          case "Set":
            return new Set(extractedItem.value)
          case "Error":
            const error = new Error(extractedItem.value.message)
            error.name = extractedItem.value.name
            error.stack = extractedItem.value.stack
            return error
          default:
            return extractedItem.value
        }
      }
      return val
    }

    // Handle arrays
    if (Array.isArray(val)) {
      return val.map(processValue)
    }

    // Handle plain objects
    const result: any = {}
    for (const [key, itemValue] of Object.entries(val)) {
      result[key] = processValue(itemValue)
    }
    return result
  }

  return processValue(serialized)
}

/**
 * Smart parameter serialization for RPC calls
 * Extracts non-serializable values and returns serialized params + extracted values
 */
export function serializeParams(params: any[]): {
  serialized: any[]
  extracted: Map<string, { type: string; value: any }>
} {
  const allExtracted = new Map<string, { type: string; value: any }>()
  const serialized = params.map((param, index) => {
    const { serialized: serializedParam, extracted } = extractNonSerializable(
      param,
      `param[${index}]`
    )
    // Merge extracted values with index prefix
    for (const [key, value] of extracted.entries()) {
      allExtracted.set(key, value)
    }
    return serializedParam
  })
  return { serialized, extracted: allExtracted }
}
