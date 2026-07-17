import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { FileExtensionModule } from "../file-extensions/file-extension.module"
import { FileSpaceAgentService } from "./file-space-agent.service"
import { SpaceVersioningModule } from "../space-versioning/space-versioning.module"

@Module({
  imports: [
    ConfigModule,
    SpaceManagementModule,
    FileExtensionModule,
    SpaceVersioningModule,
  ],
  providers: [FileSpaceAgentService],
  exports: [FileSpaceAgentService],
})
export class FileSpaceAgentModule {}

export { FileSpaceAgentService } from "./file-space-agent.service"
