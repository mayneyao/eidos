/**
 * Binary data handling for HTTP/FormData transport
 * Migrated from sandbox/src/binary-data.ts
 */

/**
 * Check if data contains binary content
 */
export function containsBinaryData(data: any): boolean {
  if (data === null || data === undefined) return false

  if (
    data instanceof ArrayBuffer ||
    data instanceof Blob ||
    data instanceof File
  ) {
    return true
  }

  // Check for TypedArray types (Uint8Array, Int8Array, etc.)
  if (
    data &&
    data.buffer instanceof ArrayBuffer &&
    data.byteLength !== undefined
  ) {
    return true
  }

  if (Array.isArray(data)) {
    return data.some((item) => containsBinaryData(item))
  }

  if (typeof data === 'object') {
    return Object.values(data).some((value) => containsBinaryData(value))
  }

  return false
}

/**
 * Process binary data and replace with references (for requests)
 */
export function processBinaryData(
  data: any,
  onBinaryData: (binaryData: Blob) => string
): any {
  if (data === null || data === undefined) return data

  if (data instanceof ArrayBuffer) {
    const fieldName = onBinaryData(new Blob([data]))
    return { __binary_ref: fieldName, type: 'ArrayBuffer' }
  }

  // Handle TypedArray types (Uint8Array, Int8Array, etc.)
  if (
    data &&
    data.buffer instanceof ArrayBuffer &&
    data.byteLength !== undefined
  ) {
    const fieldName = onBinaryData(new Blob([data.buffer]))
    return {
      __binary_ref: fieldName,
      type: data.constructor.name,
      byteLength: data.byteLength,
    }
  }

  if (data instanceof Blob) {
    const fieldName = onBinaryData(data)
    return { __binary_ref: fieldName, type: 'Blob' }
  }

  if (data instanceof File) {
    const fieldName = onBinaryData(data)
    return { __binary_ref: fieldName, type: 'File', name: data.name }
  }

  if (Array.isArray(data)) {
    return data.map((item) => processBinaryData(item, onBinaryData))
  }

  if (typeof data === 'object') {
    const processed: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      processed[key] = processBinaryData(value, onBinaryData)
    }
    return processed
  }

  return data
}

/**
 * Restore binary data from form fields (for responses)
 */
export function restoreBinaryData(
  data: any,
  binaryDataMap: Record<string, any>
): any {
  if (data === null || data === undefined) return data

  if (typeof data === 'object' && data.__binary_ref) {
    const binaryData = binaryDataMap[data.__binary_ref]
    if (!binaryData) {
      throw new Error(`Binary data reference not found: ${data.__binary_ref}`)
    }

    if (data.type === 'ArrayBuffer') {
      return binaryData.data
    }

    // Handle TypedArray types
    if (data.type && data.type.includes('Array') && data.type !== 'ArrayBuffer') {
      const arrayBuffer = binaryData.data
      const byteLength = data.byteLength || arrayBuffer.byteLength

      switch (data.type) {
        case 'Uint8Array':
          return new Uint8Array(arrayBuffer, 0, byteLength)
        case 'Uint8ClampedArray':
          return new Uint8ClampedArray(arrayBuffer, 0, byteLength)
        case 'Uint16Array':
          return new Uint16Array(arrayBuffer, 0, byteLength / 2)
        case 'Uint32Array':
          return new Uint32Array(arrayBuffer, 0, byteLength / 4)
        case 'Int8Array':
          return new Int8Array(arrayBuffer, 0, byteLength)
        case 'Int16Array':
          return new Int16Array(arrayBuffer, 0, byteLength / 2)
        case 'Int32Array':
          return new Int32Array(arrayBuffer, 0, byteLength / 4)
        case 'Float32Array':
          return new Float32Array(arrayBuffer, 0, byteLength / 4)
        case 'Float64Array':
          return new Float64Array(arrayBuffer, 0, byteLength / 8)
        default:
          return new Uint8Array(arrayBuffer, 0, byteLength)
      }
    }

    if (data.type === 'Blob') {
      return new Blob([binaryData.data], { type: binaryData.type })
    }

    if (data.type === 'File') {
      return new File([binaryData.data], data.name || binaryData.name, {
        type: binaryData.type,
      })
    }

    return binaryData
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreBinaryData(item, binaryDataMap))
  }

  if (typeof data === 'object') {
    const restored: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      restored[key] = restoreBinaryData(value, binaryDataMap)
    }
    return restored
  }

  return data
}

