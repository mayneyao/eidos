import { DataSpace } from "@/packages/core/data-space"
import { BucketClient } from "@/packages/sync/bucket"

import { EidosMessageChannelName } from "@/lib/const"

import type { SpaceInfo } from "../space-registry"
import { createDataEventChannel } from "./data-event-channel"
import { createExternalFileSystem } from "./external-fs/external-fs"
import { initUDF } from "./init-udf"
import { RpcServer } from "./rpc/rpc-server"
import type { InitMessage, WorkerInitData } from "./rpc/rpc-types"
import { NodeServerDatabase } from "./sqlite-server"
import { isInitializationOperation } from "./sync/helper"
import { RelayClient } from "./relay-client"
import { RelayDispatcher } from "./relay-dispatcher"

function requestAccessToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).substr(2, 9)
    const port = process.parentPort
    if (!port) return resolve(null)

    const responseHandler = (event: any) => {
      if (
        event.data.type === "access-token-response" &&
        event.data.requestId === requestId
      ) {
        port.off("message", responseHandler)
        resolve(event.data.token)
      }
    }

    port.on("message", responseHandler)
    port.postMessage({ type: "get-access-token", requestId })

    setTimeout(() => {
      port.off("message", responseHandler)
      resolve(null)
    }, 5000)
  })
}

// Logger that forwards messages to main process
function createLogger() {
  const log = (level: string, message: any, ...args: any[]) => {
    const port = process.parentPort
    if (port) {
      port.postMessage({
        type: "log",
        level,
        message:
          typeof message === "string" ? message : JSON.stringify(message),
        args: args.map((arg) =>
          typeof arg === "string" ? arg : JSON.stringify(arg)
        ),
        timestamp: new Date().toISOString(),
      })
    }
  }

  return {
    info: (message: any, ...args: any[]) => log("info", message, ...args),
    warn: (message: any, ...args: any[]) => log("warn", message, ...args),
    error: (message: any, ...args: any[]) => log("error", message, ...args),
    debug: (message: any, ...args: any[]) => log("debug", message, ...args),
    log: (message: any, ...args: any[]) => log("log", message, ...args),
  }
}

// Global logger instance
const logger = createLogger()

// Global config variables (initialized via init message)
let spacePath: string | undefined
let simplePathConfig: WorkerInitData["paths"]["simplePathConfig"] | undefined
let vecPathConfig: WorkerInitData["paths"]["vecPathConfig"] | undefined
let graftPathConfig: WorkerInitData["paths"]["graftPathConfig"] | undefined
let spaceInfo: SpaceInfo | undefined

class DataSpaceManager {
  private static instance: DataSpaceManager
  private dataSpace: DataSpace | null = null
  private relayClient: RelayClient | null = null
  private relayDispatcher: RelayDispatcher | null = null
  private relayChannelMap: Map<string, string> = new Map() // channelId -> relayId
  private _spaceInfo: SpaceInfo | undefined // Internal copy of spaceInfo

  private constructor() {}

  public static getInstance(): DataSpaceManager {
    if (!DataSpaceManager.instance) {
      DataSpaceManager.instance = new DataSpaceManager()
    }
    return DataSpaceManager.instance
  }

  public getDataSpace(): DataSpace | null {
    return this.dataSpace
  }

  private async getRemoteLogId(
    syncClient: BucketClient | undefined,
    remote: string | undefined,
    bucketName: string
  ) {
    if (!syncClient || !remote) {
      return undefined
    }
    const remoteSpaceName = remote.split("/").pop()?.split(".")[0]
    const prefix = remoteSpaceName
      ? `${remoteSpaceName}/.eidos/.graft/logs/`
      : ""
    const remoteLogIds = await syncClient.listSubFolders(bucketName, prefix)
    if (!remoteLogIds.length) {
      return undefined
    }
    const remoteLogIdPath = remoteLogIds[0]
    logger.debug("remoteLogIdPath", remoteLogIdPath)
    const remoteLogId = remoteLogIdPath.split("/").filter(Boolean).pop()
    logger.debug("remoteLogId", remoteLogId)
    return remoteLogId
  }

  public async getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
    if (this.dataSpace && this.dataSpace.dbName !== spaceName) {
      // Close both main and draft databases when switching to a different space
      // Also stop relay client to avoid multiple relay clients running simultaneously
      await this.close()
    } else if (this.dataSpace) {
      // If same space, return existing instance
      return this.dataSpace
    }
    logger.info("init space", spaceName)

    if (
      !spaceInfo ||
      !simplePathConfig ||
      !vecPathConfig ||
      !graftPathConfig ||
      !spacePath
    ) {
      throw new Error("Worker configuration is not initialized")
    }

    this._spaceInfo = spaceInfo // Store the global spaceInfo locally
    const isInit = isInitializationOperation(this._spaceInfo)

    // Create sync client if credentials available
    const syncClient = graftPathConfig?.credentials
      ? new BucketClient(graftPathConfig.credentials)
      : undefined

    // Get remote log id if initialization operation
    const remoteLogId = isInit
      ? await this.getRemoteLogId(
          syncClient,
          this._spaceInfo.sync?.remote,
          graftPathConfig?.credentials?.bucketName
        )
      : undefined

