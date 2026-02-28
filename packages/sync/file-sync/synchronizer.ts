import { createReadStream, existsSync } from "fs"
import * as fs from "fs/promises"
import * as path from "path"
import { Readable } from "stream"
import * as crypto from "crypto"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  _Object,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { FSWatcher, watch } from "chokidar"

import { FileMetadata, SyncConfig } from "./types"
import { debounce, isEmpty } from "./utils"

const DEBOUNCE_MS = 500
const IGNORE_FILES = [".DS_Store"]
const METADATA_FILE = "metadata.json"

export class FileSynchronizer {
  private client: S3Client
  private config: SyncConfig
  private watcher: FSWatcher | null = null
  private isSyncing = false
  private syncQueued = false
  private _debouncedSync: () => void

  constructor(config: SyncConfig) {
    this.config = config
    this.client = new S3Client(config.s3Config)

    this._debouncedSync = debounce(() => {
      this.sync().catch((err) => {
        console.error("Sync failed:", err)
      })
    }, DEBOUNCE_MS)
  }

  public async start() {
    // Initial full sync
    await this.sync()
    this.startWatcher()
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private startWatcher() {
    if (this.watcher) return

    console.log(`Starting watcher on ${this.config.localPath}`)
    this.watcher = watch(this.config.localPath, {
      ignored: [
        ...(this.config.ignore || []),
        // /(^|[\/\\])\../, // ignore dotfiles by default, except maybe we don't want to? user check?
        // Actually, the user requirement said "ignore .graft", but generally sync might include dotfiles.
        // Re-reading requirements: "ignore .graft", sync "files".
        // I'll stick to config.ignore and specific ignores.
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    })

    const onChange = (filepath: string) => {
      console.log("File changed:", filepath)
      this._debouncedSync()
    }

    this.watcher
      .on("add", onChange)
      .on("change", onChange)
      .on("unlink", onChange)
  }

  public async sync() {
    if (this.isSyncing) {
      this.syncQueued = true
      return
    }

    this.isSyncing = true

    try {
      console.log("Starting sync cycle...")
      await this._performSync()
      console.log("Sync cycle completed.")
    } catch (error) {
      console.error("Error during sync:", error)
    } finally {
      this.isSyncing = false
      if (this.syncQueued) {
        this.syncQueued = false
        this._debouncedSync()
      }
    }
  }

  private async _performSync() {
    // 0. Metadata Check
    const localMeta = await this.computeLocalMeta(this.config.localPath)
    const s3Meta = await this.getS3Meta()

    if (
      !this.config.ignore?.some((p) => p === METADATA_FILE) && // Ensure we don't accidentally ignore checking if configured (though logic below hardcodes ignore)
      s3Meta &&
      s3Meta.hash === localMeta.hash &&
      s3Meta.lastModified === new Date(localMeta.maxMtime).toISOString()
    ) {
      console.log("[Sync] Metadata match, skipping sync.")
      return
    }

    // 1. Scan Local
    const localFiles = await this._walkLocal(this.config.localPath)

    // 2. Scan Remote
    const remoteFiles = await this._listS3()

    const allKeys = new Set([...localFiles.keys(), ...remoteFiles.keys()])
    const tasks: (() => Promise<void>)[] = []

    for (const key of allKeys) {
      if (
        IGNORE_FILES.includes(path.basename(key)) ||
        path.basename(key) === METADATA_FILE
      )
        continue

      const local = localFiles.get(key)
      const remote = remoteFiles.get(key)

      if (local && !remote) {
        // Local exists, remote doesn't. Upload.
        tasks.push(async () => {
          console.log(`[Sync] Uploading new file: ${key}`)
          await this._upload(key, local.absolutePath)
        })
      } else if (!local && remote) {
        // Remote exists, local doesn't. Download.
        tasks.push(async () => {
          console.log(`[Sync] Downloading new file: ${key}`)
          await this._download(key, path.join(this.config.localPath, key))
        })
      } else if (local && remote) {
        // Both exist. Check difference with 2-second tolerance for time
        const timeDiff = local.mtime - remote.mtime
        const sizeDiff = local.size !== remote.size

        // If sizes are different, we must sync.
        // If times are different (beyond tolerance), we must sync.

        if (!sizeDiff && Math.abs(timeDiff) <= 2000) {
          // Considered in sync
          continue
        }

        if (sizeDiff) {
          // Size mismatch: Conflict or partial update.
          // If local is newer (and larger/smaller?), upload.
          // If remote is newer, download.
          // If times are close but size diff, maybe content changed quickly?
          // Bias: Last Write Wins.
          if (timeDiff > 2000) {
            tasks.push(async () => {
              console.log(
                `[Sync] Uploading updated file (size diff, local newer): ${key}`
              )
              await this._upload(key, local.absolutePath)
            })
          } else {
            // Remote is newer OR times are close.
            // If times close + size diff -> assume remote is source of truth or conflict?
            // Safest is to download from remote to ensure consistency with server state?
            // However, if we JUST wrote locally, local might be very slightly newer?
            // Let's assume remote wins if times are ambiguous.
            tasks.push(async () => {
              console.log(
                `[Sync] Downloading updated file (size diff, remote newer/ambiguous): ${key}`
              )
              await this._download(key, path.join(this.config.localPath, key))
            })
          }
        } else {
          // Size same, time indicates drift
          if (timeDiff > 2000) {
            tasks.push(async () => {
              console.log(`[Sync] Uploading updated file (time diff): ${key}`)
              await this._upload(key, local.absolutePath)
            })
          } else if (timeDiff < -2000) {
            tasks.push(async () => {
              console.log(`[Sync] Downloading updated file (time diff): ${key}`)
              await this._download(key, path.join(this.config.localPath, key))
            })
          }
        }
      }
    }

    // Run tasks
    const BATCH_SIZE = 5
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(batch.map((t) => t()))
    }

    // Update Meta
    const newLocalMeta = await this.computeLocalMeta(this.config.localPath)
    await this.updateS3Meta(newLocalMeta)
  }

  private async _walkLocal(
    dir: string,
    base: string = ""
  ): Promise<
    Map<string, { size: number; mtime: number; absolutePath: string }>
  > {
    const files = new Map<
      string,
      { size: number; mtime: number; absolutePath: string }
    >()

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        // Use posix-style paths for keys to match S3 (always forward slashes)
        const relativePath = base
          ? path.posix.join(base, entry.name)
          : entry.name
        const absolutePath = path.join(dir, entry.name)

        if (
          this.config.ignore &&
          this.config.ignore.some((pattern) => {
            // Normalize pattern to posix style and remove trailing /**
            const normalizedPattern = pattern
              .replace(/\\/g, "/")
              .replace(/\/\*\*$/, "")
            return relativePath.startsWith(normalizedPattern)
          })
        ) {
          continue
        }

        // TODO: use minimatch for full glob support if needed.
        // For now, specific check for .graft handled in config.

        if (entry.isDirectory()) {
          const subFiles = await this._walkLocal(absolutePath, relativePath)
          subFiles.forEach((v, k) => files.set(k, v))
        } else {
          const stats = await fs.stat(absolutePath)
          files.set(relativePath, {
            size: stats.size,
            mtime: stats.mtime.getTime(),
            absolutePath,
          })
        }
      }
    } catch (e) {
      console.warn("Error walking local:", e)
    }
    return files
  }

  private async _listS3(): Promise<
    Map<string, { size: number; mtime: number }>
  > {
    const files = new Map<string, { size: number; mtime: number }>()
    let token: string | undefined

    try {
      do {
        const cmd = new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          ContinuationToken: token,
        })
        const response = await this.client.send(cmd)

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (!obj.Key) continue

            // key is full path including prefix.
            // We want relative to sync root.
            let relativePath = obj.Key
            if (this.config.prefix) {
              if (relativePath.startsWith(this.config.prefix)) {
                relativePath = relativePath.slice(this.config.prefix.length)
              } else {
                continue
              }
            }
            // Remove leading slash if any
            if (relativePath.startsWith("/"))
              relativePath = relativePath.slice(1)
            if (!relativePath) continue // skip folder placeholder if it matches prefix exactly

            files.set(relativePath, {
              size: obj.Size || 0,
              mtime: obj.LastModified ? obj.LastModified.getTime() : 0,
            })
          }
        }
        token = response.NextContinuationToken
      } while (token)
    } catch (e) {
      console.error("Error listing S3:", e)
    }
    return files
  }

  private async _upload(key: string, filePath: string) {
    try {
      const fileStream = createReadStream(filePath)
      // Use posix path for S3 keys (always forward slashes)
      const targetKey = this.config.prefix
        ? path.posix.join(this.config.prefix, key)
        : key

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucket,
          Key: targetKey,
          Body: fileStream,
        },
      })

      await upload.done()
      console.log(`[Sync] Uploaded ${key}`)
    } catch (e) {
      console.error(`[Sync] Failed to upload ${key}`, e)
    }
  }

  private async _download(key: string, filePath: string) {
    try {
      // Use posix path for S3 keys (always forward slashes)
      const targetKey = this.config.prefix
        ? path.posix.join(this.config.prefix, key)
        : key
      const cmd = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: targetKey,
      })
      const response = await this.client.send(cmd)

      if (response.Body) {
        // Ensure dir exists
        await fs.mkdir(path.dirname(filePath), { recursive: true })

        const stream = response.Body as unknown as Readable // aws sdk types mess
        await fs.writeFile(filePath, stream)

        // Update local mtime to match S3?
        // If we don't, next sync might think local is newer if we just wrote it.
        // S3 LastModified is what we retrieved.
        // We should technically `utimes`.
        if (response.LastModified) {
          await fs.utimes(filePath, new Date(), response.LastModified)
        }
        console.log(`[Sync] Downloaded ${key}`)
      }
    } catch (e) {
      console.error(`[Sync] Failed to download ${key}`, e)
    }
  }

  private async computeLocalMeta(
    dir: string,
    base: string = ""
  ): Promise<{ maxMtime: number; hash: string }> {
    const fileList: { key: string; size: number; mtime: string }[] = []
    let maxMtime = 0

    const walk = async (currentDir: string, currentBase: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        // Use posix-style paths for keys to match S3 (always forward slashes)
        const relativePath = currentBase
          ? path.posix.join(currentBase, entry.name)
          : entry.name
        const absolutePath = path.join(currentDir, entry.name)

        if (
          this.config.ignore &&
          this.config.ignore.some((pattern) => {
            // Normalize pattern to posix style and remove trailing /**
            const normalizedPattern = pattern
              .replace(/\\/g, "/")
              .replace(/\/\*\*$/, "")
            return relativePath.startsWith(normalizedPattern)
          })
        ) {
          continue
        }

        // Specific Ignore
        // TODO: refactor ignore logic to be shared with startWatcher
        if (entry.name === ".DS_Store" || entry.name.startsWith(".")) continue

        if (entry.isDirectory()) {
          await walk(absolutePath, relativePath)
        } else {
          const stats = await fs.stat(absolutePath)
          if (stats.mtime.getTime() > maxMtime) {
            maxMtime = stats.mtime.getTime()
          }
          fileList.push({
            key: relativePath,
            size: stats.size,
            mtime: stats.mtime.toISOString(),
          })
        }
      }
    }

    await walk(dir, base)

    // Sort to ensure consistent hash
    fileList.sort((a, b) => a.key.localeCompare(b.key))

    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(fileList))
      .digest("hex")

    return { maxMtime, hash }
  }

  private async getS3Meta(): Promise<{
    lastModified: string
    hash: string
  } | null> {
    try {
      // Use posix path for S3 keys (always forward slashes)
      const targetKey = this.config.prefix
        ? path.posix.join(this.config.prefix, METADATA_FILE)
        : METADATA_FILE

      const cmd = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: targetKey,
      })

      const response = await this.client.send(cmd)
      if (response.Body) {
        const str = await response.Body.transformToString()
        return JSON.parse(str)
      }
    } catch (e: any) {
      if (e.name !== "NoSuchKey") {
        console.warn("Failed to get S3 meta:", e)
      }
    }
    return null
  }

  private async updateS3Meta(meta: { maxMtime: number; hash: string }) {
    try {
      // Use posix path for S3 keys (always forward slashes)
      const targetKey = this.config.prefix
        ? path.posix.join(this.config.prefix, METADATA_FILE)
        : METADATA_FILE

      const body = JSON.stringify({
        lastModified: new Date(meta.maxMtime).toISOString(),
        hash: meta.hash,
      })

      const cmd = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: targetKey,
        Body: body,
        ContentType: "application/json",
      })

      await this.client.send(cmd)
      // console.log("Updated S3 metadata")
    } catch (e) {
      console.error("Failed to update S3 metadata:", e)
    }
  }
}
