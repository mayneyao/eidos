import fs from "fs"
import path from "path"
import { Worker } from "worker_threads"
import type { DataSpace } from "@/packages/core/data-space"
import log from "electron-log"

import { CredentialsManager } from "../credentials"
import { getSpacePath } from "../file-system/space"
import { getResourcePath } from "../helper"
import { getSpaceRegistry } from "../space-registry"
import { DataSpaceProcessPool } from "./process-pool"
import { RpcClient } from "./rpc/rpc-client"
import type { WorkerInitData } from "./rpc/rpc-types"

export class DataSpaceManager {
  private static instance: DataSpaceManager
  private dataSpaceProxy: DataSpace | null = null
  private currentSpaceId: string | null = null
  private initializationPromise: Promise<DataSpace> | null = null

  private constructor() {}

  public static getInstance(): DataSpaceManager {
    if (!DataSpaceManager.instance) {
      DataSpaceManager.instance = new DataSpaceManager()
    }
    return DataSpaceManager.instance
  }

  public getCurrentSpaceId(): string | null {
    return this.currentSpaceId
  }

  public getDataSpace(): DataSpace | null {
    return this.dataSpaceProxy
  }

  public async reload(): Promise<DataSpace | null> {
    console.log("====== reload data space ======")
    if (!this.currentSpaceId) {
      return null
    }

    // Close proxy/connection?
    // The pool handles checking if process is dead.
    // To force reload, we might want to kill the process in the pool
    // But for now, just re-getting it serves as 'reload' for the variable

    // If we want a hard reload:
    // DataSpaceProcessPool.getInstance().terminate(this.currentSpaceId);

    // Reinitialize with the same space name
    return this.getOrSetDataSpace(this.currentSpaceId)
  }

  public async close(): Promise<boolean> {
    if (!this.currentSpaceId) {
      return false
    }

    // Terminate the process via pool? Or just nullify proxy?
    // Generally 'close' in single-process meant closing db connection.
    // Here it means terminating the worker.
    DataSpaceProcessPool.getInstance().killAll() // or terminate specific

    // Stop sync worker
    this.stopSyncWorker(this.currentSpaceId)

    this.dataSpaceProxy = null
    this.currentSpaceId = null
    return true
  }

  public async getOrSetDataSpace(
    spaceId: string,
    syncOptions?: { enabled: boolean; remote?: string }
  ): Promise<DataSpace> {
    if (this.currentSpaceId === spaceId && this.dataSpaceProxy) {
      return this.dataSpaceProxy
    }

    if (this.initializationPromise && this.currentSpaceId === spaceId) {
      return this.initializationPromise
    }

    this.initializationPromise = (async () => {
      log.info(`Initializing data space manager for space: ${spaceId}`)
      this.currentSpaceId = spaceId

      // Prepare Init configuration for the worker
      const libPath = getResourcePath(`dist-sqlite-ext/libsimple`)
      const dictPath = getResourcePath("dist-sqlite-ext/dict")
      const graftLibPath = getResourcePath("dist-sqlite-ext/libgraft")
      const vecLibPath = getResourcePath("dist-sqlite-ext/libvec")

      const credentials =
        await CredentialsManager.getSyncCredentials("eidos.space")
      if (!credentials) {
        // throw new Error(`Credentials for eidos.space not found`)
        // Keep existing logic, maybe it works without credentials for local?
      }

      const spaceInfo = getSpaceRegistry().getSpace(spaceId)
      if (!spaceInfo) {
        throw new Error(`Space not found: ${spaceId}`)
      }

      const initData: WorkerInitData = {
        spaceInfo,
        paths: {
          spacePath: getSpacePath(spaceId),
          simplePathConfig: { libPath, dictPath },
          vecPathConfig: { libPath: vecLibPath },
          graftPathConfig: {
            libPath: graftLibPath,
            enabled: syncOptions?.enabled ?? spaceInfo.sync?.enabled ?? false,
            remote: syncOptions?.remote ?? spaceInfo.sync?.remote ?? "",
            credentials,
          },
        },
      }

      const pool = DataSpaceProcessPool.getInstance()
      const childProcess = await pool.getProcess(spaceId, initData)

      // Create RPC Client and Proxy
      const client = new RpcClient(childProcess as any)

      // Listen for log messages from worker
      childProcess.on("message", (payload: any) => {
        if (payload.type === "log") {
          const { level, message, args, timestamp } = payload
          const logMessage = `[${spaceId}] ${message}${args.length > 0 ? " " + args.join(" ") : ""}`

          switch (level) {
            case "info":
              log.info(logMessage)
              break
            case "warn":
              log.warn(logMessage)
              break
            case "error":
              log.error(logMessage)
              break
            case "debug":
              log.debug(logMessage)
              break
            default:
              log.log(logMessage)
          }
        }
      })

      const proxy = client.createProxy()
      this.dataSpaceProxy = proxy

      // Start Sync Worker (Managed by Main Process)
      this.startSyncWorker(spaceId, spaceInfo, initData.paths.graftPathConfig)

      return proxy
    })().finally(() => {
      this.initializationPromise = null
    })

    return this.initializationPromise
  }

