/**
 * OpenData Module - Open data management and adapter execution
 *
 * This module provides OpenData management capabilities:
 * - OpenDataManager lifecycle management
 * - Adapter loading and execution
 * - Data store management
 * - Raw data storage
 *
 * @example
 * ```typescript
 * import { OpenDataModule, OpenDataService } from "./modules/opendata"
 *
 * // In your module:
 * @Module({
 *   imports: [OpenDataModule],
 * })
 * export class YourModule {}
 *
 * // In your service:
 * @Injectable()
 * export class YourService {
 *   constructor(
 *     @Inject(OpenDataService) private openDataService: OpenDataService
 *   ) {}
 * }
 * ```
 */

export { OpenDataModule } from "./opendata.module"
export { OpenDataService } from "./opendata.service"
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
import { OpenDataService } from "./opendata.service"

/**
 * Get the OpenDataService instance.
 * @deprecated Use DI injection instead: `constructor(@Inject(OpenDataService) private service: OpenDataService) {}`
 */
export function getOpenDataService(): OpenDataService {
  try {
    if (container.isBound(OpenDataService)) {
      return container.get(OpenDataService)
    }
  } catch {
    // DI container not ready
  }
  throw new Error(
    "OpenDataService not available. Ensure OpenDataModule is imported and DI container is bootstrapped."
  )
}
