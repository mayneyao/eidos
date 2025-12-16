/**
 * Unified serialization interface
 * Combines non-serializable and binary data handling
 */

import {
  extractNonSerializable,
  restoreNonSerializable,
} from './non-serializable'
import {
  containsBinaryData,
  processBinaryData,
  restoreBinaryData,
} from './binary-data'
import type { SerializationResult } from '../core/types'

/**
 * Universal FormData interface that works in both browser and Node.js
 * 
 * @remarks
 * - Browser: uses DOM FormData API
 * - Node.js 18+: uses built-in FormData from undici
 * - Ensures type compatibility across environments
 */
export interface UniversalFormData {
  append(name: string, value: string | Blob, fileName?: string): void
  delete(name: string): void
  get(name: string): FormDataEntryValue | null
  getAll(name: string): FormDataEntryValue[]
  has(name: string): boolean
  set(name: string, value: string | Blob, fileName?: string): void
  entries(): IterableIterator<[string, FormDataEntryValue]>
  keys(): IterableIterator<string>
  values(): IterableIterator<FormDataEntryValue>
  forEach(
    callbackfn: (value: FormDataEntryValue, key: string, parent: UniversalFormData) => void,
    thisArg?: any
  ): void
  [Symbol.iterator](): IterableIterator<[string, FormDataEntryValue]>
}

/**
 * Serialization strategy
 */
export enum SerializationStrategy {
  /** Use JSON serialization (default) */
  JSON = 'json',
  /** Use FormData serialization (for binary data) */
  FORM_DATA = 'formdata',
}

/**
 * Complete serialization result
 */
export interface FullSerializationResult extends SerializationResult {
  /**
   * Recommended strategy for transport
   */
  strategy: SerializationStrategy

  /**
   * Binary data map (if any)
   */
  binaryData?: Map<string, Blob>
}

/**
 * Serialize data for transport
 * Automatically detects and handles binary data and non-serializable objects
 */
export function serialize(data: any[]): FullSerializationResult {
  // First, extract non-serializable objects
  const { serialized, extracted } = extractNonSerializable(data)

  // Check if there's binary data
  const hasBinary = containsBinaryData(serialized)

  if (!hasBinary) {
    // Simple JSON serialization
    return {
      serialized,
      extracted,
      strategy: SerializationStrategy.JSON,
    }
  }

  // Process binary data
  const binaryData = new Map<string, Blob>()
  let binaryIndex = 0

  const processedData = processBinaryData(serialized, (blob) => {
    const fieldName = `binary_${binaryIndex++}`
    binaryData.set(fieldName, blob)
    return fieldName
  })

  return {
    serialized: processedData,
    extracted,
    strategy: SerializationStrategy.FORM_DATA,
    binaryData,
  }
}

/**
 * Deserialize data after transport
 */
export function deserialize(
  data: any[],
  extracted: Map<string, any>,
  binaryDataMap?: Record<string, any>
): any[] {
  // First restore binary data if present
  let restored = data
  if (binaryDataMap && Object.keys(binaryDataMap).length > 0) {
    restored = restoreBinaryData(data, binaryDataMap)
  }

  // Then restore non-serializable objects
  return restoreNonSerializable(restored, extracted)
}

/**
 * Create FormData from serialization result
 * Used for HTTP transport with binary data
 * 
 * @remarks
 * Works in both browser and Node.js environments:
 * - Browser: uses DOM FormData
 * - Node.js 18+: uses built-in FormData
 */
export function toFormData(result: FullSerializationResult): UniversalFormData {
  const formData = new FormData() as UniversalFormData

  // Add JSON data
  formData.append('json', JSON.stringify({
    params: result.serialized,
    extracted: Array.from(result.extracted.entries()),
  }))

  // Add binary data
  if (result.binaryData) {
    for (const [key, blob] of result.binaryData.entries()) {
      formData.append(key, blob)
    }
  }

  return formData
}

/**
 * Parse FormData back to serialization result
 * 
 * @remarks
 * Works in both browser and Node.js environments:
 * - Browser: uses DOM FormData with Blob
 * - Node.js: uses FormData with File or Blob-like objects
 */
export async function fromFormData(formData: UniversalFormData): Promise<{
  params: any[]
  extracted: Map<string, any>
  binaryDataMap: Record<string, any>
}> {
  // Parse JSON data
  const jsonStr = formData.get('json')
  if (!jsonStr || typeof jsonStr !== 'string') {
    throw new Error('Missing or invalid JSON data in FormData')
  }

  const jsonData = JSON.parse(jsonStr)
  const extracted = new Map<string, any>(jsonData.extracted || [])

  // Extract binary data
  // Note: In Node.js, value might be File instead of Blob, but both have arrayBuffer()
  const binaryDataMap: Record<string, any> = {}
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('binary_') && typeof value === 'object' && value !== null) {
      // Check if value has arrayBuffer method (works for both Blob and File)
      if ('arrayBuffer' in value && typeof value.arrayBuffer === 'function') {
        const arrayBuffer = await value.arrayBuffer()
        binaryDataMap[key] = {
          data: arrayBuffer,
          type: 'type' in value ? value.type : 'application/octet-stream',
          size: 'size' in value ? value.size : arrayBuffer.byteLength,
        }
      }
    }
  }

  return {
    params: jsonData.params,
    extracted,
    binaryDataMap,
  }
}

// Re-export utilities
export { containsBinaryData, processBinaryData, restoreBinaryData } from './binary-data'
export {
  extractNonSerializable,
  restoreNonSerializable,
  serializeParams,
  deserializeParams,
} from './non-serializable'

