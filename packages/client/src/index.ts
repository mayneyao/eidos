/**
 * @eidos.space/client
 * 
 * Eidos RPC client for Node.js and browser environments.
 * Connect to a headless Eidos server via HTTP.
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

import { createSpaceProxy } from './space-proxy'
import type { EidosClient, EidosClientConfig } from './types'
import type { DataSpace } from '@eidos.space/core'

/**
 * Create an Eidos client for connecting to headless server
 */
export function createEidosClient(config: EidosClientConfig): EidosClient {
  const { endpoint, timeout, fetch: fetchFn } = config
  
  const spaceProxy = createSpaceProxy({
    endpoint,
    timeout,
    fetch: fetchFn,
  }) as unknown as DataSpace
  
  return {
    currentSpace: spaceProxy,
    space: spaceProxy,
  }
}

// Re-export types
export type {
  EidosClient,
  EidosClientConfig,
} from './types'

// Re-export DataSpace for convenience
export type { DataSpace } from '@eidos.space/core'

// Re-export low-level APIs for advanced usage
export { createSpaceProxy } from './space-proxy'
export { createHttpTransport, onCallBack } from './transport'
export type { TransportConfig, TransportPort } from './transport'
