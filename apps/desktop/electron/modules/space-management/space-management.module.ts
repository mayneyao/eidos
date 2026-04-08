/**
 * Space Management Module - Space CRUD and switching operations
 *
 * Note: This is for space management (list, switch, register).
 * For data-space database operations, see the (future) SpaceModule.
 */

import { Module } from "../../common/di"
import { SpaceManagementService } from "./space-management.service"
import { SpaceRegistry } from "./space-registry"
import { MainWindowProvider } from "./main-window.provider"

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
  providers: [SpaceManagementService, SpaceRegistry, MainWindowProvider],
  exports: [SpaceManagementService, SpaceRegistry, MainWindowProvider],
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
export { resolveStartupSpace } from "./space-registry"

// Backward compatibility helper
let spaceRegistryInstance: SpaceRegistry | null = null
export function getSpaceRegistry(): SpaceRegistry {
  if (!spaceRegistryInstance) {
    spaceRegistryInstance = new SpaceRegistry()
  }
  return spaceRegistryInstance
}
