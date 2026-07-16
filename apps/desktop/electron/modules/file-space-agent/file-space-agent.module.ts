import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { FileSpaceAgentService } from "./file-space-agent.service"

@Module({
  imports: [ConfigModule, SpaceManagementModule],
  providers: [FileSpaceAgentService],
  exports: [FileSpaceAgentService],
})
export class FileSpaceAgentModule {}

export { FileSpaceAgentService } from "./file-space-agent.service"
