import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { CaptureMetadata, CaptureType } from '../db/types';

export interface FileUploadResult {
  filePath: string;
  metadata: CaptureMetadata;
  type: CaptureType;
}

class FileManager {
  private captureDir: string | null = null;

  async initialize(): Promise<void> {
    try {
      // Create .eidos/files/_capture directory structure
      const baseDir = `${FileSystem.documentDirectory}eidos/`;
      const filesDir = `${baseDir}files/`;
      this.captureDir = `${filesDir}_capture/`;

      // Create directories if they don't exist
      for (const dir of [baseDir, filesDir, this.captureDir]) {
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
      }

      console.log('File manager initialized at:', this.captureDir);
    } catch (error) {
      console.error('Failed to initialize file manager:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<string> {
    if (!this.captureDir) {
      await this.initialize();
    }
    if (!this.captureDir) throw new Error('File manager not initialized');
    return this.captureDir;
  }

  private generateFileName(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const ext = originalName.split('.').pop() || 'file';
    return `${timestamp}-${random}.${ext}`;
  }

  async pickImage(): Promise<FileUploadResult | null> {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Camera roll permission required');
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (result.canceled) return null;

      const asset = result.assets[0];
      return await this.saveFile(asset.uri, asset.fileName || 'image.jpg', {
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
      });
    } catch (error) {
      console.error('Failed to pick image:', error);
      throw error;
    }
  }

  async pickDocument(): Promise<FileUploadResult | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return null;

      const doc = result.assets[0];
      return await this.saveFile(doc.uri, doc.name, {
        mimeType: doc.mimeType,
        fileSize: doc.size,
      });
    } catch (error) {
      console.error('Failed to pick document:', error);
      throw error;
    }
  }

  async takePhoto(): Promise<FileUploadResult | null> {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Camera permission required');
      }

      // Take photo
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) return null;

      const asset = result.assets[0];
      return await this.saveFile(asset.uri, 'photo.jpg', {
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
      });
    } catch (error) {
      console.error('Failed to take photo:', error);
      throw error;
    }
  }

  private async saveFile(
    sourceUri: string,
    originalName: string,
    extraMetadata: Partial<CaptureMetadata> = {}
  ): Promise<FileUploadResult> {
    const captureDir = await this.ensureInitialized();
    const fileName = this.generateFileName(originalName);
    const destPath = `${captureDir}${fileName}`;

    try {
      // Copy file to capture directory
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
      });

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(destPath);
      const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

      // Determine capture type from mime type
      const mimeType = extraMetadata.mimeType || 'application/octet-stream';
      let type: CaptureType = 'file';
      if (mimeType.startsWith('image/')) {
        type = 'image';
      } else if (mimeType.startsWith('video/')) {
        type = 'video';
      } else if (mimeType.startsWith('audio/')) {
        type = 'audio';
      }

      const metadata: CaptureMetadata = {
        fileName: originalName,
        fileSize,
        filePath: destPath,
        mimeType,
        ...extraMetadata,
      };

      return {
        filePath: destPath,
        metadata,
        type,
      };
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      // Don't throw - file might already be deleted
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists && 'size' in fileInfo) {
        return fileInfo.size;
      }
      return 0;
    } catch (error) {
      console.error('Failed to get file size:', error);
      return 0;
    }
  }

  async getCaptureDirectorySize(): Promise<number> {
    const captureDir = await this.ensureInitialized();
    try {
      const files = await FileSystem.readDirectoryAsync(captureDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = `${captureDir}${file}`;
        const size = await this.getFileSize(filePath);
        totalSize += size;
      }

      return totalSize;
    } catch (error) {
      console.error('Failed to calculate directory size:', error);
      return 0;
    }
  }

  async listCaptureFiles(): Promise<string[]> {
    const captureDir = await this.ensureInitialized();
    try {
      return await FileSystem.readDirectoryAsync(captureDir);
    } catch (error) {
      console.error('Failed to list files:', error);
      return [];
    }
  }

  async clearAllFiles(): Promise<void> {
    const captureDir = await this.ensureInitialized();
    try {
      await FileSystem.deleteAsync(captureDir, { idempotent: true });
      await FileSystem.makeDirectoryAsync(captureDir, { intermediates: true });
    } catch (error) {
      console.error('Failed to clear files:', error);
      throw error;
    }
  }

  getCaptureDirectory(): string | null {
    return this.captureDir;
  }
}

// Export singleton instance
export const fileManager = new FileManager();

