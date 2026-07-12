import { Module } from "../../common/di"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { SpaceMigrationService } from "./space-migration.service"

@Module({
  imports: [SpaceManagementModule],
  providers: [SpaceMigrationService],
  exports: [SpaceMigrationService],
})
export class SpaceMigrationModule {}

export { SpaceMigrationService } from "./space-migration.service"
