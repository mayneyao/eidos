/**
 * Example Service - Demonstrates DI usage
 *
 * This service shows how to:
 * 1. Inject dependencies from other modules
 * 2. Use IPC exposure for renderer communication
 * 3. Combine multiple services
 */

import { IpcServiceBase, IpcMethod } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../../common/di"
import { ConfigService } from "../config/config.module"
import { FileSystemService } from "../file-system/file-system.module"

/**
 * Example Service - A demonstration service
 *
 * IPC Channels:
 * - example:getAppInfo: Returns app configuration info
 * - example:openConfigFolder: Opens the config folder in file manager
 * - example:echo: Echoes back the provided message
 */
@IpcInjectable("example", { exposeMode: "decorated" })
export class ExampleService extends IpcServiceBase {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(FileSystemService) private fileSystemService: FileSystemService
  ) {
    super()
    console.log("[ExampleService] Initialized with DI!")
  }

  /**
   * Get application information
   * IPC: example:getAppInfo
   */
  @IpcMethod()
  async getAppInfo(): Promise<{
    dataFolder: string | undefined
    configPath: string
    platform: string
    version: string
  }> {
    const dataFolder = this.configService.getAppDataFolder()
    const configPath = this.configService.getUserConfigPath()

    return {
      dataFolder,
      configPath,
      platform: process.platform,
      version: process.env.npm_package_version || "0.0.0",
    }
  }

  /**
   * Open configuration folder
   * IPC: example:openConfigFolder
   */
  @IpcMethod()
  async openConfigFolder(): Promise<{ success: boolean; error?: string }> {
    const configPath = this.configService.getUserConfigPath()
    // Get the directory containing the config file
    const path = await import("path")
    const configDir = path.dirname(configPath)

    return this.fileSystemService.showInFileManager(configDir)
  }

  /**
   * Echo a message (for testing)
   * IPC: example:echo
   */
  @IpcMethod()
  async echo(
    message: string
  ): Promise<{ received: string; timestamp: number }> {
    console.log(`[ExampleService] Echo received: ${message}`)
    return {
      received: message,
      timestamp: Date.now(),
    }
  }

  /**
   * Get AI configuration
   * IPC: example:getAIConfig
   */
  @IpcMethod()
  async getAIConfig(): Promise<any> {
    return this.configService.getAiConfig()
  }
}
