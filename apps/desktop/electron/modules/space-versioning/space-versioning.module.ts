import { Module } from "../../common/di"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { GraftCliRunner } from "./graft-cli-runner"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import { SpaceVersioningService } from "./space-versioning.service"

@Module({
  imports: [SpaceManagementModule],
  providers: [
    GraftCliRunner,
    SpaceVersioningCoordinator,
    SpaceVersioningService,
  ],
  exports: [SpaceVersioningService],
})
export class SpaceVersioningModule {}

export { SpaceVersioningService } from "./space-versioning.service"
export type * from "./types"