  private syncWorkers: Map<string, Worker> = new Map()

  private startSyncWorker(
    spaceId: string,
    spaceInfo: any,
    graftPathConfig: any
  ) {
    // Stop existing for this space if any
    this.stopSyncWorker(spaceId)

    // Check if sync is enabled and credentials exist
    if (!spaceInfo.sync?.remote || !graftPathConfig?.credentials?.accessKeyId) {
      log.info("Sync not enabled or missing credentials, skipping sync worker.")
      return
    }
    const remoteSpaceId =
      spaceInfo.sync?.remote?.split("/").pop()?.split(".")[0] || spaceInfo.id
    const localPath = getSpacePath(spaceId) + "/.eidos/files"
    if (!fs.existsSync(localPath)) {
      log.warn(`Sync worker skipped: local path ${localPath} does not exist.`)
      return
    }

    const syncConfig = {
      localPath,
      bucket: graftPathConfig.credentials.bucketName,
      // user-id/space-id/
      prefix: `${remoteSpaceId}/.eidos/files/`,
      s3Config: {
        region: graftPathConfig.credentials.region || "us-east-1",
        endpoint: graftPathConfig.credentials.endpoint,
        credentials: {
          accessKeyId: graftPathConfig.credentials.accessKeyId,
          secretAccessKey: graftPathConfig.credentials.secretAccessKey,
        },
      },
      ignore: [".graft/**"],
    }

    try {
      log.info(`Starting sync worker for space ${spaceId}...`)
      // Use require.resolve to find the worker file.
      // In dev (ts-node), this might point to .ts, in prod .js.
      // Since we are in the main process, we can use standard node modules.
      const workerPath = path.join(__dirname, "sync-worker.js")
      // Note: In prod, files are bundled. We might need to ensure sync-worker is emitted as a separate file
      // or use a specific loader.
      // Assuming similar setup to 'worker.js' which is used by utilityProcess.fork
      // But here we use worker_threads.

      // Verify if sync-worker.js exists, or try .ts if in dev
      let actualWorkerPath = workerPath

      const syncWorker = new Worker(actualWorkerPath, {
        workerData: { config: syncConfig },
      })

      this.syncWorkers.set(spaceId, syncWorker)

      syncWorker.on("message", (msg: any) => {
        if (msg.type === "log") {
          const { level, message } = msg
          log.log(`[SyncWorker:${spaceId}] ${message}`)
        }
      })

      syncWorker.on("error", (err: Error) => {
        log.error(`[SyncWorker:${spaceId}] Error:`, err)
      })

      syncWorker.on("exit", (code: number) => {
        if (code !== 0) {
          log.error(`[SyncWorker:${spaceId}] Stopped with exit code ${code}`)
        }
        this.syncWorkers.delete(spaceId)
      })
    } catch (e) {
      log.error(`Failed to spawn sync worker for ${spaceId}`, e)
    }
  }

  private stopSyncWorker(spaceId: string) {
    const worker = this.syncWorkers.get(spaceId)
    if (worker) {
      log.info(`Stopping sync worker for ${spaceId}`)
      worker.terminate()
      this.syncWorkers.delete(spaceId)
    }
  }
}

// Export convenience functions
export function getDataSpace(): DataSpace | null {
  return DataSpaceManager.getInstance().getDataSpace()
}

export function getCurrentSpaceId(): string | null {
  return DataSpaceManager.getInstance().getCurrentSpaceId()
}

export function getOrSetDataSpace(spaceId: string): Promise<DataSpace> {
  // We can just proxy to the manager
  return DataSpaceManager.getInstance().getOrSetDataSpace(spaceId)
}

export function reloadDataSpace(): Promise<{ success: boolean }> {
  DataSpaceManager.getInstance().reload()
  return Promise.resolve({
    success: true,
  })
}

export async function closeDataSpace(): Promise<{ success: boolean }> {
  const success = await DataSpaceManager.getInstance().close()
  return {
    success,
  }
}
