# File Upload API

## Overview

The file upload API has been refactored to provide a unified `upload()` method that supports multiple input types.

## Universal Upload Method

### Signature

```typescript
async upload(
  source: string | ArrayBuffer | Blob | File,
  options?: UploadOptions
): Promise<IFile & { publicUrl: string }>
```

### Options

```typescript
interface UploadOptions {
  /** File name (optional, will be inferred from URL or required for other sources) */
  fileName?: string
  /** MIME type (optional, will be inferred from File/Blob or required for ArrayBuffer/base64) */
  mimeType?: string
  /** Parent directory path as array, e.g., ["subfolder", "nested"] */
  parentPath?: string[]
  /** Check if file already exists at the target path and return existing file if found */
  checkDuplicate?: boolean
}
```

## Usage Examples

### 1. Upload from URL

```typescript
// Simple URL upload
const file = await fileTable.upload("https://example.com/image.jpg")

// URL upload with custom path
const file = await fileTable.upload("https://example.com/image.jpg", {
  parentPath: ["images", "avatars"],
  fileName: "custom-name.jpg"
})

// URL upload with duplicate check
const file = await fileTable.upload("https://example.com/image.jpg", {
  checkDuplicate: true
})
```

### 2. Upload from Base64 String

```typescript
const file = await fileTable.upload(base64String, {
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  parentPath: ["photos"]
})
```

### 3. Upload from ArrayBuffer

```typescript
const file = await fileTable.upload(arrayBuffer, {
  fileName: "document.pdf",
  mimeType: "application/pdf",
  parentPath: ["documents"]
})
```

### 4. Upload from File Object

```typescript
// From file input
const fileInput = document.querySelector('input[type="file"]')
const file = await fileTable.upload(fileInput.files[0], {
  parentPath: ["uploads"]
})

// With custom name
const file = await fileTable.upload(fileInput.files[0], {
  fileName: "renamed-file.pdf",
  parentPath: ["uploads"]
})
```

### 5. Upload from Blob

```typescript
const file = await fileTable.upload(blob, {
  fileName: "screenshot.png",
  mimeType: "image/png",
  parentPath: ["screenshots"]
})
```

## Response

All upload methods return the same structure:

```typescript
{
  id: string
  name: string
  path: string
  size: number
  mime: string
  created_at?: string
  is_vectorized?: boolean
  publicUrl: string  // Ready-to-use URL for the file
}
```

## Migration from Old API

### Old API (Deprecated)

```typescript
// saveFile2EFS - DEPRECATED
await fileTable.saveFile2EFS(url, ["subdir"], "filename.jpg")

// Old upload method
await fileTable.upload(arrayBuffer, "filename.pdf", "application/pdf", ["docs"])
```

### New API (Recommended)

```typescript
// Upload from URL
await fileTable.upload(url, {
  parentPath: ["subdir"],
  fileName: "filename.jpg",
  checkDuplicate: true  // This was the default behavior in saveFile2EFS
})

// Upload from ArrayBuffer
await fileTable.upload(arrayBuffer, {
  fileName: "filename.pdf",
  mimeType: "application/pdf",
  parentPath: ["docs"]
})
```

## Features

✅ **Unified API** - One method for all upload types
✅ **Type Safety** - Full TypeScript support with proper type inference
✅ **Flexible** - Supports URL, base64, ArrayBuffer, Blob, and File
✅ **Smart Defaults** - Infers filename and MIME type when possible
✅ **Duplicate Check** - Optional duplicate detection
✅ **Backward Compatible** - Old `saveFile2EFS` still works (deprecated)

## File Retrieval

### Get by ID

```typescript
const file = await fileTable.get("file_123")
if (file) {
  console.log(file.name, file.size, file.mime)
}
```

### Get by Path

```typescript
const file = await fileTable.getByPath("files/images/photo.jpg")
if (file) {
  console.log(file.id, file.name)
}
```

## Error Handling

The upload method throws specific errors:

- `FileSystemError` - When file system manager is not available
- `FileUploadError` - When file upload fails or required parameters are missing

```typescript
try {
  const file = await fileTable.upload(source, options)
} catch (error) {
  if (error instanceof FileUploadError) {
    console.error("Upload failed:", error.message)
  }
}
```

