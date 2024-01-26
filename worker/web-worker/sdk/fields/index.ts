import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"
import { LookupFieldService } from "./lookup"
import { MultiSelectFieldService } from "./multi-select"
import { SelectFieldService } from "./select"

export class FieldsManager {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
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
}
