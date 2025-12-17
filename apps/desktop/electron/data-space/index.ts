import { DataSpace } from "@/packages/core/data-space"
import Database from "@eidos.space/better-sqlite3"
import { ipcMain, type WebContents } from "electron"

import { EidosMessageChannelName } from "@/lib/const"

import { embedding } from "../data-space-context"
import { win } from "../main"
import { getSpaceRegistry } from "../space-registry"
import { NodeBaseServerDatabase } from "../sqlite-server/base"
import { createDataEventChannel } from "./data-event-channel"
import { createDatabase } from "./database"
import { createExternalFileSystem } from "./external-fs"
import { initUDF } from "./init-udf"

function requestFromRenderer(webContents: WebContents, arg: any) {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substr(2, 9)

    ipcMain.once(`response-${requestId}`, (event: any, result: any) => {
      resolve(result)
    })

    webContents.send("request-from-main", requestId, arg)
  })
}

export class DataSpaceManager {
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

  public async reload(): Promise<DataSpace | null> {
    //

    console.log("====== reload data space ======")
    if (!this.dataSpace) {
      return null
    }

    const spaceName = this.dataSpace.dbName
    // Close current dataspace
    this.dataSpace.close()
    this.dataSpace = null

    // Reinitialize with the same space name
    return this.getOrSetDataSpace(spaceName)
  }

  public async close(): Promise<boolean> {
    if (!this.dataSpace) {
      return false
    }

    // Stop file watcher before closing dataspace
    this.dataSpace.unwatchFileWatcher()

    // Close current dataspace
    this.dataSpace.close()
    this.dataSpace = null
    return true
  }

  public async getOrSetDataSpace(
    spaceId: string,
    syncOptions?: { enabled: boolean; remote?: string; volumeId?: string }
  ): Promise<DataSpace> {
    if (this.dataSpace && this.dataSpace.dbName !== spaceId) {
      // Close both main and draft databases when switching to a different space
      this.dataSpace.close()
    } else if (this.dataSpace) {
      // If same space, return existing instance
      return this.dataSpace
    }

    console.log("init space", spaceId)

    // Create database
    const serverDb = await createDatabase({
      spaceId,
      enableSync: syncOptions?.enabled ?? false,
      syncOptions,
    })

    // Create external file system
    const externalFS = await createExternalFileSystem(spaceId, serverDb)

    // Create data event channel
    const dataEventChannel = createDataEventChannel()

    this.dataSpace = new DataSpace({
      db: serverDb,
      activeUndoManager: false,
      dbName: spaceId,
      context: {
        setInterval,
        embedding,
      },
      createUDF: initUDF,
      hasLoadExtension: true,
      postMessage: (data: any, transfer?: any[]) => {
        win?.webContents.send(EidosMessageChannelName, data, transfer)
      },
      callRenderer: (type: any, data: any) => {
        return requestFromRenderer(win!.webContents, { type, data })
      },
      dataEventChannel: dataEventChannel,
      externalFS: externalFS,
      draftDb: new NodeBaseServerDatabase(new Database(":memory:")),
      enableFTS: true,
    })

    this.dataSpace.initFileWatcher()
    return this.dataSpace
  }
}

// Export convenience functions
export function getDataSpace(): DataSpace | null {
  return DataSpaceManager.getInstance().getDataSpace()
}

export function getOrSetDataSpace(spaceId: string): Promise<DataSpace> {
  const spaceInfo = getSpaceRegistry().getSpace(spaceId)
  if (!spaceInfo) {
    throw new Error(`Space not found: ${spaceId}`)
  }

  return DataSpaceManager.getInstance().getOrSetDataSpace(
    spaceId,
    spaceInfo.sync
  )
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
