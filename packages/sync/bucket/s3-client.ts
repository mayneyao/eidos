import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"

export interface BucketConfig {
  endpoint: string
  region?: string
  accessKeyId: string
  secretAccessKey: string
  bucketName?: string
}

export class BucketClient {
  private client: S3Client

  constructor(config: BucketConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // For R2/S3 compatible services
      forcePathStyle: true,
    })
  }

  /**
   * List sub-folders of a specified folder (prefix).
   * @param bucket The bucket name
   * @param prefix The parent folder path (e.g., "a/b/")
   * @returns List of sub-folder paths (e.g., ["a/b/c/", "a/b/d/"])
   */
  async listSubFolders(bucket: string, prefix: string): Promise<string[]> {
    // Ensure prefix ends with '/' if it's not empty
    let adjustedPrefix = prefix
    if (adjustedPrefix && !adjustedPrefix.endsWith("/")) {
      adjustedPrefix += "/"
    }

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: adjustedPrefix,
      Delimiter: "/",
    })

    try {
      const response = await this.client.send(command)

      // CommonPrefixes contains the folders when Delimiter is used
      return (response.CommonPrefixes || [])
        .map((p) => p.Prefix)
        .filter((p): p is string => !!p)
    } catch (error) {
      console.error("Failed to list sub-folders:", error)
      throw error
    }
  }
}
