import { Module } from "../../common/di"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { FileExtensionService } from "./file-extension.service"

@Module({
  imports: [SpaceManagementModule],
  providers: [FileExtensionService],
  exports: [FileExtensionService],
})
export class FileExtensionModule {}

export { FileExtensionService } from "./file-extension.service"
export type * from "./types"
