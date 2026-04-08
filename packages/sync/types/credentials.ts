/**
 * Sync credentials for S3-compatible storage providers
 * Used for Graft sync and file synchronization
 */
export interface SyncCredentials {
  endpoint: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  tokenId: string
  region?: string
}