    // Create database with sync support
    const serverDb = await NodeServerDatabase.create(
      {
        spaceInfo: this._spaceInfo,
        remoteLogId: remoteLogId,
        options: {
          readonly: false, // Worker can have full access
        },
      },
      {
        simple: simplePathConfig,
        vec: vecPathConfig,
        graft: graftPathConfig,
        spacePath: spacePath,
        logger: logger,
      }
    )

    // Create external file system with space info
    const externalFS = await createExternalFileSystem(
      serverDb,
      this._spaceInfo.path
    )

    // Create data event channel
    const dataEventChannel = createDataEventChannel(
      (channel: string, data: any) => {
        const port = process.parentPort
        if (port) {
          port.postMessage({
            type: "forward-to-renderer",
            channel,
            data,
          })
        }
      }
    )

    this.dataSpace = new DataSpace({
      db: serverDb,
      activeUndoManager: false,
      dbName: spaceName,
      context: {
        setInterval,
      },
      createUDF: initUDF,
      postMessage: (data: any, transfer?: any[]) => {
        const port = process.parentPort
        if (port) {
          port.postMessage({
            type: "forward-to-renderer",
            channel: EidosMessageChannelName,
            data,
          })
        }
      },
      // TODO: remove this, use dataeventchannel instead
      callRenderer: (type: any, data: any) => {
        return new Promise((resolve, reject) => {
          const requestId = Math.random().toString(36).substr(2, 9)
          const port = process.parentPort

          if (!port) {
            reject(new Error("No parent port available"))
            return
          }

          // Set up response listener
          const responseHandler = (event: any) => {
            const payload = event.data
            if (
              payload.type === "renderer-response" &&
              payload.requestId === requestId
            ) {
              port.off("message", responseHandler)
              resolve(payload.data)
            }
          }

          port.on("message", responseHandler)

          // Send request to main process
          port.postMessage({
            type: "call-renderer",
            requestId,
            channel: EidosMessageChannelName,
            data: { type, data },
          })

          // Timeout after 30 seconds
          setTimeout(() => {
            port.off("message", responseHandler)
            reject(new Error("callRenderer timeout"))
          }, 30000)
        })
      },
      dataEventChannel: dataEventChannel,
      externalFS: externalFS,
      enableFTS: true,
      syncClient: syncClient,
    })

    this.dataSpace.initFileWatcher()

    // Start relay clients if enabled
    if (
      this._spaceInfo.relay?.enabled &&
      this._spaceInfo.relay.channels.length > 0
    ) {
      this.initRelay(this._spaceInfo)
    }

    return this.dataSpace
  }

  public async close(): Promise<boolean> {
    if (!this.dataSpace) {
      return false
    }

    // Stop file watcher before closing dataspace
    this.dataSpace.unwatchFileWatcher()

    if (this.relayClient) {
      this.relayClient.stop()
      this.relayClient = null
    }

    if (this.relayDispatcher) {
      this.relayDispatcher.close()
      this.relayDispatcher = null
    }
    this.relayChannelMap.clear()

    this.dataSpace.close()
    this.dataSpace = null
    return true
  }

  private async asyncInitRelay(info: SpaceInfo) {
    // 1. Clear existing client
    if (this.relayClient) {
      this.relayClient.stop()
      this.relayClient = null
    }

    if (this.relayDispatcher) {
      this.relayDispatcher.close()
      this.relayDispatcher = null
    }
    this.relayChannelMap.clear()

    // 2. Get all enabled relay channel IDs
    if (!info.relay?.enabled) return

    const channels = info.relay.channels
    if (channels.length === 0) return

    // Build channel ID -> relay ID mapping for callbacks
    const channelIds: string[] = []
    for (const channel of channels) {
      channelIds.push(channel.id)
      this.relayChannelMap.set(channel.id, channel.id)
    }

    // 3. Start unified RelayClient for all channels
    this.relayDispatcher = new RelayDispatcher(info.path)

    this.relayClient = new RelayClient(
      info.path,
      channelIds,
      requestAccessToken,
      (channelId, count) => {
        const relayId = this.relayChannelMap.get(channelId) || channelId
        // Notify primary (main) process to broadcast to renderer
        process.parentPort?.postMessage({
          type: "forward-to-renderer",
          channel: "relay-messages-ready",
          data: {
            spaceId: info.id,
            relayId: relayId,
            count,
          },
        })
      }
    )
    this.relayClient.start()

    // 4. Check for pending messages in inbox and notify renderer
    // This handles the case where messages arrived before a handler script was bound
    setTimeout(() => {
      this.notifyPendingMessages(info)
    }, 1000) // Delay to ensure RelayClient has completed initial pull
  }

  /**
   * Check for pending messages and notify renderer to process them
   * Called after relay initialization to handle backlog
   */
  private notifyPendingMessages(info: SpaceInfo) {
    if (!this.relayDispatcher) return

    const channelsWithHandler =
      info.relay?.channels?.filter((c: any) => c.handlerScriptId) || []

    for (const channel of channelsWithHandler) {
      const pendingCount = this.relayDispatcher.getPendingMessages(
        channel.id
      ).length
      if (pendingCount > 0) {
        logger.info(
          `[DataSpaceManager] Found ${pendingCount} pending messages for channel ${channel.id}, notifying renderer`
        )
        process.parentPort?.postMessage({
          type: "forward-to-renderer",
          channel: "relay-messages-ready",
          data: {
            spaceId: info.id,
            relayId: channel.id,
            count: pendingCount,
          },
        })
      }
    }
  }

  private initRelay(info: SpaceInfo) {
    this.asyncInitRelay(info).catch((e) => {
      logger.error("[DataSpaceManager] Failed to init relay clients:", e)
    })
  }

  public setSpaceInfo(info: SpaceInfo) {
    this._spaceInfo = info // Update internal spaceInfo
    this.initRelay(info)
  }

  public async pullRelayMessages(relayId?: string): Promise<void> {
    if (!this.relayClient) {
      console.warn(`[DataSpaceManager] RelayClient is not active.`)
      return
    }

    if (relayId) {
      // Pull from specific channel
      await this.relayClient.pullMessages(relayId)
    } else {
      // Pull from all channels
      const channels = Array.from(this.relayChannelMap.keys())
      for (const channelId of channels) {
        await this.relayClient.pullMessages(channelId)
      }
    }
  }

  public getRelayMessages(channelId?: string) {
    if (this.relayDispatcher) {
      return this.relayDispatcher.getPendingMessages(channelId)
    }
    return []
  }

  public ackRelayMessages(acked: string[], retry: string[]) {
    if (this.relayDispatcher) {
      if (acked) this.relayDispatcher.ackMessages(acked)
      if (retry) this.relayDispatcher.retryMessages(retry)
      return { success: true }
    }
    return { success: false, error: "Dispatcher not initialized" }
  }

  public getRelayChannelCounts(channelId: string): {
    pending: number
    deadLetter: number
  } {
    if (this.relayDispatcher) {
      return this.relayDispatcher.getChannelCounts(channelId)
    }
    return { pending: 0, deadLetter: 0 }
  }

  public getRelayTotalCounts(): { pending: number; deadLetter: number } {
    if (this.relayDispatcher) {
      return this.relayDispatcher.getTotalCounts()
    }
    return { pending: 0, deadLetter: 0 }
  }
}

