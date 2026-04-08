import { IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../common/di"
import { DataSpaceProcessPool } from "./data-space-process-pool.service"

/**
 * Relay Service - Handles relay message operations
 *
 * Responsibilities:
 * - Pull relay messages for a space
 * - Get/ack relay messages via the process pool
 */
@IpcInjectable("relay")
export class RelayService extends IpcServiceBase {
  constructor(
    @Inject(DataSpaceProcessPool) private processPool: DataSpaceProcessPool
  ) {
    super()
  }

  /**
   * Pull relay messages for a space
   */
  async pullRelayMessages(spaceId: string): Promise<{ success: boolean }> {
    this.processPool.sendToProcess(spaceId, { type: "pull-relay-messages" })
    return { success: true }
  }

  /**
   * Get relay messages for a space
   */
  async getRelayMessages(spaceId: string, data: any): Promise<any> {
    return this.processPool.callProcess(spaceId, "get-relay-messages", data)
  }

  /**
   * Acknowledge relay messages
   */
  async ackRelayMessages(spaceId: string, data: any): Promise<any> {
    return this.processPool.callProcess(spaceId, "ack-relay-messages", data)
  }

  /**
   * Get relay channel counts
   */
  async getRelayChannelCounts(spaceId: string, data: any): Promise<any> {
    return this.processPool.callProcess(
      spaceId,
      "get-relay-channel-counts",
      data
    )
  }

  /**
   * Get relay total counts
   */
  async getRelayTotalCounts(spaceId: string): Promise<any> {
    return this.processPool.callProcess(spaceId, "get-relay-total-counts", {})
  }
}
