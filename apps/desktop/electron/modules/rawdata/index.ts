/**
 * RawData Module - Raw data management and adapter execution
 *
 * This module provides RawData management capabilities:
 * - RawDataManager lifecycle management
 * - Adapter loading and execution
 * - Data store management
 * - Raw data storage
 *
 * @example
 * ```typescript
 * import { RawDataModule, RawDataService } from "./modules/rawdata"
 *
 * // In your module:
 * @Module({
 *   imports: [RawDataModule],
 * })
 * export class YourModule {}
 *
 * // In your service:
 * @Injectable()
 * export class YourService {
 *   constructor(
 *     @Inject(RawDataService) private rawDataService: RawDataService
 *   ) {}
 * }
 * ```
 */

export { RawDataModule } from "./rawdata.module"
export { RawDataService } from "./rawdata.service"
export { AdapterLoaderService } from "./adapters/adapter-loader.service"
export { BrowserRunnerService } from "./runner/browser-runner.service"
export {
  BrowserExplorerService,
  type NetworkRequest,
  type NetworkResponse,
  type ExploreOptions,
  type ExploreResult,
} from "./explorer/browser-explorer.service"
export { DataPersisterService } from "./persistence/data-persister.service"
export { DataStoreService } from "./store/datastore.service"

// Backward compatibility helpers
import { container } from "../../common/di"
import { RawDataService } from "./rawdata.service"

/**
 * Get the RawDataService instance.
 * @deprecated Use DI injection instead: `constructor(@Inject(RawDataService) private service: RawDataService) {}`
 */
export function getRawDataService(): RawDataService {
  try {
    if (container.isBound(RawDataService)) {
      return container.get(RawDataService)
    }
  } catch {
    // DI container not ready
  }
  throw new Error(
    "RawDataService not available. Ensure RawDataModule is imported and DI container is bootstrapped."
  )
}