// Export convenience functions
function getDataSpace(): DataSpace | null {
  return DataSpaceManager.getInstance().getDataSpace()
}

function getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
  return DataSpaceManager.getInstance().getOrSetDataSpace(spaceName)
}

const communicationPort = process.parentPort

if (communicationPort) {
  // Initialize RPC Server
  new RpcServer(() => getDataSpace(), communicationPort as any)

  communicationPort.on("message", async (event: any) => {
    const payload = event.data
    if (payload.type === "init") {
      const initMsg = payload as InitMessage
      logger.info("Worker received init config")
      spacePath = initMsg.paths.spacePath
      simplePathConfig = initMsg.paths.simplePathConfig
      vecPathConfig = initMsg.paths.vecPathConfig
      graftPathConfig = initMsg.paths.graftPathConfig
      spaceInfo = initMsg.spaceInfo
      await getOrSetDataSpace(initMsg.spaceId)
      communicationPort.postMessage({ type: "worker-ready" })
      return
    }

    if (payload.type === "pull-relay-messages") {
      logger.info("Worker received manual pull request for relay messages")
      await DataSpaceManager.getInstance().pullRelayMessages(payload.relayId)
      return
    }

    if (payload.type === "update-space-info") {
      logger.info("Worker received updated space info dynamically")
      spaceInfo = payload.spaceInfo
      DataSpaceManager.getInstance().setSpaceInfo(payload.spaceInfo)
      return
    }

    if (payload.type === "rpc-request") {
      const { method, data, id } = payload
      try {
        let result
        if (method === "get-relay-messages") {
          result = DataSpaceManager.getInstance().getRelayMessages(
            data?.channelId
          )
        } else if (method === "ack-relay-messages") {
          const { acked, retry } = data
          result = DataSpaceManager.getInstance().ackRelayMessages(acked, retry)
        } else if (method === "get-relay-channel-counts") {
          result = DataSpaceManager.getInstance().getRelayChannelCounts(
            data?.channelId
          )
        } else if (method === "get-relay-total-counts") {
          result = DataSpaceManager.getInstance().getRelayTotalCounts()
        } else {
          result = { success: false, error: `Unknown method: ${method}` }
        }

        communicationPort.postMessage({
          type: "rpc-response",
          id,
          result: result ?? null,
        })
      } catch (error) {
        logger.error(`[Worker] RPC error for method ${method}:`, error)
        communicationPort.postMessage({
          type: "rpc-response",
          id,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      }
      return
    }
  })
}

process.on("exit", async (code) => {
  logger.info(`Worker is exiting with code ${code}`)
  await DataSpaceManager.getInstance().close()
})

process.on("beforeExit", async () => {
  logger.info("worker beforeExit")
  await DataSpaceManager.getInstance().close()
})
