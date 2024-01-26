import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"
import { LookupFieldService } from "./lookup"

export class FieldsManager {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
  }

  get lookup() {
    return new LookupFieldService(this.table)
  }
}
