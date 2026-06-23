/**
 * Sync Service - Manages sync operations
 */

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject } from "../../common/di"
import { CredentialsManager } from "./credentials"
import { getConfigManager } from "../config/config-manager"
import { getSpaceRegistry } from "../space-management/space-management.module"
import { DataSpaceManager } from "../data-space"
import { BucketClient } from "@/packages/sync/bucket"

interface TestConnectionConfig {
  endpoint: string
  bucketName: string
  region?: string
  accessKeyId: string
  secretAccessKey: string
}

interface CloneSpaceParams {
  localPath: string
  remoteUrl: string
  providerId: string
  spaceName?: string
}

@IpcInjectable("sync")
export class SyncService extends IpcServiceBase {
  constructor(
    @Inject(CredentialsManager) private credentials: CredentialsManager,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager
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
    providers?: Array<{
      id: string
      name: string
      endpoint?: string
      bucketName?: string
      hasCredentials: boolean
      isBuiltIn: boolean
    }>
    defaultProvider?: string
    error?: string
  }> {
    try {
      const configManager = getConfigManager()
      const syncConfig = configManager.getSyncConfig()

      const providers: Array<{
        id: string
        name: string
        endpoint?: string
        bucketName?: string
        hasCredentials: boolean
        isBuiltIn: boolean
      }> = []

      const hasEidosSpaceCreds =
        await this.credentials.hasSyncCredentials("eidos.space")

      if (hasEidosSpaceCreds) {
        const credentials =
          await this.credentials.getSyncCredentials("eidos.space")
        providers.push({
          id: "eidos.space",
          name: "eidos.space",
          bucketName: credentials?.bucketName,
          hasCredentials: true,
          isBuiltIn: true,
        })
      }

      for (const [id, provider] of Object.entries(syncConfig.providers)) {
        const hasCreds = await this.credentials.hasSyncCredentials(id)
        providers.push({
          id,
          name: provider.name || id,
          endpoint: provider.endpoint,
          bucketName: provider.bucketName,
          hasCredentials: hasCreds,
          isBuiltIn: false,
        })
      }

      return {
        success: true,
        providers,
        defaultProvider: syncConfig.defaultProvider,
      }
    } catch (error) {
      console.error("Failed to get sync providers:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async testSyncConnection(config: TestConnectionConfig): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    try {
      // Create S3 client with the provided credentials
      const s3Client = new BucketClient({
        endpoint: config.endpoint,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        bucketName: config.bucketName,
      })

      // Try to list root folders to verify connection
      await s3Client.listRootFolders(config.bucketName)

      return {
        success: true,
        message: "Connection successful! Bucket is accessible.",
      }
    } catch (error) {
      console.error("Failed to test sync connection:", error)

      // Provide more user-friendly error messages
      let errorMessage =
        error instanceof Error ? error.message : "Unknown error"

      // Parse common S3 errors
      if (errorMessage.includes("InvalidAccessKeyId")) {
        errorMessage = "Invalid Access Key ID. Please check your credentials."
      } else if (errorMessage.includes("SignatureDoesNotMatch")) {
        errorMessage =
          "Invalid Secret Access Key. Please check your credentials."
      } else if (errorMessage.includes("NoSuchBucket")) {
        errorMessage = `Bucket "${config.bucketName}" does not exist. Please check the bucket name.`
      } else if (
        errorMessage.includes("Forbidden") ||
        errorMessage.includes("403")
      ) {
        errorMessage =
          "Access denied. Please check your permissions or credentials."
      } else if (
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("ECONNREFUSED")
      ) {
        errorMessage =
          "Cannot connect to the endpoint. Please check the endpoint URL."
      }

      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  async listRemoteSpaces(providerId: string): Promise<{
    success: boolean
    spaces?: string[]
    error?: string
  }> {
    try {
      const credentials = await this.credentials.getSyncCredentials(providerId)
      if (!credentials) {
        return {
          success: false,
          error: "No credentials found for this provider",
        }
      }

      const s3Client = new BucketClient({
        endpoint: credentials.endpoint,
        region: credentials.region,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        bucketName: credentials.bucketName,
      })

      const folders = await s3Client.listRootFolders(credentials.bucketName)

      // Strip trailing "/" from folder paths to get space names
      const spaces = folders.map((f) => f.replace(/\/$/, ""))

      return {
        success: true,
        spaces,
      }
    } catch (error) {
      console.error("Failed to list remote spaces:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async cloneSpace(params: CloneSpaceParams): Promise<{
    success: boolean
    space?: any
    message?: string
    error?: string
  }> {
    try {
      const registry = getSpaceRegistry()
      const { localPath, remoteUrl, providerId, spaceName } = params

      // 1. Register the space first
      const space = registry.registerSpace(localPath, {
        customName: spaceName,
        remoteUrl,
        provider: providerId,
      })

      // 2. Get or initialize DataSpace with sync enabled
      const dataSpace = await this.dataSpaceManager.getOrSetDataSpace(
        space.id,
        {
          enabled: true,
          remote: remoteUrl,
          provider: providerId,
          requireRemoteClone: true,
        }
      )

      // 3. Pull data from remote
      try {
        await dataSpace.pull()
      } catch (pullError) {
        console.warn("Initial pull failed (remote may be empty):", pullError)
        // Don't fail clone if pull fails - remote might be new/empty
      }

      return {
        success: true,
        space,
        message: "Space cloned successfully",
      }
    } catch (error) {
      console.error("Failed to clone space:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    return this.credentials.setSecret(key, value)
  }

  async getSecret(key: string): Promise<string | null> {
    return this.credentials.getSecret(key)
  }

  async listSecrets(): Promise<Record<string, string>> {
    return this.credentials.listSecrets()
  }

  async deleteSecret(key: string): Promise<void> {
    return this.credentials.deleteSecret(key)
  }
}
