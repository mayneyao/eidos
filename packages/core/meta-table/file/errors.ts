/**
 * Custom error classes for file operations
 */

export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FileNotFoundError"
  }
}

export class FileSystemError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FileSystemError"
  }
}

export class FileUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FileUploadError"
  }
}

export class PathMigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathMigrationError"
  }
}
