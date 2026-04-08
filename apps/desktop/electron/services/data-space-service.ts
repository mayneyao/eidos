import type { IpcMainInvokeEvent } from "electron"
import electronLog from "electron-log"
import { MsgType } from "@/lib/const"
import {
  IpcMethod,
  IpcService,
  IpcServiceBase,
} from "@eidos.space/electron-ipc"
import {
  closeDataSpace,
  getCurrentSpaceId,
  getDataSpace,
  getOrSetDataSpace,
  reloadDataSpace,
} from "../core/data-space"

interface SqlitePayload {
  id: string
  data: {
    space?: string
    dbName?: string
    method?: string
    params?: any[]
  }
}

interface SwitchDatabaseArgs {
  databaseName: string
  id: string
}

interface SpaceOperationArgs {
  spaceName: string
}

/**
 * Data Space Service - Handles SQLite database operations and sync
 * Uses "decorated" expose mode: only methods with @IpcMethod are auto-registered
 * Note: sqliteMsg and sqliteMsgRead are manually registered in main.ts
 */
@IpcService("space", { exposeMode: "decorated" })
export class DataSpaceService extends IpcServiceBase {
  /**
   * Handle SQLite message (write operations)
   */
  async sqliteMsg(
    event: IpcMainInvokeEvent,
    payload: SqlitePayload
  ): Promise<any> {
    try {
      let dataSpace = getDataSpace()
      const { space, dbName } = payload.data
      const spaceId = space || dbName

      if (!spaceId) {
        throw new Error("No space ID provided in sqlite-msg")
      }

      const currentSpaceId = getCurrentSpaceId()
      if (!dataSpace || !currentSpaceId) {
        dataSpace = await getOrSetDataSpace(spaceId)
      } else if (spaceId !== currentSpaceId) {
        electronLog.info("switching to data space", spaceId)
        dataSpace = await getOrSetDataSpace(spaceId)
      }

      if (!dataSpace) {
        throw new Error("Failed to initialize data space")
      }

      const res = await (dataSpace as any)._executePayload(
        payload.data,
        payload.id,
        (msg: any) => {
          event.sender.send(`sqlite-iterator-${payload.id}`, msg)
        }
      )

      return res
    } catch (error) {
      console.error("sqlite-msg error:", error)

      // Special handling for "An object could not be cloned" error
      if (
        error instanceof Error &&
        error.message.includes("An object could not be cloned")
      ) {
        console.error("CLONING ERROR DETAILS:")
        console.error("- Error message:", error.message)
        console.error("- Error stack:", error.stack)
        console.error("- Payload method:", payload.data?.method)
        console.error("- Payload params count:", payload.data?.params?.length)
        console.error("- Payload params:", payload.data?.params)

        // Try to inspect the payload data
        try {
          console.error("- Payload data keys:", Object.keys(payload.data || {}))
          console.error(
            "- Payload data types:",
            Object.fromEntries(
              Object.entries(payload.data || {}).map(([k, v]) => [k, typeof v])
            )
          )
        } catch (inspectError) {
          console.error("- Failed to inspect payload:", inspectError)
        }
      }

      throw error
    }
  }

  /**
   * Handle SQLite message (read operations)
   */
  async sqliteMsgRead(
    event: IpcMainInvokeEvent,
    payload: SqlitePayload
  ): Promise<any> {
    try {
      let dataSpace = getDataSpace()
      const { space, dbName } = payload.data
      const spaceId = space || dbName

      if (!spaceId) {
        throw new Error("No space ID provided in sqlite-msg-read")
      }

      const currentSpaceId = getCurrentSpaceId()
      if (!dataSpace || !currentSpaceId) {
        dataSpace = await getOrSetDataSpace(spaceId)
      } else if (spaceId !== currentSpaceId) {
        electronLog.info("switching to data space", spaceId)
        dataSpace = await getOrSetDataSpace(spaceId)
      }

      if (!dataSpace) {
        throw new Error("Failed to initialize data space")
      }

      const res = await (dataSpace as any)._executePayload(
        payload.data,
        payload.id,
        (msg: any) => {
          event.sender.send(`sqlite-iterator-${payload.id}`, msg)
        }
      )

      return res
    } catch (error) {
      console.error("sqlite-msg-read error:", error)

      // Special handling for "An object could not be cloned" error
      if (
        error instanceof Error &&
        error.message.includes("An object could not be cloned")
      ) {
        console.error("CLONING ERROR DETAILS:")
        console.error("- Error message:", error.message)
        console.error("- Error stack:", error.stack)
        console.error("- Payload method:", payload.data?.method)
        console.error("- Payload params count:", payload.data?.params?.length)
        console.error("- Payload params:", payload.data?.params)
        console.error(
          "- Payload data keys:",
          payload.data ? Object.keys(payload.data) : "no data"
        )
        console.error(
          "- Payload data types:",
          payload.data
            ? Object.fromEntries(
                Object.entries(payload.data).map(([k, v]) => [k, typeof v])
              )
            : "no data"
        )
      }

      throw error
    }
  }

  /**
   * Switch database
   */
  @IpcMethod()
  async switchDatabase(
    args: SwitchDatabaseArgs
  ): Promise<{ id: string; data: { dbName: string } }> {
    const { databaseName, id } = args
    const data = { dbName: databaseName }
    getOrSetDataSpace(databaseName)
    return { id, data }
  }

  /**
   * Pull sync data
   */
  @IpcMethod()
  async pull(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.pull()
  }

  /**
   * Push sync data
   */
  @IpcMethod()
  async push(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.push()
  }

  /**
   * Fetch sync data
   */
  @IpcMethod()
  async fetch(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.fetch()
  }

  /**
   * Hydrate sync data
   */
  @IpcMethod()
  async hydrate(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.hydrate()
  }

  /**
   * Create snapshot
   */
  @IpcMethod()
  async snapshot(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.snapshot()
  }

  /**
   * Get sync status
   */
  @IpcMethod()
  async status(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.status()
  }

  /**
   * Get volumes
   */
  @IpcMethod()
  async volumes(args: SpaceOperationArgs): Promise<any> {
    const { spaceName } = args
    const dataSpace = await getOrSetDataSpace(spaceName)
    return dataSpace?.volumes()
  }

  /**
   * Create space
   */
  @IpcMethod()
  async createSpace(
    args: SpaceOperationArgs & { enableSync?: boolean }
  ): Promise<{ data: { spaceName: string }; success: boolean }> {
    const { spaceName, enableSync } = args
    const data = { spaceName }
    const dataSpace = await getOrSetDataSpace(spaceName)
    if (dataSpace) {
      return { data, success: true }
    } else {
      return { data, success: false }
    }
  }

  /**
   * Reload query worker
   */
  @IpcMethod()
  async reloadQueryWorker(): Promise<{ success: boolean }> {
    console.log("prepare for import")
    // Importing CSV will enable exclusive locks, causing read-only sqlite worker queries to timeout.
    // We directly shut down all workers before importing CSV
    return { success: true }
  }

  /**
   * Reload data space
   */
  @IpcMethod()
  async reloadDataSpace() {
    return reloadDataSpace()
  }

  /**
   * Close data space
   */
  @IpcMethod()
  async closeDataSpace() {
    return closeDataSpace()
  }
}

// Export singleton instance
export const dataSpaceService = new DataSpaceService()
