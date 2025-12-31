import { S3ClientConfig } from "@aws-sdk/client-s3";

export interface SyncConfig {
    /**
     * Absolute path to the local directory to sync.
     */
    localPath: string;
    /**
     * S3 Bucket name.
     */
    bucket: string;
    /**
     * Optional prefix for S3 objects.
     * If provided, all objects will be nested under this prefix.
     * e.g., "my-space/files/"
     */
    prefix?: string;
    /**
     * AWS SDK S3 Client Configuration.
     */
    s3Config: S3ClientConfig;
    /**
     * Glob patterns to ignore.
     * e.g. [".graft/**", "*.tmp"]
     */
    ignore?: string[];
}

export interface FileMetadata {
    path: string; // Relative path from sync root (localPath / prefix)
    size: number;
    mtime: number; // Timestamp in milliseconds
    eTag?: string; // S3 ETag (optional)
}

export interface SyncStats {
    uploaded: number;
    downloaded: number;
    deletedLocal: number;
    deletedRemote: number;
    errors: number;
    processed: number;
    total: number;
}

export interface SyncMetadata {
    lastModified: string; // ISO Date
    hash: string; // SHA-256 hash of sorted file list
}
