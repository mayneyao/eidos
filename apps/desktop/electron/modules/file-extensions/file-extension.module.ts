import { Module } from "../../common/di"
import { SpaceManagementModule } from "../space-management/space-management.module"
import { FileExtensionService } from "./file-extension.service"
import { ElectronFileExtensionRuntimeTransportFactory } from "./runtime/electron-runtime-transport"
import { FileExtensionRuntimeManager } from "./runtime/file-extension-runtime-manager"

@Module({
  imports: [SpaceManagementModule],
  providers: [
    ElectronFileExtensionRuntimeTransportFactory,
    FileExtensionRuntimeManager,
    FileExtensionService,
  ],
  exports: [FileExtensionService],
})
export class FileExtensionModule {}

export { FileExtensionService } from "./file-extension.service"
export type * from "./types"
