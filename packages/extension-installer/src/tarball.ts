import {
  canonicalExtensionPackagePath,
  EXTENSION_LOCK_FILENAME,
  extensionPackagePathCollisionKey,
} from "@eidos.space/extension-manifest"
import { Parser, type ReadEntry } from "tar"
import type { ExtensionInstallFile } from "./types"

const DEFAULT_MAX_FILES = 2_048
const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_ENTRIES = 4_096
const DEFAULT_MAX_PATH_DEPTH = 32

export interface ParseGitHubTarballOptions {
  maxFiles?: number
  maxFileBytes?: number
  maxTotalBytes?: number
  maxEntries?: number
  maxPathDepth?: number
  subdirectory?: string
}

function archivePathSegments(value: string): string[] {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error(`GitHub archive contains an invalid path: ${value}`)
  }
  const segments = value.replace(/\/+$/, "").split("/")
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`GitHub archive contains an invalid path: ${value}`)
  }
  return segments
}

function isRegularFile(entry: ReadEntry): boolean {
  return entry.type === "File" || entry.type === "OldFile"
}

export async function parseGitHubTarball(
  archive: Uint8Array,
  options: ParseGitHubTarballOptions = {}
): Promise<ExtensionInstallFile[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxPathDepth = options.maxPathDepth ?? DEFAULT_MAX_PATH_DEPTH
  const subdirectory = options.subdirectory
    ? canonicalExtensionPackagePath(options.subdirectory)
    : undefined
  const subdirectorySegments = subdirectory?.split("/") ?? []
  const files: ExtensionInstallFile[] = []
  const collisionKeys = new Set<string>()
  let archiveRoot: string | undefined
  let entries = 0
  let totalBytes = 0

  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({ strict: true, maxMetaEntrySize: 1024 * 1024 })
    let failed = false
    const abort = (error: Error) => {
      if (failed) return
      failed = true
      parser.abort(error)
      reject(error)
    }
    parser.on("error", (error) => abort(error))
    parser.on("end", () => {
      if (!failed) resolve()
    })
    parser.on("entry", (entry: ReadEntry) => {
      if (failed) {
        entry.resume()
        return
      }
      entries += 1
      if (entries > maxEntries) {
        entry.resume()
        abort(
          new Error(`GitHub archive contains more than ${maxEntries} entries`)
        )
        return
      }

      let segments: string[]
      try {
        segments = archivePathSegments(entry.path)
      } catch (error) {
        entry.resume()
        abort(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const root = segments.shift()!
      if (archiveRoot && archiveRoot !== root) {
        entry.resume()
        abort(
          new Error("GitHub archive contains more than one repository root")
        )
        return
      }
      archiveRoot = root
      if (segments.length === 0 && entry.type === "Directory") {
        entry.resume()
        return
      }
      if (segments.length === 0) {
        entry.resume()
        abort(new Error("GitHub archive contains a file at the archive root"))
        return
      }
      if (subdirectorySegments.length > 0) {
        const insidePackage = subdirectorySegments.every(
          (segment, index) => segments[index] === segment
        )
        if (!insidePackage) {
          entry.resume()
          return
        }
        segments = segments.slice(subdirectorySegments.length)
        if (segments.length === 0 && entry.type === "Directory") {
          entry.resume()
          return
        }
        if (segments.length === 0) {
          entry.resume()
          abort(
            new Error(
              `GitHub extension package path is not a directory: ${subdirectory}`
            )
          )
          return
        }
      }
      if (segments.length > maxPathDepth) {
        entry.resume()
        abort(new Error(`GitHub archive path exceeds ${maxPathDepth} segments`))
        return
      }
      if (entry.type === "Directory") {
        entry.resume()
        return
      }
      if (!isRegularFile(entry)) {
        entry.resume()
        abort(
          new Error(`GitHub archive entry is not a regular file: ${entry.path}`)
        )
        return
      }
      if (entry.size > maxFileBytes) {
        entry.resume()
        abort(
          new Error(
            `GitHub archive file exceeds ${maxFileBytes} bytes: ${entry.path}`
          )
        )
        return
      }
      if (files.length >= maxFiles) {
        entry.resume()
        abort(new Error(`GitHub archive contains more than ${maxFiles} files`))
        return
      }

      let relativePath: string
      try {
        relativePath = canonicalExtensionPackagePath(segments.join("/"))
        if (relativePath === EXTENSION_LOCK_FILENAME) {
          throw new Error(
            "GitHub extension source cannot provide host-managed extension.lock.json"
          )
        }
        const collision = extensionPackagePathCollisionKey(relativePath)
        if (collisionKeys.has(collision)) {
          throw new Error(`GitHub archive path collision: ${relativePath}`)
        }
        collisionKeys.add(collision)
      } catch (error) {
        entry.resume()
        abort(error instanceof Error ? error : new Error(String(error)))
        return
      }

      const chunks: Buffer[] = []
      let size = 0
      entry.on("data", (chunk: Buffer) => {
        if (failed) return
        size += chunk.byteLength
        totalBytes += chunk.byteLength
        if (size > maxFileBytes || totalBytes > maxTotalBytes) {
          abort(
            new Error(
              totalBytes > maxTotalBytes
                ? `GitHub archive expands beyond ${maxTotalBytes} bytes`
                : `GitHub archive file expands beyond ${maxFileBytes} bytes: ${entry.path}`
            )
          )
          return
        }
        chunks.push(Buffer.from(chunk))
      })
      entry.on("end", () => {
        if (failed) return
        if (size !== entry.size) {
          abort(
            new Error(
              `GitHub archive file size changed while reading: ${entry.path}`
            )
          )
          return
        }
        files.push({
          path: relativePath,
          content: new Uint8Array(Buffer.concat(chunks)),
        })
      })
      entry.resume()
    })
    parser.end(Buffer.from(archive))
  })

  if (!archiveRoot || files.length === 0) {
    throw new Error(
      subdirectory
        ? `GitHub archive does not contain extension package files at ${subdirectory}`
        : "GitHub archive does not contain extension package files"
    )
  }
  files.sort((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))
  )
  return files
}
