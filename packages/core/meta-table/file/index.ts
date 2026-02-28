import { BaseFileTable } from "./base"
import { WithMigration } from "./migration"

export const ComposedFileTable = WithMigration(BaseFileTable)

export class FileTable extends ComposedFileTable {
  // Additional FileTable-specific methods if needed
}

export * from "./base"
export * from "./errors"
export * from "./helper"
