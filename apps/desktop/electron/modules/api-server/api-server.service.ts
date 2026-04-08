/**
 * API Server Service - HTTP server for Eidos Desktop
 */

import { Injectable, Inject } from "../../common/di"
import { dialog } from "electron"
import { BrowserWindow } from "electron"
import {
  startServer,
  type PortInUseError,
  type ServerContext,
  type OAuthTokens,
  type UserInfo,
  type PortOccupancyInfo,
  AUTH_STATE_CHANGED_CHANNEL,
} from "./server"
import { ConfigManager } from "../config/config.module"
import { CredentialsManager } from "../sync/sync.module"
import { SpaceRegistry } from "../space-management/space-management.module"
import { LoggerService } from "../logger/logger.module"
import {
  getOrSetDataSpace,
  getDataSpace,
} from "../../services/data-space/data-space-manager"
import { isPortInUse, getProcessByPort } from "./port-checker"

export { PortInUseError, PortOccupancyInfo, AUTH_STATE_CHANGED_CHANNEL }

/**
 * API Server Service
 *
 * Manages the lifecycle of the HTTP server.
 */
@Injectable()
export class ApiServerService {
  private isRunning = false
  private currentPort: number | null = null

  constructor(
    @Inject(ConfigManager) private configManager: ConfigManager,
    @Inject(CredentialsManager) private credentialsManager: CredentialsManager,
    @Inject(SpaceRegistry) private spaceRegistry: SpaceRegistry,
    @Inject(LoggerService) private logger: LoggerService
  ) {
    this.logger.setPrefix("ApiServer")
  }

  /**
   * Start the API server with retry logic for port conflicts
   */
  async startServer(
    dist: string,
    port: number,
    options?: {
      onPortConflict?: (error: PortInUseError) => Promise<{
        action: "retry" | "exit"
        killed: boolean
      }>
    }
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error(`Server is already running on port ${this.currentPort}`)
    }

    while (true) {
      try {
        await this.doStartServer(dist, port)
        this.isRunning = true
        this.currentPort = port
        this.logger.info(`Server started successfully on port ${port}`)
        return
      } catch (error) {
        const portError = error as PortInUseError
        if (portError.port && portError.port === port) {
          this.logger.error(`Port ${port} is in use:`, error)

          if (options?.onPortConflict) {
            const result = await options.onPortConflict(portError)
            if (result.action === "exit") {
              this.logger.info("Exiting due to port conflict")
              throw error
            }
            await new Promise((resolve) => setTimeout(resolve, 1000))
          } else {
            throw error
          }
        } else {
          this.logger.error("Failed to start server:", error)
          await dialog.showErrorBox(
            "Server Error",
            `Failed to start Eidos server: ${error instanceof Error ? error.message : String(error)}`
          )
          throw error
        }
      }
    }
  }

  /**
   * Internal method to start the server
   */
  private async doStartServer(dist: string, port: number): Promise<void> {
    const ctx = this.buildServerContext()
    await startServer({ dist, port }, ctx)
  }

  /**
   * Build server context
   */
  private buildServerContext(): ServerContext {
    const broadcastAuthStateChange = (
      authenticated: boolean,
      user?: UserInfo | null
    ) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send(AUTH_STATE_CHANGED_CHANNEL, {
          authenticated,
          user,
        })
      })
    }

    return {
      dataSpaceManager: { getOrSetDataSpace, getDataSpace },
      configManager: {
        get: (key: string) => this.configManager.get(key as any),
        set: (key: string, value: any) =>
          this.configManager.set(key as any, value),
        getDefaultSyncProvider: () =>
          this.configManager.getDefaultSyncProvider(),
        getSyncProvider: (id: string) => this.configManager.getSyncProvider(id),
        on: (event: string, callback: Function) =>
          this.configManager.on(event as any, callback as any),
      },
      spaceRegistry: {
        getSpace: (id: string) => this.spaceRegistry.getSpace(id),
        getAllSpaces: () => this.spaceRegistry.getAllSpaces(),
        validateSpace: (id: string) => this.spaceRegistry.validateSpace(id),
      },
      portChecker: {
        isPortInUse: (port: number) => isPortInUse(port),
        getProcessByPort: (port: number) => getProcessByPort(port),
      },
      credentialsManager: {
        getSyncCredentials: (providerId: string) =>
          this.credentialsManager.getSyncCredentials(providerId),
        getTokens: () => this.credentialsManager.getTokens(),
        setTokens: (tokens: OAuthTokens) =>
          this.credentialsManager.setTokens(tokens),
        getUserInfo: () => this.credentialsManager.getUserInfo(),
        setUserInfo: (userInfo: UserInfo) =>
          this.credentialsManager.setUserInfo(userInfo),
        isAuthenticated: () => this.credentialsManager.isAuthenticated(),
        clearAll: () => this.credentialsManager.clearAll(),
        getAccessToken: () => this.credentialsManager.getAccessToken(),
      },
      broadcastAuthStateChange,
      logger: this.logger,
    }
  }

  /**
   * Check if the server is currently running
   */
  isServerRunning(): boolean {
    return this.isRunning
  }

  /**
   * Get the current port if server is running
   */
  getCurrentPort(): number | null {
    return this.currentPort
  }
}
