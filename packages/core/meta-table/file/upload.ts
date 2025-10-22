import { getUuid } from "@/lib/utils"
import type { BaseFileTable, IFile } from "./base"
import { FileSystemError, FileUploadError } from "./errors"
import { PathHelper } from "./helper"

// Mixin to add upload operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseFileTable

export interface UploadOptions {
    /** File name (optional, will be inferred from URL or required for other sources) */
    fileName?: string
    /** MIME type (optional, will be inferred from File/Blob or required for ArrayBuffer/base64) */
    mimeType?: string
    /** Parent directory path as array, e.g., ["subfolder", "nested"] */
    parentPath?: string[]
    /** Check if file already exists at the target path and return existing file if found */
    checkDuplicate?: boolean
}

export function WithUpload<T extends Constructor>(Base: T) {
    return class UploadFileTableMixin extends Base {
        /**
         * Universal upload method supporting multiple input types
         * @param source - File source: URL (http/https), base64 string, ArrayBuffer, Blob, or File object
         * @param options - Upload options
         * @returns Uploaded file info with publicUrl
         * 
         * @example
         * // Upload from URL
         * await upload("https://example.com/image.jpg", { parentPath: ["images"] })
         * 
         * @example
         * // Upload from base64
         * await upload(base64String, { fileName: "photo.jpg", mimeType: "image/jpeg" })
         * 
         * @example
         * // Upload from ArrayBuffer
         * await upload(arrayBuffer, { fileName: "doc.pdf", mimeType: "application/pdf" })
         * 
         * @example
         * // Upload from File object
         * await upload(fileObject, { parentPath: ["documents"] })
         */
        public async upload(
            source: string | ArrayBuffer | Blob | File,
            options?: UploadOptions
        ): Promise<IFile & { publicUrl: string }> {
            if (!this.dataSpace.efsManager) {
                throw new FileSystemError("file manager not found")
            }

            const {
                fileName,
                mimeType,
                parentPath = [],
                checkDuplicate = false
            } = options || {}

            const basePath = [PathHelper.ROOT_DIR, ...parentPath]
            const fileId = getUuid()

            let file: File
            let finalFileName: string
            let finalMimeType: string

            // Handle different source types
            if (typeof source === "string") {
                // Check if it's a URL
                if (source.startsWith("http://") || source.startsWith("https://")) {
                    // Fetch from URL
                    const response = await fetch(source)
                    const blob = await response.blob()
                    finalFileName = fileName || source.split("/").pop() || `file-${fileId}`
                    finalMimeType = mimeType || blob.type || "application/octet-stream"
                    file = new File([blob], finalFileName, { type: finalMimeType })
                } else {
                    // Treat as base64 string
                    if (!fileName) {
                        throw new FileUploadError("fileName is required for base64 upload")
                    }
                    if (!mimeType) {
                        throw new FileUploadError("mimeType is required for base64 upload")
                    }
                    const blob = new Blob([Buffer.from(source, 'base64')], { type: mimeType })
                    file = new File([blob], fileName, { type: mimeType })
                    finalFileName = fileName
                    finalMimeType = mimeType
                }
            } else if (source instanceof File) {
                // Use File object directly
                finalFileName = fileName || source.name
                finalMimeType = mimeType || source.type || "application/octet-stream"
                file = fileName || mimeType
                    ? new File([source], finalFileName, { type: finalMimeType })
                    : source
            } else if (source instanceof Blob) {
                // Convert Blob to File
                if (!fileName) {
                    throw new FileUploadError("fileName is required for Blob upload")
                }
                finalFileName = fileName
                finalMimeType = mimeType || source.type || "application/octet-stream"
                file = new File([source], finalFileName, { type: finalMimeType })
            } else if (source instanceof ArrayBuffer) {
                // Convert ArrayBuffer to File
                if (!fileName) {
                    throw new FileUploadError("fileName is required for ArrayBuffer upload")
                }
                if (!mimeType) {
                    throw new FileUploadError("mimeType is required for ArrayBuffer upload")
                }
                const blob = new Blob([source], { type: mimeType })
                file = new File([blob], fileName, { type: mimeType })
                finalFileName = fileName
                finalMimeType = mimeType
            } else {
                throw new FileUploadError("Unsupported source type")
            }

            // Add file to file system
            const paths = await this.dataSpace.efsManager.addFile(basePath, file)

            if (!paths) {
                throw new FileUploadError("Failed to add file to file system")
            }

            const path = paths.join("/")

            // Check for duplicate if requested
            if (checkDuplicate) {
                const existingFile = await this.getFileByPath(path)
                if (existingFile) {
                    return {
                        ...existingFile,
                        publicUrl: this.dataSpace.efsManager.getFileUrlByPath(path),
                    }
                }
            }

            // Create database record
            const fileInfo: IFile = {
                id: fileId,
                name: finalFileName,
                size: file.size,
                mime: finalMimeType,
                path,
            }

            const fileObj = await this.add(fileInfo)
            return {
                ...fileObj,
                publicUrl: this.dataSpace.efsManager.getFileUrlByPath(path),
            }
        }

        /**
         * @deprecated Use upload() instead. Will be removed in future versions.
         * @param url a url of file
         * @param subDir sub directory of file
         * @param _name file name
         */
        async saveFile2EFS(
            url: string,
            subDir: string[],
            _name?: string
        ): Promise<IFile | null> {
            const result = await this.upload(url, {
                fileName: _name,
                parentPath: subDir,
                checkDuplicate: true,
            })
            return result
        }

        async uploadDir(
            dirHandle: FileSystemDirectoryHandle,
            total: number,
            current: number,
            _parentPath?: string[]
        ) {
            const space = this.dataSpace.dbName
            let parentPath = _parentPath || [PathHelper.ROOT_DIR]
            // walk dirHandle upload to /extensions/<name>/
            if (!this.dataSpace.efsManager) {
                throw new FileSystemError("file manager not found")
            }
            await this.dataSpace.efsManager.addDir(parentPath, dirHandle.name)
            parentPath = [...parentPath, dirHandle.name]
            for await (const [key, value] of dirHandle.entries()) {
                if (value.kind === "directory") {
                    await this.uploadDir(
                        value as FileSystemDirectoryHandle,
                        total,
                        current,
                        parentPath
                    )
                } else if (value.kind === "file") {
                    try {
                        const file = await (value as FileSystemFileHandle).getFile()
                        const fileId = getUuid()

                        const paths = await this.dataSpace.efsManager.addFile(parentPath, file)
                        if (!paths) {
                            throw new FileUploadError("add file failed")
                        }
                        const { name, size, type: mime } = file
                        const path = paths.join("/")
                        const fileInfo: IFile = {
                            id: fileId,
                            name,
                            size,
                            mime,
                            path,
                        }
                        // TODO: handle duplicate file
                        await this.add(fileInfo)
                    } catch (error) {
                    } finally {
                        current++
                        this.dataSpace.blockUIMsg(`uploading ${name}`, {
                            progress: (current / total) * 100,
                        })
                    }
                }
            }
        }
    }
}

