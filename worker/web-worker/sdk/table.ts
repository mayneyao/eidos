import { getRawTableNameById } from "@/lib/utils"

import { DataSpace } from "../DataSpace"
import { RowsManager } from "./rows"

export class TableManager {
  // table name in sqlite
  rawTableName: string
  constructor(public id: string, public dataSpace: DataSpace) {
    this.rawTableName = getRawTableNameById(id)
  }

  get rows() {
    return new RowsManager(this)
  }
}
