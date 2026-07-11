import { Module } from "../../common/di"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { GraftCliProcessRunner } from "./graft-cli-runner"
import { GraftRunner } from "./graft-runner"
import { GraftSqliteExecutor } from "./graft-sqlite-executor"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"
import { SpaceVersioningService } from "./space-versioning.service"

@Module({
  imports: [SpaceManagementModule],
  providers: [
    GraftCliProcessRunner,
    GraftSqliteExecutor,
    GraftRunner,
    SpaceVersioningCoordinator,
    SpaceVersioningService,
  ],
  exports: [SpaceVersioningService],
})
export class SpaceVersioningModule {}

export { SpaceVersioningService } from "./space-versioning.service"
export type * from "./types"
