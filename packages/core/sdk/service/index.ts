import type { DataSpaceWithTable } from "../../data-space/table"
import type { TableManager } from "../table"
import { LinkFieldService } from "./link"
import { LookupFieldService } from "./lookup"
import { MultiSelectFieldService } from "./multi-select"
import { SelectFieldService } from "./select"
import { TextFieldService } from "./text"

export class FieldsManager {
  dataSpace: DataSpaceWithTable
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
    this.table = table
  }

  all() {
    const fields = this.dataSpace.column.list({
      table_name: this.table.rawTableName,
    })
    return fields
  }

  get lookup() {
    return new LookupFieldService(this.table)
  }

  get select() {
    return new SelectFieldService(this.table)
  }

  get multiSelect() {
    return new MultiSelectFieldService(this.table)
  }

  get link() {
    return new LinkFieldService(this.table)
  }

  get text() {
    return new TextFieldService(this.table)
  }
}
