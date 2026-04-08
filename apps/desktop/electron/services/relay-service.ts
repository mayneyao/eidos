import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { DataSpaceProcessPool } from "./data-space/data-space-process-pool"

/**
 * Relay Service - Handles relay message operations
 */
@IpcService("relay")
export class RelayService extends IpcServiceBase {
  /**
   * Pull relay messages for a space
   */
  async pullRelayMessages(spaceId: string): Promise<{ success: boolean }> {
    const processPool = DataSpaceProcessPool.getInstance()
    processPool.sendToProcess(spaceId, { type: "pull-relay-messages" })
    return { success: true }
  }

  /**
   * Get relay messages for a space
   */
  async getRelayMessages(spaceId: string, data: any): Promise<any> {
    const processPool = DataSpaceProcessPool.getInstance()
    return processPool.callProcess(spaceId, "get-relay-messages", data)
  }

  /**
   * Acknowledge relay messages
   */
  async ackRelayMessages(spaceId: string, data: any): Promise<any> {
    const processPool = DataSpaceProcessPool.getInstance()
    return processPool.callProcess(spaceId, "ack-relay-messages", data)
  }

  /**
   * Get relay channel counts
   */
  async getRelayChannelCounts(spaceId: string, data: any): Promise<any> {
    const processPool = DataSpaceProcessPool.getInstance()
    return processPool.callProcess(spaceId, "get-relay-channel-counts", data)
  }

  /**
   * Get relay total counts
   */
  async getRelayTotalCounts(spaceId: string): Promise<any> {
    const processPool = DataSpaceProcessPool.getInstance()
    return processPool.callProcess(spaceId, "get-relay-total-counts", {})
  }
}

// Export singleton instance
export const relayService = new RelayService()
