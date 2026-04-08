/**
 * Sync Service - Manages sync operations
 * Simplified version for DI demo
 */

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../../common/di"
import { CredentialsManager } from "./credentials"

interface TestConnectionConfig {
  endpoint: string
  bucketName: string
  region?: string
  accessKeyId: string
  secretAccessKey: string
}

@IpcInjectable("sync")
export class SyncService extends IpcServiceBase {
  constructor(
    @Inject(CredentialsManager) private credentials: CredentialsManager
  ) {
    super()
  }

  async setSyncCredentials(
    credentials: any,
    providerId: string
  ): Promise<void> {
    return this.credentials.setSyncCredentials(credentials, providerId)
  }

  async getSyncCredentials(providerId: string): Promise<any | null> {
    return this.credentials.getSyncCredentials(providerId)
  }

  async clearSyncCredentials(providerId: string): Promise<void> {
    return this.credentials.clearSyncCredentials(providerId)
  }

  async hasSyncCredentials(providerId: string): Promise<boolean> {
    return this.credentials.hasSyncCredentials(providerId)
  }

  async getSyncProviders(): Promise<{
    success: boolean
    providers?: any[]
    error?: string
  }> {
    return {
      success: true,
      providers: [],
    }
  }

  async testSyncConnection(config: TestConnectionConfig): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    try {
      // Simplified - just return success for demo
      return {
        success: true,
        message: "Connection test passed (demo mode)",
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async listRemoteSpaces(providerId: string): Promise<{
    success: boolean
    spaces?: string[]
    error?: string
  }> {
    return {
      success: true,
      spaces: [],
    }
  }

  async cloneSpace(params: {
    localPath: string
    remoteUrl: string
    providerId: string
    spaceName?: string
  }): Promise<any> {
    return {
      success: true,
      message: "Clone started (demo mode)",
    }
  }
}
