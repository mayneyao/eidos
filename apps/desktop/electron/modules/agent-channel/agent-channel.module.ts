import { Module } from "../../common/di"
import { AgentChannelService } from "./agent-channel.service"

@Module({
  providers: [AgentChannelService],
  exports: [AgentChannelService],
})
export class AgentChannelModule {}
