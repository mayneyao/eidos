export type CaptureType = 'text' | 'image' | 'file' | 'audio' | 'video';

export interface CaptureMetadata {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  filePath?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface Capture {
  id: string;
  content: string;
  created_at: number;
  type: CaptureType;
  metadata?: CaptureMetadata;
  synced: number;
}

export interface Setting {
  key: string;
  value: string;
}

export interface SyncConfig {
  enabled: boolean;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  region?: string;
}

