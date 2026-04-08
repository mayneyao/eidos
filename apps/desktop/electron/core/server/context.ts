/**
 * Server Context - Dependency Injection Container
 *
 * This module provides a context object that holds all dependencies
 * for the HTTP server. This allows core/server to be tested and
 * potentially run outside of Electron.
 *
 * Usage:
 *   import { setServerContext, getServerContext } from "./context"
 *
 *   // In main.ts:
 *   setServerContext({
 *     dataSpaceManager: {...},
 *     configManager: {...},
 *     ...
 *   })
 *
 *   // In server.ts:
 *   const ctx = getServerContext()
 */

import type { DataSpace } from "@/packages/core/data-space"
import type { SpaceInfo } from "@eidos.space/space-manager"

// Re-export types from packages
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

// Type definitions for dependencies
export interface DataSpaceManager {
  getOrSetDataSpace(spaceId: string): Promise<DataSpace | null>
  getDataSpace(): DataSpace | null
}

export interface ConfigChangedEvent {
  key: string
  oldValue: any
  newValue: any
}

export interface ConfigManager {
  get<K extends string>(key: K): any
  set<K extends string>(key: K, value: any): void
  getDefaultSyncProvider(): string | undefined
  getSyncProvider(id: string): { region?: string } | undefined
  on(
    event: "configChanged",
    callback: (event: ConfigChangedEvent) => void
  ): void
}

export interface SpaceRegistry {
  getSpace(spaceId: string): SpaceInfo | undefined | null
  getAllSpaces(): SpaceInfo[]
  validateSpace(spaceId: string): boolean
}

export interface PortChecker {
  isPortInUse(port: number): Promise<boolean>
  getProcessByPort(port: number): Promise<PortOccupancyInfo | null>
}

// Re-export from services to ensure consistency
export type { PortOccupancyInfo } from "../../services/port-checker"

export interface ServerResult {
  port: number
  stop: () => Promise<void>
}

export interface SyncCredentials {
  endpoint: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  tokenId: string
  region?: string
}

export interface CredentialsManager {
  getSyncCredentials(providerId: string): Promise<SyncCredentials | null>
  getTokens(): Promise<OAuthTokens | null>
  setTokens(tokens: OAuthTokens): Promise<void>
  getUserInfo(): Promise<UserInfo | null>
  setUserInfo(userInfo: UserInfo): Promise<void>
  isAuthenticated(): Promise<boolean>
  clearAll(): Promise<void>
  getAccessToken(): Promise<string | null>
}

export interface BroadcastAuthStateChange {
  (
    authenticated: boolean,
    user?: {
      id: string
      email?: string
      name?: string
      picture?: string
    } | null
  ): void
}

// Server context interface
export interface ServerContext {
  dataSpaceManager: DataSpaceManager
  configManager: ConfigManager
  spaceRegistry: SpaceRegistry
  portChecker: PortChecker
  credentialsManager: CredentialsManager
  broadcastAuthStateChange: BroadcastAuthStateChange
}

// Global context instance
let serverContext: ServerContext | null = null

export function setServerContext(ctx: ServerContext): void {
  serverContext = ctx
}

export function getServerContext(): ServerContext {
  if (!serverContext) {
    throw new Error(
      "Server context not initialized. Call setServerContext() before starting the server."
    )
  }
  return serverContext
}

export function clearServerContext(): void {
  serverContext = null
}
