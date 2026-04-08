/**
 * Data-Space Module - SQLite database operations and sync
 *
 * This module provides DataSpace management capabilities:
 * - DataSpace lifecycle management (init, switch, close)
 * - Process pool for worker processes
 * - IPC handlers for database operations
 * - Relay message operations
 *
 * @example
 * ```typescript
 * import { DataSpaceModule, DataSpaceManager } from "./modules/data-space"
 *
 * // In your module:
 * @Module({
 *   imports: [DataSpaceModule],
 * })
 * export class YourModule {}
 *
 * // In your service:
 * @Injectable()
 * export class YourService {
 *   constructor(
 *     @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager
 *   ) {}
 * }
 * ```
 */

export { DataSpaceModule } from "./data-space.module"
export { DataSpaceManager } from "./data-space-manager.service"
export { DataSpaceProcessPool } from "./data-space-process-pool.service"
export { DataSpaceIpcService } from "./data-space-ipc.service"
export { RelayService } from "./relay.service"

// Re-export worker types for convenience
export type { WorkerInitData, InitMessage } from "./worker/rpc/rpc-types"
export { RpcClient } from "./worker/rpc/rpc-client"

// Backward compatibility helpers
import { container } from "../../common/di"
import { DataSpaceManager } from "./data-space-manager.service"

/**
 * Get the DataSpaceManager instance.
 * Uses DI container if available, otherwise creates a standalone instance.
 * @deprecated Use DI injection instead: `constructor(@Inject(DataSpaceManager) private manager: DataSpaceManager) {}`
 */
export function getDataSpaceManager(): DataSpaceManager {
  try {
    if (container.isBound(DataSpaceManager)) {
      return container.get(DataSpaceManager)
    }
  } catch {
    // DI container not ready
  }
  throw new Error(
    "DataSpaceManager not available. Ensure DataSpaceModule is imported and DI container is bootstrapped."
  )
}

/**
 * Get the current DataSpace instance.
 * @deprecated Use DataSpaceManager.getDataSpace() via DI injection instead
 */
export function getDataSpace() {
  return getDataSpaceManager().getDataSpace()
}

/**
 * Get the current space ID.
 * @deprecated Use DataSpaceManager.getCurrentSpaceId() via DI injection instead
 */
export function getCurrentSpaceId() {
  return getDataSpaceManager().getCurrentSpaceId()
}

/**
 * Get or initialize a DataSpace for a space.
 * @deprecated Use DataSpaceManager.getOrSetDataSpace() via DI injection instead
 */
export function getOrSetDataSpace(
  spaceId: string,
  syncOptions?: { enabled: boolean; remote?: string }
) {
  return getDataSpaceManager().getOrSetDataSpace(spaceId, syncOptions)
}

/**
 * Reload the current DataSpace.
 * @deprecated Use DataSpaceManager.reload() via DI injection instead
 */
export function reloadDataSpace() {
  return getDataSpaceManager().reload()
}

/**
 * Close the current DataSpace.
 * @deprecated Use DataSpaceManager.close() via DI injection instead
 */
export function closeDataSpace() {
  return getDataSpaceManager().close()
}
