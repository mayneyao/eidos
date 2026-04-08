import { BucketClient } from "@/packages/sync/bucket"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { CredentialsManager } from "./credentials"
import { getOrSetDataSpace } from "../data-space"
import { getConfigManager } from "./config-manager"
import { getSpaceRegistry } from "./space-registry"

interface SyncCredentials {
  endpoint: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  tokenId: string
  region?: string
}

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

/**
 * Sync Service - Manages sync credentials, providers, and operations
 */
@IpcService("sync")
export class SyncService extends IpcServiceBase {
  /**
   * Set sync credentials for a provider
   */
  async setSyncCredentials(
    credentials: SyncCredentials,
    providerId: string
  ): Promise<void> {
    return CredentialsManager.setSyncCredentials(credentials, providerId)
  }

  /**
   * Get sync credentials for a provider
   */
  async getSyncCredentials(
    providerId: string
  ): Promise<SyncCredentials | null> {
    return CredentialsManager.getSyncCredentials(providerId)
  }

  /**
   * Clear sync credentials for a provider
   */
  async clearSyncCredentials(providerId: string): Promise<void> {
    return CredentialsManager.clearSyncCredentials(providerId)
  }

  /**
   * Check if credentials exist for a provider
   */
  async hasSyncCredentials(providerId: string): Promise<boolean> {
    return CredentialsManager.hasSyncCredentials(providerId)
  }

  /**
   * Get all available sync providers
   */
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

      // Build list of providers with their credential status
      const providers: Array<{
        id: string
        name: string
        endpoint?: string
        bucketName?: string
        hasCredentials: boolean
        isBuiltIn: boolean
      }> = []

      // Check if eidos.space should be shown
      // Only show if user has configured eidos.space credentials
      const hasEidosSpaceCreds =
        await CredentialsManager.hasSyncCredentials("eidos.space")

      if (hasEidosSpaceCreds) {
        // For eidos.space, bucketName comes from credentials, not config
        const credentials =
          await CredentialsManager.getSyncCredentials("eidos.space")
        providers.push({
          id: "eidos.space",
          name: "eidos.space",
          bucketName: credentials?.bucketName,
          hasCredentials: true,
          isBuiltIn: true,
        })
      }

      // Add custom providers from config (bucketName comes from config)
      for (const [id, provider] of Object.entries(syncConfig.providers)) {
        const hasCreds = await CredentialsManager.hasSyncCredentials(id)
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

  /**
   * List remote spaces for a provider
   */
  async listRemoteSpaces(
    providerId: string
  ): Promise<{ success: boolean; spaces?: string[]; error?: string }> {
    try {
      // Get sync credentials for the provider
      const credentials =
        await CredentialsManager.getSyncCredentials(providerId)
      if (!credentials) {
        return { success: false, error: "No credentials found for provider" }
      }

      // Create S3 client with the credentials
      const s3Client = new BucketClient({
        endpoint: credentials.endpoint,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        bucketName: credentials.bucketName,
      })

      // List root folders (remote spaces)
      const spaces = await s3Client.listRootFolders(credentials.bucketName)

      return { success: true, spaces }
    } catch (error) {
      console.error("Failed to list remote spaces:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Test sync connection with provided credentials
   */
  async testSyncConnection(
    config: TestConnectionConfig
  ): Promise<{ success: boolean; message?: string; error?: string }> {
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

  /**
   * Clone a space from remote
   */
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
      })

      // 2. Get or initialize DataSpace with sync enabled
      const dataSpace = await getOrSetDataSpace(space.id, {
        enabled: true,
        remote: remoteUrl,
      })

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
}

// Export singleton instance
export const syncService = new SyncService()
