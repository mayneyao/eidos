import type { DataSpace, Eidos } from "@eidos.space/core"

/**
 * Main thread bridge for AI, script, and utils operations
 * These features require a main thread environment with UI capabilities
 */
export interface MainThreadBridge {
  /** Generate text using AI */
  generateText: (options: {
    model?: string
    prompt: string
    [key: string]: any
  }) => Promise<string>

  /** Generate structured object using AI */
  generateObject: (options: {
    model?: string
    prompt: string
    schema: Record<string, any>
    [key: string]: any
  }) => Promise<Record<string, any>>

  /** Call another script */
  callScript: (scriptId: string, ...args: any[]) => Promise<any>

  /** Fetch blob from URL */
  fetchBlob: (url: string, options?: RequestInit) => Promise<Blob>

  /** Highlight a row in the table view */
  tableHighlightRow: (tableId: string, rowId: string, fieldId?: string) => void
}

/**
 * Eidos client interface
 *
 * AI, script, and utils methods require a mainThreadBridge to be provided
 * in the configuration. Without it, these methods will throw errors.
 */
export interface EidosClient extends Eidos {
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
  /**
   * Main thread bridge for AI, script, and utils operations
   * Required for features that need main thread capabilities
   */
  mainThreadBridge?: MainThreadBridge
}
