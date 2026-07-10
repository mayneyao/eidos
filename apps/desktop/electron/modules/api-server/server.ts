/**
 * API Server - HTTP server implementation for Eidos Desktop
 *
 * This module provides the HTTP server using Hono framework.
 * It handles static files, RPC calls, OAuth, and extension middleware.
 */

import { serve } from "@hono/node-server"
import { Hono } from "hono"
import type { Logger } from "../logger/logger.module"

// Import routes
import { setupOAuthRoutes } from "./routes/oauth"
import { setupApiRoutes } from "./routes/api"
import { setupFileRoutes } from "./routes/files"
import { setupExplorerRoutes } from "./routes/explorer"

// Import middleware
import { createCorsMiddleware } from "./middleware/cors"
import { createBucketBrowser } from "./middleware/bucket-browser"
import { createProxy } from "./middleware/proxy"
import { createExtension } from "./middleware/extension"
import { createStaticFiles, createSpaFallback } from "./middleware/static"

// Import utils
import { extractSpaceIdFromRequest } from "./utils/extract-space"
import { API_SERVER_HOST, createApiServerListenOptions } from "./server-config"

// Re-export types and functions for backward compatibility
export * from "./routes/oauth"
export * from "./routes/api"
export * from "./routes/files"
export {
  extractSpaceIdFromRequest,
  extractSpaceIdFromHostname,
} from "./utils/extract-space"
export { CORS_CONFIG, isAllowedOrigin, getAllowOrigin } from "./middleware/cors"

// Re-export types
export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  id_token?: string
}

export interface UserInfo {
  id: string
  email?: string
  name?: string
  picture?: string
  [key: string]: any
}

export interface PortOccupancyInfo {
  port: number
  pid?: number
  processName?: string
  processPath?: string
}

export interface PortInUseError extends Error {
  port: number
  processInfo?: PortOccupancyInfo | null
}

// Port checker interface
export interface PortChecker {
  isPortInUse(port: number): Promise<boolean>
  getProcessByPort(port: number): Promise<PortOccupancyInfo | null>
}

// Server context interface (passed during server start)
export interface ServerContext {
  dataSpaceManager: {
    getOrSetDataSpace(spaceId: string): Promise<any | null>
    getDataSpace(): any | null
  }
  configManager: {
    get(key: string): any
    set(key: string, value: any): void
    getDefaultSyncProvider(): string | undefined
    getSyncProvider(id: string): { region?: string } | undefined
    on(event: string, callback: Function): void
  }
  spaceRegistry: {
    getSpace(spaceId: string): any | undefined | null
    getAllSpaces(): any[]
    validateSpace(spaceId: string): boolean
  }
  portChecker: PortChecker
  credentialsManager: {
    getSyncCredentials(providerId: string): Promise<any | null>
    getTokens(): Promise<OAuthTokens | null>
    setTokens(tokens: OAuthTokens): Promise<void>
    getUserInfo(): Promise<UserInfo | null>
    setUserInfo(userInfo: UserInfo): Promise<void>
    isAuthenticated(): Promise<boolean>
    clearAll(): Promise<void>
    getAccessToken(): Promise<string | null>
  }
  broadcastAuthStateChange: (
    authenticated: boolean,
    user?: UserInfo | null
  ) => void
  logger: Logger
  // Browser explorer service for adapter generation
  browserExplorer?: any
  windowService?: any
}

// Channel name for auth state changes
export const AUTH_STATE_CHANGED_CHANNEL = "auth-state-changed"
export { API_SERVER_HOST }

/**
 * Create and configure the Hono app with all middleware and routes
 */
function createApp(dist: string, port: number, ctx: ServerContext): Hono {
  const app = new Hono()

  // CORS middleware with security headers
  app.use("*", createCorsMiddleware())

  // Bucket browser middleware
  app.use("*", createBucketBrowser(ctx))

  // Proxy middleware
  app.use("*", createProxy())

  // Extension middleware
  app.use("*", createExtension(ctx, dist, port, ctx.logger))

  // Static files
  app.use("/*", createStaticFiles(dist))
  ctx.logger.info("static files served from", dist)

  // OAuth routes
  setupOAuthRoutes(app, ctx)

  // API routes
  setupApiRoutes(app, ctx)

  // File serving routes
  setupFileRoutes(app, ctx)

  // Browser explorer routes
  if (ctx.browserExplorer && ctx.windowService) {
    setupExplorerRoutes(app, ctx, ctx.browserExplorer, ctx.windowService)
  }

  // Fallback to index.html
  app.use("*", createSpaFallback(dist))

  return app
}

/**
 * Start the HTTP server
 */
export async function startServer(
  {
    dist,
    port,
  }: {
    dist: string
    port: number
  },
  ctx: ServerContext
): Promise<void> {
  // Check if port is already in use
  const portOccupied = await ctx.portChecker.isPortInUse(port)
  if (portOccupied) {
    const processInfo = await ctx.portChecker.getProcessByPort(port)
    const error = new Error(`Port ${port} is already in use`) as PortInUseError
    error.port = port
    error.processInfo = processInfo
    throw error
  }

  const app = createApp(dist, port, ctx)

  serve(createApiServerListenOptions(port, app.fetch), (info) => {
    ctx.logger.info(`Server is running on ${info.address}:${info.port}`)
  })
}
