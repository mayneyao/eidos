/**
 * Node API - DataSpace extension
 *
 * This module extends DataSpace with the Node SDK client.
 * The actual implementation is in packages/core/sdk/node.ts
 */

import { NodeClient } from "../sdk/node"
import { DataSpaceWithDoc } from "./doc"

// Re-export NodeClient and types from SDK
export { NodeClient } from "../sdk/node"
export type {
  NodeApiOptions,
  TableSchema,
  DeleteOptions,
  FindQuery,
} from "../sdk/node"

/**
 * Extension class to add Node API to DataSpace
 * Inherits from DataSpaceWithDoc to add node operations
 */
export class DataSpaceWithNode extends DataSpaceWithDoc {
  private _nodeClient?: NodeClient

  /**
   * Node API - unified interface for node operations
   *
   * @example
   * ```typescript
   * // Get node by path
   * const node = await dataSpace.node.get("projects/roadmap")
   *
   * // Create document
   * await dataSpace.node.create("notes/idea", "doc")
   *
   * // Move node
   * await dataSpace.node.move("a", "b")
   * ```
   */
  get node(): NodeClient {
    if (!this._nodeClient) {
      this._nodeClient = new NodeClient(this as any)
    }
    return this._nodeClient
  }
}
