/**
 * License Module - License management and activation
 */

import { Module } from "../../common/di"
import { LicenseService } from "./license.service"
import { LicenseManager } from "./license-manager"

/**
 * License Module
 *
 * Provides license activation, validation, and management.
 * No external dependencies - completely self-contained.
 */
@Module({
  providers: [LicenseService, LicenseManager],
  exports: [LicenseService, LicenseManager],
})
export class LicenseModule {}

// Re-exports
export { LicenseService } from "./license.service"
export {
  LicenseManager,
  type LicensePayload,
  type StoredLicense,
} from "./license-manager"
