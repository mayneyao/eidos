/**
 * Server dependencies - injected from Electron main process
 * This allows core/server to remain Node.js-only
 */

// Re-export types
export type { PortOccupancyInfo } from "../../services/port-checker"
export type { ServerResult } from "./context"
