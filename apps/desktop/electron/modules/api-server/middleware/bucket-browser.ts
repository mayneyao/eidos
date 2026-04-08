import { createBucketBrowserMiddleware } from "@eidos.space/sync"
import type { ServerContext } from "../server"

/**
 * Create bucket browser middleware for S3-compatible storage browsing
 */
export function createBucketBrowser(ctx: ServerContext) {
  return createBucketBrowserMiddleware({
    getCredentials: async () => {
      const defaultProviderId = ctx.configManager.getDefaultSyncProvider()
      if (!defaultProviderId) return null

      const credentials =
        await ctx.credentialsManager.getSyncCredentials(defaultProviderId)
      const providerConfig =
        ctx.configManager.getSyncProvider(defaultProviderId)

      if (!credentials || !providerConfig) return null

      return {
        endpoint: credentials.endpoint,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        bucketName: credentials.bucketName,
        region: providerConfig.region || "auto",
      }
    },
  })
}
