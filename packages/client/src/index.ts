/**
 * @eidos.space/client
 *
 * Eidos RPC client for Node.js and browser environments.
 * Connect to an Eidos RPC endpoint over HTTP.
 *
 * @example
 * ```typescript
 * import { createEidosClient } from '@eidos.space/client'
 *
 * const eidos = createEidosClient({
 *   endpoint: 'http://localhost:3000/rpc'
 * })
 *
 * // Query table data
 * const posts = await eidos.currentSpace.table('posts').findMany({
 *   where: { published: true },
 *   orderBy: { created_at: 'desc' }
 * })
 *
 * // Get document
 * const doc = await eidos.currentSpace.doc.get('doc-id')
 * ```
 */

import { createSpaceProxy } from "./space-proxy"
import type { EidosClient, EidosClientConfig } from "./types"
import type { DataSpace } from "@eidos.space/core"

/**
 * Error message for features not available without main thread bridge
 */
const NO_BRIDGE_ERROR = (feature: string) =>
  `${feature} is not available without a mainThreadBridge. ` +
  `Please provide a mainThreadBridge in the configuration to enable this feature.`

/**
 * Create an Eidos client for connecting to an RPC endpoint
 *
 * @example
 * ```typescript
 * // Basic usage
 * const eidos = createEidosClient({
 *   endpoint: 'http://localhost:3000/rpc'
 * })
 *
 * // With main thread bridge (for iframe/webview environments)
 * const eidos = createEidosClient({
 *   endpoint: 'http://localhost:3000/rpc',
 *   mainThreadBridge: {
 *     generateText: async (options) => { ... },
 *     generateObject: async (options) => { ... },
 *     callScript: async (scriptId, ...args) => { ... },
 *     fetchBlob: async (url, options) => { ... },
 *     tableHighlightRow: (tableId, rowId, fieldId) => { ... }
 *   }
 * })
 * ```
 */
export function createEidosClient(config: EidosClientConfig): EidosClient {
  const { endpoint, timeout, fetch: fetchFn, mainThreadBridge } = config

  const spaceProxy = createSpaceProxy({
    endpoint,
    timeout,
    fetch: fetchFn,
    apiKey: config.apiKey,
  }) as unknown as DataSpace

  return {
    currentSpace: spaceProxy,
    space: spaceProxy,

    // AI methods - use bridge if available
    AI: {
      generateText: (options) => {
        if (!mainThreadBridge) {
          throw new Error(NO_BRIDGE_ERROR("AI.generateText"))
        }
        return mainThreadBridge.generateText(options)
      },
      generateObject: (options) => {
        if (!mainThreadBridge) {
          throw new Error(NO_BRIDGE_ERROR("AI.generateObject"))
        }
        return mainThreadBridge.generateObject(options)
      },
    },

    // Script methods - use bridge if available
    script: {
      call: (scriptId, ...args) => {
        if (!mainThreadBridge) {
          throw new Error(NO_BRIDGE_ERROR("script.call"))
        }
        return mainThreadBridge.callScript(scriptId, ...args)
      },
    },

    // Utils methods - use bridge if available
    utils: {
      fetchBlob: (url, options) => {
        if (!mainThreadBridge) {
          throw new Error(NO_BRIDGE_ERROR("utils.fetchBlob"))
        }
        return mainThreadBridge.fetchBlob(url, options)
      },
      tableHighlightRow: (tableId, rowId, fieldId) => {
        if (!mainThreadBridge) {
          throw new Error(NO_BRIDGE_ERROR("utils.tableHighlightRow"))
        }
        return mainThreadBridge.tableHighlightRow(tableId, rowId, fieldId)
      },
    },
  }
}

// Re-export types
export type { EidosClient, EidosClientConfig, MainThreadBridge } from "./types"

// Re-export DataSpace for convenience
export type { DataSpace } from "@eidos.space/core"

// Re-export low-level APIs for advanced usage
export { createSpaceProxy } from "./space-proxy"
export { createHttpTransport, onCallBack } from "./transport"
export type { TransportConfig, TransportPort } from "./transport"

// Re-export binary data utilities for server-side usage
export {
  containsBinaryData,
  processBinaryDataForResponse,
  restoreBinaryData,
  parseMultipartFormData,
} from "./binary-data"
