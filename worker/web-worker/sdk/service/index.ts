import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"
import { LinkFieldService } from "./link"
import { LookupFieldService } from "./lookup"
import { MultiSelectFieldService } from "./multi-select"
import { SelectFieldService } from "./select"

export class FieldsManager {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
    this.table = table
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
}
