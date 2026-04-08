import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import type { windowManager } from "../window-manager/createWindow"

interface PipelineServiceOptions {
  getWindowManager: () => typeof windowManager
}

/**
 * Pipeline Service - Handles pipeline execution
 */
@IpcService("pipeline")
export class PipelineService extends IpcServiceBase {
  private getWindowManager: () => typeof windowManager

  constructor(options: PipelineServiceOptions) {
    super()
    this.getWindowManager = options.getWindowManager
  }

  /**
   * Run a pipeline with the given steps
   */
  async run(
    steps: any[],
    args: any,
    options?: any
  ): Promise<{
    success: boolean
    result?: any
    logs?: any[]
    rendererLogs?: any[]
    error?: string
  }> {
    try {
      const wm = this.getWindowManager()
      const { result, logs, rendererLogs } = await wm!.pipelineRunner.run(
        steps,
        args,
        options
      )
      return { success: true, result, logs, rendererLogs }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
