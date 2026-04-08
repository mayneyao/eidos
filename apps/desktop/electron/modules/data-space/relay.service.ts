import {
  IpcService,
  IpcServiceBase,
  IpcMethod,
} from "@eidos.space/electron-ipc"

import { Injectable, Inject } from "../../common/di"
import { DataSpaceProcessPool } from "./data-space-process-pool.service"

/**
 * Relay Service - Handles relay message operations
 *
 * Responsibilities:
 * - Pull relay messages for a space
 * - Get/ack relay messages via the process pool
 */
@IpcService("relay")
@Injectable()
export class RelayService extends IpcServiceBase {
  constructor(
    @Inject(DataSpaceProcessPool) private processPool: DataSpaceProcessPool
  ) {
    super()
  }

  /**
   * Pull relay messages for a space
   */
  @IpcMethod()
  async pullRelayMessages(spaceId: string): Promise<{ success: boolean }> {
    this.processPool.sendToProcess(spaceId, { type: "pull-relay-messages" })
    return { success: true }
  }

  /**
   * Get relay messages for a space
   */
  @IpcMethod()
  async getRelayMessages(spaceId: string, data: any): Promise<any> {
    return this.processPool.callProcess(spaceId, "get-relay-messages", data)
  }

  /**
   * Acknowledge relay messages
   */
  @IpcMethod()
  async ackRelayMessages(spaceId: string, data: any): Promise<any> {
    return this.processPool.callProcess(spaceId, "ack-relay-messages", data)
  }

  /**
   * Get relay channel counts
   */
  @IpcMethod()
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
  @IpcMethod()
  async getRelayTotalCounts(spaceId: string): Promise<any> {
    return this.processPool.callProcess(spaceId, "get-relay-total-counts", {})
  }
}
