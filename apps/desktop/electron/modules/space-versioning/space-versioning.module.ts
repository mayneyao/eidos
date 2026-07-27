import { Module } from "../../common/di"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { SyncModule } from "../sync/sync.module"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import { SpaceVersioningService } from "./space-versioning.service"

@Module({
  imports: [SpaceManagementModule, SyncModule],
  providers: [SpaceVersioningCoordinator, SpaceVersioningService],
  exports: [SpaceVersioningService],
})
export class SpaceVersioningModule {}

export { SpaceVersioningService } from "./space-versioning.service"
export type * from "./types"
