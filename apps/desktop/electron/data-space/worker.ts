import { workerData } from "worker_threads"
import { DataSpace } from "@/packages/core/data-space"

import { EidosMessageChannelName } from "@/lib/const"

import type { SpaceInfo } from "../space-registry"
import { NodeServerDatabase } from "../sqlite-server"
import { createDataEventChannel } from "./data-event-channel"
import { createExternalFileSystem } from "./external-fs"
import { initUDF } from "./init-udf"
import { RpcServer } from "./rpc-server"

// Config can be set via workerData (threads) or argv (process) or message (IPC)
let config: any = workerData

try {
  if (!config && process.argv[2]) {
    config = JSON.parse(process.argv[2])
  }
} catch (e) {
  console.error("Failed to parse config from argv", e)
}

// Global config variables
let spacePath = config?.spacePath
let simplePathConfig = config?.simplePathConfig
let vecPathConfig = config?.vecPathConfig
let graftPathConfig = config?.graftPathConfig
let spaceInfo: SpaceInfo = config?.spaceInfo

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

  public async getOrSetDataSpace(spaceName: string): Promise<DataSpace> {
    if (this.dataSpace && this.dataSpace.dbName !== spaceName) {
      // Close both main and draft databases when switching to a different space
      this.dataSpace.close()
    } else if (this.dataSpace) {
      // If same space, return existing instance
      return this.dataSpace
    }
    console.log("init space", spaceName)

    // Create database with sync support
    const serverDb = await NodeServerDatabase.create(
      {
        spaceInfo: spaceInfo,
        options: {
          readonly: false, // Worker can have full access
        },
      },
      {
        simple: simplePathConfig,
        vec: vecPathConfig,
        graft: graftPathConfig,
        spacePath: spacePath,
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
          const requestId = Math.random().toString(36).substr(2, 9);
          const port = process.parentPort;

          if (!port) {
            reject(new Error("No parent port available"));
            return;
          }

          // Set up response listener
          const responseHandler = (event: any) => {
            const payload = event.data;
            if (payload.type === 'renderer-response' && payload.requestId === requestId) {
              port.off('message', responseHandler);
              resolve(payload.data);
            }
          };

          port.on('message', responseHandler);

          // Send request to main process
          port.postMessage({
            type: "call-renderer",
            requestId,
            channel: EidosMessageChannelName,
            data: { type, data }
          });

          // Timeout after 30 seconds
          setTimeout(() => {
            port.off('message', responseHandler);
            reject(new Error("callRenderer timeout"));
          }, 30000);
        });
      },
      dataEventChannel: dataEventChannel,
      externalFS: externalFS,
      enableFTS: true,
    })

    this.dataSpace.initFileWatcher()
    return this.dataSpace
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
      console.log("Worker received init config")
      spacePath = payload.paths.spacePath
      simplePathConfig = payload.paths.simplePathConfig
      vecPathConfig = payload.paths.vecPathConfig
      graftPathConfig = payload.paths.graftPathConfig
      spaceInfo = payload.spaceInfo
      await getOrSetDataSpace(payload.spaceId)
      return
    }
  })
}

process.on("exit", async (code) => {
  console.log(`Worker is exiting with code ${code}`)
  await DataSpaceManager.getInstance().close()
})

process.on("beforeExit", async () => {
  console.log("worker beforeExit")
  await DataSpaceManager.getInstance().close()
})
