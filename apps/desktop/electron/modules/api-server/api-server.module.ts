/**
 * API Server Module - HTTP server for Eidos Desktop
 *
 * This module provides the HTTP server that handles:
 * - Static file serving for the web app
 * - RPC endpoints for data space operations
 * - OAuth authentication flow
 * - File serving from spaces
 * - AI completion endpoints
 * - Extension middleware support
 */

import { Module } from "../../common/di"
import { ApiServerService } from "./api-server.service"

/**
 * API Server Module
 *
 * Provides HTTP server capabilities for the desktop application.
 *
 * Services:
 * - ApiServerService: Main server management (start/stop)
 *
 * Dependencies:
 * - ConfigModule: For configuration access
 * - SyncModule: For credentials management
 * - SpaceManagementModule: For space registry access
 */
@Module({
  providers: [ApiServerService],
  exports: [ApiServerService],
})
export class ApiServerModule {}

// Export services
export { ApiServerService } from "./api-server.service"

// Export port-checker utilities
export {
  isPortInUse,
  getProcessByPort,
  showPortInUseDialog,
  killProcess,
  isProcessRunning,
  formatProcessInfo,
  getKillCommand,
  type PortOccupancyInfo,
} from "./port-checker"

// Re-export from server for convenience
export {
  type PortInUseError,
  type ServerContext,
  type OAuthTokens,
  type UserInfo,
  AUTH_STATE_CHANGED_CHANNEL,
} from "./server"

// Re-export Logger from logger module
export type { Logger } from "../logger/logger.module"
