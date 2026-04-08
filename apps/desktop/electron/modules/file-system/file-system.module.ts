/**
 * File System Module - File operations and dialogs
 */

import { Module } from "../../common/di"
import { FileSystemService } from "./file-system.service"

@Module({
  providers: [FileSystemService],
  exports: [FileSystemService],
})
export class FileSystemModule {}

export { FileSystemService } from "./file-system.service"
