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
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import * as FileSystem from 'expo-file-system';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface MobileSyncConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  prefix?: string; // e.g., "user-id/capture/"
}

export interface SyncStats {
  uploaded: number;
  downloaded: number;
  deleted: number;
  errors: number;
  lastSyncTime: number;
}

interface FileInfo {
  size: number;
  mtime: number;
  path: string;
}

export class MobileFileSynchronizer {
  private client: S3Client | null = null;
  private config: MobileSyncConfig | null = null;
  private captureDir: string = '';
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;

  async initialize(config: MobileSyncConfig): Promise<void> {
    this.config = config;

    // Initialize S3 client
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    // Set capture directory
    this.captureDir = `${FileSystem.documentDirectory}.eidos/files/_capture/`;

    console.log('Mobile file synchronizer initialized');
  }

  /**
   * Start automatic sync with interval (in milliseconds)
   */
  startAutoSync(intervalMs: number = 60000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Do initial sync
    this.sync().catch(console.error);

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.sync().catch(console.error);
    }, intervalMs);

    console.log(`Auto-sync started with ${intervalMs}ms interval`);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Auto-sync stopped');
    }
  }

  async sync(): Promise<SyncStats> {
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping');
      return {
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        errors: 0,
        lastSyncTime: Date.now(),
      };
    }

    if (!this.client || !this.config) {
      throw new Error('Synchronizer not initialized');
    }

    this.isSyncing = true;
    const stats: SyncStats = {
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      errors: 0,
      lastSyncTime: Date.now(),
    };

    try {
      console.log('Starting file sync...');

      // Ensure capture directory exists
      const dirInfo = await FileSystem.getInfoAsync(this.captureDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.captureDir, { intermediates: true });
      }

      // Scan local files
      const localFiles = await this.scanLocalFiles();
      console.log(`Found ${localFiles.size} local files`);

      // Scan remote files
      const remoteFiles = await this.scanRemoteFiles();
      console.log(`Found ${remoteFiles.size} remote files`);

      // Determine which files need sync
      const allKeys = new Set([...localFiles.keys(), ...remoteFiles.keys()]);

      for (const key of allKeys) {
        try {
          const local = localFiles.get(key);
          const remote = remoteFiles.get(key);

          if (local && !remote) {
            // Upload new file
            await this.uploadFile(key, local.path);
            stats.uploaded++;
          } else if (!local && remote) {
            // Download new file
            await this.downloadFile(key);
            stats.downloaded++;
          } else if (local && remote) {
            // Both exist - check which is newer
            const timeDiff = local.mtime - remote.mtime;
            const sizeDiff = local.size !== remote.size;

            // Sync if time difference > 2 seconds or size is different
            if (Math.abs(timeDiff) > 2000 || sizeDiff) {
              if (timeDiff > 0) {
                // Local is newer - upload
                await this.uploadFile(key, local.path);
                stats.uploaded++;
              } else {
                // Remote is newer - download
                await this.downloadFile(key);
                stats.downloaded++;
              }
            }
          }
        } catch (error) {
          console.error(`Error syncing file ${key}:`, error);
          stats.errors++;
        }
      }

      console.log('File sync completed:', stats);
      return stats;
    } catch (error) {
      console.error('File sync failed:', error);
      stats.errors++;
      return stats;
    } finally {
      this.isSyncing = false;
    }
  }

  private async scanLocalFiles(): Promise<Map<string, FileInfo>> {
    const files = new Map<string, FileInfo>();

    try {
      const fileList = await FileSystem.readDirectoryAsync(this.captureDir);

      for (const fileName of fileList) {
        const filePath = `${this.captureDir}${fileName}`;
        const info = await FileSystem.getInfoAsync(filePath);

        if (info.exists && !info.isDirectory) {
          files.set(fileName, {
            size: info.size || 0,
            mtime: info.modificationTime || 0,
            path: filePath,
          });
        }
      }
    } catch (error) {
      console.error('Error scanning local files:', error);
    }

    return files;
  }

  private async scanRemoteFiles(): Promise<Map<string, FileInfo>> {
    if (!this.client || !this.config) {
      throw new Error('Synchronizer not initialized');
    }

    const files = new Map<string, FileInfo>();
    const prefix = this.config.prefix || '';

    try {
      let token: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: prefix,
          ContinuationToken: token,
        });

        const response = await this.client.send(command);

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (!obj.Key) continue;

            // Extract file name (remove prefix)
            let fileName = obj.Key;
            if (prefix && fileName.startsWith(prefix)) {
              fileName = fileName.slice(prefix.length);
            }
            if (fileName.startsWith('/')) {
              fileName = fileName.slice(1);
            }
            if (!fileName) continue;

            files.set(fileName, {
              size: obj.Size || 0,
              mtime: obj.LastModified?.getTime() || 0,
              path: obj.Key,
            });
          }
        }

        token = response.NextContinuationToken;
      } while (token);
    } catch (error) {
      console.error('Error scanning remote files:', error);
    }

    return files;
  }

  private async uploadFile(fileName: string, localPath: string): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error('Synchronizer not initialized');
    }

    try {
      const prefix = this.config.prefix || '';
      const key = prefix ? `${prefix}${fileName}` : fileName;

      // Read file as base64 for React Native
      const fileContent = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 string to Uint8Array for upload
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucketName,
          Key: key,
          Body: bytes,
        },
      });

      await upload.done();
      console.log(`Uploaded: ${fileName}`);
    } catch (error) {
      console.error(`Failed to upload ${fileName}:`, error);
      throw error;
    }
  }

  private async downloadFile(fileName: string): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error('Synchronizer not initialized');
    }

    try {
      const prefix = this.config.prefix || '';
      const key = prefix ? `${prefix}${fileName}` : fileName;
      const localPath = `${this.captureDir}${fileName}`;

      const command = new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      if (response.Body) {
        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        const reader = response.Body.transformToWebStream().getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        // Concatenate chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Convert Uint8Array to base64 string without using Buffer
        let binary = '';
        for (let i = 0; i < buffer.length; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64 = btoa(binary);

        await FileSystem.writeAsStringAsync(localPath, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log(`Downloaded: ${fileName}`);
      }
    } catch (error) {
      console.error(`Failed to download ${fileName}:`, error);
      throw error;
    }
  }

  async deleteRemoteFile(fileName: string): Promise<void> {
    if (!this.client || !this.config) {
      throw new Error('Synchronizer not initialized');
    }

    try {
      const prefix = this.config.prefix || '';
      const key = prefix ? `${prefix}${fileName}` : fileName;

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      });

      await this.client.send(command);
      console.log(`Deleted from remote: ${fileName}`);
    } catch (error) {
      console.error(`Failed to delete remote file ${fileName}:`, error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.client !== null && this.config !== null;
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  close(): void {
    this.stopAutoSync();
    this.client = null;
    this.config = null;
  }
}

// Export singleton instance
export const fileSynchronizer = new MobileFileSynchronizer();

