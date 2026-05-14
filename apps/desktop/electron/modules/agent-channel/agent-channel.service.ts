import { IpcInjectable, Inject } from "../../common/di"
import { IpcServiceBase, IpcMethod } from "@eidos.space/electron-ipc"
import { ChannelService } from "@/packages/ai/server/channel"
import { ConfigManager } from "../config/config.module"
import { SpaceRegistry } from "../space-management/space-management.module"
import { DataSpaceManager } from "../data-space"
import { LoggerService } from "../logger/logger.module"

@IpcInjectable("agent-channel")
export class AgentChannelService extends IpcServiceBase {
  private channelService: ChannelService | null = null

  constructor(
    @Inject(ConfigManager) private configManager: ConfigManager,
    @Inject(SpaceRegistry) private spaceRegistry: SpaceRegistry,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(LoggerService) private logger: LoggerService
  ) {
    super()
    this.logger.setPrefix("AgentChannel")
  }

  /**
   * Initialize and start the channel services
   */
  async start(): Promise<void> {
    if (this.channelService) return

    this.logger.info("Initializing AI Channels...")

    this.channelService = new ChannelService({
      getDataspace: (spaceId: string) =>
        this.dataSpaceManager.getOrSetDataSpace(spaceId),
      getAIConfig: () => this.configManager.get("ai"),
      spaceRegistry: {
        validateSpace: (spaceId: string) =>
          this.spaceRegistry.validateSpace(spaceId),
      },
    })

    try {
      await this.channelService.start()
      this.logger.info("AI Channels started successfully")
    } catch (err) {
      this.logger.error("Failed to start AI Channels:", err)
    }
  }

  /**
   * Stop all channel services
   */
  async stop(): Promise<void> {
    if (this.channelService) {
      await this.channelService.stop()
      this.channelService = null
      this.logger.info("AI Channels stopped")
    }
  }

  /**
   * Get the running status of channels
   */
  @IpcMethod()
  getStatus() {
    return {
      telegram: {
        running: this.channelService?.isRunning() ?? false,
      },
    }
  }
}
