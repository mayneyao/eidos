import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { initializePlayground } from "../file-system/playground"

/**
 * Playground Service - Handles playground initialization
 */
@IpcService("playground")
export class PlaygroundService extends IpcServiceBase {
  /**
   * Initialize a playground for a space and block
   */
  async initialize(
    space: string,
    blockId: string,
    files?: any[]
  ): Promise<any> {
    return initializePlayground(space, blockId, files)
  }
}

// Export singleton instance
export const playgroundService = new PlaygroundService()
