/**
 * Mobile File Synchronizer
 * Adapted from packages/sync/file-sync/synchronizer.ts for React Native
 *
 * Key differences from desktop:
 * - Uses expo-file-system instead of Node.js fs
 * - No chokidar - manual polling or React Native file watchers
 * - Only monitors .eidos/files/_capture directory (not entire files dir)
 * - Simpler conflict resolution (last write wins)
 */

// Polyfills for React Native - must be imported before AWS SDK
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import * as FileSystem from "expo-file-system/legacy"

import "react-native-get-random-values"
import "react-native-url-polyfill/auto"

export interface MobileSyncConfig {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  region: string
  prefix?: string // e.g., "user-id/capture/"
}

export interface SyncStats {
  uploaded: number
  downloaded: number
  deleted: number
  errors: number
  lastSyncTime: number
}

export interface FileInfo {
  name: string
  path: string
  exists: boolean
  size?: number
  mtime?: number
}

export class MobileFileSynchronizer {
  private client: S3Client | null = null
  private config: MobileSyncConfig | null = null
  private captureDir: string = ""
  private isSyncing = false
  private syncInterval: ReturnType<typeof setInterval> | null = null

  // Simplified properties for lazy sync
  private isInitializedFlag: boolean = false

  async initialize(config: MobileSyncConfig): Promise<void> {
    this.config = config

    // Initialize S3 client with React Native compatibility settings
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Disable checksum validation for React Native compatibility
      // ChecksumStream doesn't support Blob/Uint8Array in React Native
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })

    // Set capture directory
    this.captureDir = `${FileSystem.documentDirectory}.eidos/files/_capture/`

    // Ensure capture directory exists
    await this.ensureCaptureDir()

    this.isInitializedFlag = true
    console.log("Mobile file synchronizer initialized (lazy mode)")
  }

  /**
   * Start automatic sync with interval (in milliseconds)
   */
  startAutoSync(intervalMs: number = 60000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    // Do initial sync
    this.sync().catch(console.error)

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.sync().catch(console.error)
    }, intervalMs)

    console.log(`Auto-sync started with ${intervalMs}ms interval`)
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
      console.log("Auto-sync stopped")
    }
  }

  /**
   * Check if synchronizer is properly initialized
   */
  isInitialized(): boolean {
    return this.isInitializedFlag
  }

  /**
   * Check if a file exists locally
   */
  async fileExistsLocally(fileName: string): Promise<boolean> {
    if (!this.captureDir) {
      return false
    }

    try {
      const filePath = `${this.captureDir}${fileName}`
      const info = await FileSystem.getInfoAsync(filePath)
      return info.exists && !info.isDirectory
    } catch (error) {
      console.error(`Error checking if file exists locally: ${fileName}`, error)
      return false
    }
  }

  /**
   * Get local file info
   */
  async getLocalFileInfo(fileName: string): Promise<FileInfo | null> {
    if (!this.captureDir) {
      return null
    }

    try {
      const filePath = `${this.captureDir}${fileName}`
      const info = await FileSystem.getInfoAsync(filePath)

      if (info.exists && !info.isDirectory) {
        return {
          name: fileName,
          path: filePath,
          exists: true,
          size: info.size,
          mtime: info.modificationTime,
        }
      }

      return {
        name: fileName,
        path: filePath,
        exists: false,
      }
    } catch (error) {
      console.error(`Error getting local file info: ${fileName}`, error)
      return null
    }
  }

  /**
   * Ensure capture directory exists
   */
  private async ensureCaptureDir(): Promise<void> {
    if (!this.captureDir) {
      throw new Error("Capture directory not set")
    }

    try {
      const dirInfo = await FileSystem.getInfoAsync(this.captureDir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.captureDir, {
          intermediates: true,
        })
        console.log(`✓ Created capture directory: ${this.captureDir}`)
      }
    } catch (error) {
      console.error("Failed to create capture directory:", error)
      throw error
    }
  }

  async sync(): Promise<SyncStats> {
    if (this.isSyncing) {
      console.log("Sync already in progress, skipping")
      return {
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        errors: 0,
        lastSyncTime: Date.now(),
      }
    }

    if (!this.client || !this.config) {
      throw new Error("Synchronizer not initialized")
    }

    this.isSyncing = true
    const stats: SyncStats = {
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      errors: 0,
      lastSyncTime: Date.now(),
    }

    try {
      console.log("Starting file sync...")

      // Ensure capture directory exists
      const dirInfo = await FileSystem.getInfoAsync(this.captureDir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.captureDir, {
          intermediates: true,
        })
      }

      // Scan local files
      const localFiles = await this.scanLocalFiles()
      console.log(`Found ${localFiles.size} local files`)

      // Scan remote files
      const remoteFiles = await this.scanRemoteFiles()
      console.log(`Found ${remoteFiles.size} remote files`)

      // Determine which files need sync
      const allKeys = new Set([...localFiles.keys(), ...remoteFiles.keys()])

      for (const key of allKeys) {
        try {
          const local = localFiles.get(key)
          const remote = remoteFiles.get(key)

          if (local && !remote) {
            // Upload new file
            await this.uploadFile(key, local.path)
            stats.uploaded++
          } else if (!local && remote) {
            // Download new file
            await this.downloadFile(key)
            stats.downloaded++
          } else if (local && remote) {
            // Both exist - check which is newer
            const timeDiff = local.mtime - remote.mtime
            const sizeDiff = local.size !== remote.size

            // Sync if time difference > 2 seconds or size is different
            if (Math.abs(timeDiff) > 2000 || sizeDiff) {
              if (timeDiff > 0) {
                // Local is newer - upload
                await this.uploadFile(key, local.path)
                stats.uploaded++
              } else {
                // Remote is newer - download
                await this.downloadFile(key)
                stats.downloaded++
              }
            }
          }
        } catch (error) {
          console.error(`Error syncing file ${key}:`, error)
          stats.errors++
        }
      }

      console.log("File sync completed:", stats)
      return stats
    } catch (error) {
      console.error("File sync failed:", error)
      stats.errors++
      return stats
    } finally {
      this.isSyncing = false
    }
  }

  private async scanLocalFiles(): Promise<Map<string, FileInfo>> {
    const files = new Map<string, FileInfo>()

    try {
      const fileList = await FileSystem.readDirectoryAsync(this.captureDir)

      for (const fileName of fileList) {
        const filePath = `${this.captureDir}${fileName}`
        const info = await FileSystem.getInfoAsync(filePath)

        if (info.exists && !info.isDirectory) {
          files.set(fileName, {
            size: info.size || 0,
            mtime: info.modificationTime || 0,
            path: filePath,
          })
        }
      }
    } catch (error) {
      console.error("Error scanning local files:", error)
    }

    return files
  }

  private async scanRemoteFiles(): Promise<Map<string, FileInfo>> {
    if (!this.client || !this.config) {
      throw new Error("Synchronizer not initialized")
    }

    const files = new Map<string, FileInfo>()
    const prefix = this.config.prefix || ""

    try {
      let token: string | undefined

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: prefix,
          ContinuationToken: token,
        })

        const response = await this.client.send(command)

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (!obj.Key) continue

            // Extract file name (remove prefix)
            let fileName = obj.Key
            if (prefix && fileName.startsWith(prefix)) {
              fileName = fileName.slice(prefix.length)
            }
            if (fileName.startsWith("/")) {
              fileName = fileName.slice(1)
            }
            if (!fileName) continue

            files.set(fileName, {
              size: obj.Size || 0,
              mtime: obj.LastModified?.getTime() || 0,
              path: obj.Key,
            })
          }
        }

        token = response.NextContinuationToken
      } while (token)
    } catch (error) {
      console.error("Error scanning remote files:", error)
    }

    return files
  }

  private async uploadFile(fileName: string, localPath: string): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error("Synchronizer not initialized")
    }

    try {
      const prefix = this.config.prefix || ""
      const key = prefix ? `${prefix}${fileName}` : fileName

      // Read file as base64 for React Native
      const fileContent = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      })

      // Convert base64 string to Uint8Array for upload
      const binaryString = atob(fileContent)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucketName,
          Key: key,
          Body: bytes,
          // Disable checksum for React Native compatibility
          ChecksumAlgorithm: undefined,
        },
        // Additional options for React Native
        queueSize: 1, // Process uploads sequentially
        partSize: 1024 * 1024 * 5, // 5MB parts
      })

      await upload.done()
      console.log(`Uploaded: ${fileName}`)
    } catch (error) {
      console.error(`Failed to upload ${fileName}:`, error)
      throw error
    }
  }

  private async downloadFile(fileName: string): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error("Synchronizer not initialized")
    }

    try {
      const prefix = this.config.prefix || ""
      const key = prefix ? `${prefix}${fileName}` : fileName
      const localPath = `${this.captureDir}${fileName}`

      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      })

      const response = await this.client.send(command)

      if (response.Body) {
        // In React Native, response.Body is a Blob or Uint8Array-like object
        // We need to convert it to bytes in a React Native-compatible way
        let buffer: Uint8Array

        // Check if Body is already a Uint8Array
        if (response.Body instanceof Uint8Array) {
          buffer = response.Body
        } else {
          // For other types (Blob, ReadableStream), use transformToByteArray
          // This is the React Native-compatible way to handle AWS SDK responses
          buffer = await response.Body.transformToByteArray()
        }

        // Convert Uint8Array to base64 string without using Buffer
        let binary = ""
        for (let i = 0; i < buffer.length; i++) {
          binary += String.fromCharCode(buffer[i])
        }
        const base64 = btoa(binary)

        await FileSystem.writeAsStringAsync(localPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        })

        console.log(`Downloaded: ${fileName}`)
      }
    } catch (error) {
      console.error(`Failed to download ${fileName}:`, error)
      throw error
    }
  }

  async deleteRemoteFile(fileName: string): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error("Synchronizer not initialized")
    }

    try {
      const prefix = this.config.prefix || ""
      const key = prefix ? `${prefix}${fileName}` : fileName

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      })

      await this.client.send(command)
      console.log(`Deleted from remote: ${fileName}`)
    } catch (error) {
      console.error(`Failed to delete remote file ${fileName}:`, error)
      throw error
    }
  }

  isInitialized(): boolean {
    return this.client !== null && this.config !== null
  }

  isSyncInProgress(): boolean {
    return this.isSyncing
  }

  close(): void {
    this.stopAutoSync()
    this.client = null
    this.config = null
  }
}

// Export singleton instance
export const fileSynchronizer = new MobileFileSynchronizer()
