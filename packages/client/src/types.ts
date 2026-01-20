import type { DataSpace } from '@eidos.space/core'

/**
 * Eidos client interface
 */
export interface EidosClient {
  /**
   * The current data space
   */
  currentSpace: DataSpace
  /**
   * Alias for currentSpace
   */
  space: DataSpace
}

/**
 * Client configuration
 */
export interface EidosClientConfig {
  /** RPC endpoint URL */
  endpoint: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Custom fetch function */
  fetch?: typeof fetch
  /** API Key for authentication */
  apiKey?: string
}
