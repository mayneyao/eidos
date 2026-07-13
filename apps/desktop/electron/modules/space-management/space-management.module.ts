/**
 * Space Management Module - Space CRUD and switching operations
 *
 * Note: This is for space management (list, switch, register).
 * For data-space database operations, see the (future) SpaceModule.
 */

import { Module, container } from "../../common/di"
import { SpaceManagementService } from "./space-management.service"
import { SpaceRegistry } from "./space-registry"
import { MainWindowProvider } from "./main-window.provider"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"
import { BaseCsvWorkerRunner } from "./base-csv-worker-runner"
import { BaseQueryWorkerRunner } from "./base-query-worker-runner"

/**
 * Space Management Module
 *
 * Provides space management capabilities:
 * - List, register, remove, update spaces
 * - Switch between spaces
 * - Toggle sync for spaces
 *
 * Dependencies:
 * - MainWindowProvider requires setWindowProvider() to be called
 */
@Module({
  providers: [
    SpaceManagementService,
    SpaceRegistry,
    MainWindowProvider,
    SpaceResourceLifecycle,
    BaseCsvWorkerRunner,
    BaseQueryWorkerRunner,
  ],
  exports: [
    SpaceManagementService,
    SpaceRegistry,
    MainWindowProvider,
    SpaceResourceLifecycle,
    BaseCsvWorkerRunner,
    BaseQueryWorkerRunner,
  ],
})
export class SpaceManagementModule {}

export { SpaceManagementService } from "./space-management.service"
export {
  SpaceRegistry,
  type SpaceInfo,
  type SpacesConfig,
  type GlobalConfig,
} from "./space-registry"
export { MainWindowProvider } from "./main-window.provider"
export { SpaceResourceLifecycle } from "./space-resource-lifecycle"
export { resolveStartupSpace } from "./space-registry"

// Backward compatibility helper
let spaceRegistryInstance: SpaceRegistry | null = null

/**
 * Get the SpaceRegistry instance.
 * If DI container is initialized and has SpaceRegistry bound, returns the DI instance.
 * Otherwise, falls back to a singleton instance for backward compatibility.
 */
export function getSpaceRegistry(): SpaceRegistry {
  // Try to get from DI container first (preferred)
  try {
    if (container.isBound(SpaceRegistry)) {
      return container.get(SpaceRegistry)
    }
  } catch {
    // DI container not ready, fall back to singleton
  }

  // Fallback: create singleton instance
  if (!spaceRegistryInstance) {
    spaceRegistryInstance = new SpaceRegistry()
  }
  return spaceRegistryInstance
}
