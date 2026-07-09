import fs from "fs"
import path from "path"
import { Worker } from "worker_threads"
import type { DataSpace } from "@/packages/core/data-space"
import log from "electron-log"

import { Injectable, Inject, container } from "../../common/di"
import { ConfigManager } from "../config/config-manager"
import { CredentialsManager } from "../sync/credentials"
import { SpaceRegistry } from "../space-management/space-registry"
import { getSpacePath } from "../../utils/paths"
import { getResourcePath } from "../../utils/resources"
import { DataSpaceProcessPool } from "./data-space-process-pool.service"
import { RpcClient } from "./worker/rpc/rpc-client"
import type { WorkerInitData } from "./worker/rpc/rpc-types"

/**
 * DataSpace Manager - Manages DataSpace instance lifecycle
 *
 * Responsibilities:
 * - Initialize and manage DataSpace instances
 * - Handle space switching
 * - Manage sync workers
 */
@Injectable()
export class DataSpaceManager {
  private dataSpaceProxy: DataSpace | null = null
  private currentSpaceId: string | null = null
  private initializationPromise: Promise<DataSpace> | null = null
  private syncWorkers: Map<string, Worker> = new Map()

  constructor(
    @Inject(ConfigManager) private configManager: ConfigManager,
    @Inject(DataSpaceProcessPool) private processPool: DataSpaceProcessPool
  ) {}

  /**
   * Get CredentialsManager from DI container
   */
  private get credentialsManager(): CredentialsManager {
    return container.get(CredentialsManager)
  }

  /**
   * Get SpaceRegistry from DI container
   */
  private get spaceRegistry(): SpaceRegistry {
    return container.get(SpaceRegistry)
  }

  public getCurrentSpaceId(): string | null {
    return this.currentSpaceId
  }

  public getDataSpace(): DataSpace | null {
    return this.dataSpaceProxy
  }

  public async reload(): Promise<DataSpace | null> {
    console.log("====== reload data space ======")
    const spaceId = this.currentSpaceId
    if (!spaceId) {
      return null
    }

    this.stopSyncWorker(spaceId)
    await this.processPool.kill(spaceId)
    this.dataSpaceProxy = null
    this.initializationPromise = null

    // Reinitialize with the same space.
    return this.getOrSetDataSpace(spaceId)
  }

  public async close(): Promise<boolean> {
    if (!this.currentSpaceId) {
      return false
    }

    // Terminate the process via pool
    this.processPool.killAll()

    // Stop sync worker
    this.stopSyncWorker(this.currentSpaceId)

    this.dataSpaceProxy = null
    this.currentSpaceId = null
    return true
  }

  public async getOrSetDataSpace(
    spaceId: string,
    syncOptions?: {
      enabled: boolean
      remote?: string
      provider?: string
      requireRemoteClone?: boolean
    }
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

      // Get current sync provider from config
      const spaceInfo = this.spaceRegistry.getSpace(spaceId)
      if (!spaceInfo) {
        throw new Error(`Space not found: ${spaceId}`)
      }

      // Use space's provider if set, otherwise use default
      const providerId =
        syncOptions?.provider ||
        spaceInfo.sync?.provider ||
        this.configManager.getDefaultSyncProvider() ||
        "eidos.space"

      const credentials =
        await this.credentialsManager.getSyncCredentials(providerId)
      const remoteSyncEnabled =
        syncOptions?.enabled ?? spaceInfo.sync?.enabled ?? false
      const graftEnabled =
        remoteSyncEnabled || spaceInfo.versioning?.enabled || false

      const initData: WorkerInitData = {
        spaceInfo,
        paths: {
          spacePath: getSpacePath(spaceId),
          simplePathConfig: { libPath, dictPath },
          vecPathConfig: { libPath: vecLibPath },
          graftPathConfig: {
            libPath: graftLibPath,
            enabled: graftEnabled,
            syncEnabled: remoteSyncEnabled,
            remote: syncOptions?.remote ?? spaceInfo.sync?.remote ?? "",
            credentials,
            provider: providerId,
            requireRemoteClone: syncOptions?.requireRemoteClone,
          },
        },
      }

      const childProcess = await this.processPool.getProcess(spaceId, initData)

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

  private startSyncWorker(
    spaceId: string,
    spaceInfo: any,
    graftPathConfig: any
  ) {
    // Stop existing for this space if any
    this.stopSyncWorker(spaceId)

    // Check if sync is enabled and credentials exist
    const remote = graftPathConfig?.remote || spaceInfo.sync?.remote
    if (
      !graftPathConfig?.syncEnabled ||
      !remote ||
      !graftPathConfig?.credentials?.accessKeyId
    ) {
      log.info("Sync not enabled or missing credentials, skipping sync worker.")
      return
    }
    const remoteSpaceId =
      remote?.split("/").pop()?.split(".")[0] || spaceInfo.id
    const localPath = path.join(getSpacePath(spaceId), ".eidos", "files")
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
      const workerPath = path.join(__dirname, "sync-worker.js")

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
