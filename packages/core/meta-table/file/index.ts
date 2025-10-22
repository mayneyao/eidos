import type { ITreeNode } from "../../types/ITreeNode"
import { BaseFileTable } from "./base"
import { WithBlob } from "./blob"
import { WithUpload } from "./upload"
import { WithMigration } from "./migration"
import { WithFileSystem } from "./file-system"

export const ComposedFileTable = WithFileSystem(
  WithMigration(
    WithUpload(
      WithBlob(BaseFileTable)
    )
  )
)

export class FileTable extends ComposedFileTable {
  // Additional FileTable-specific methods if needed
}

export * from "./base"
export * from "./errors"
export * from "./helper"
export type { UploadOptions } from "./upload"

