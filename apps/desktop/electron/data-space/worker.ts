import { DataSpace } from "@/packages/core/data-space"
import { BucketClient } from "@/packages/sync/bucket"

import { EidosMessageChannelName } from "@/lib/const"

import type { SpaceInfo } from "../space-registry"
import { createDataEventChannel } from "./data-event-channel"
import { createExternalFileSystem } from "./external-fs"
import { initUDF } from "./init-udf"
import { RpcServer } from "./rpc-server"
import type { InitMessage, WorkerInitData } from "./rpc-types"
import { NodeServerDatabase } from "./sqlite-server"
import { isInitializationOperation } from "./sync/helper"

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
      this.dataSpace.close()
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

    const isInit = isInitializationOperation(spaceInfo)

    // Create sync client if credentials available
    const syncClient = graftPathConfig?.credentials
      ? new BucketClient(graftPathConfig.credentials)
      : undefined

    // Get remote log id if initialization operation
    const remoteLogId = isInit
      ? await this.getRemoteLogId(
          syncClient,
          spaceInfo.sync?.remote,
          graftPathConfig?.credentials?.bucketName
        )
      : undefined

    // Create database with sync support
    const serverDb = await NodeServerDatabase.create(
      {
        spaceInfo: spaceInfo,
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
    const externalFS = await createExternalFileSystem(serverDb, spaceInfo.path)

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
    if (isInit) {
      this.dataSpace.notify({
        title: "Notification",
        description:
          "Space initialized successfully, refresh page to see changes",
        actions: [
          {
            label: "Reload",
            action: "reload",
            variant: "primary",
          },
        ],
      })
    }
    return this.dataSpace
  }

  public async close(): Promise<boolean> {
    if (!this.dataSpace) {
      return false
    }

    // Stop file watcher before closing dataspace
    this.dataSpace.unwatchFileWatcher()

    this.dataSpace.close()
    this.dataSpace = null
    return true
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
