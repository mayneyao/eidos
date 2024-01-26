import { SelectProperty } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"

import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"

export class SelectFieldService {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
  }

  updateSelectOptionName = async (
    field: IField<SelectProperty>,
    update: {
      from: string
      to: string
    }
  ) => {
    const { from, to } = update
    const { table_column_name, table_name } = field
    this.dataSpace.exec(
      `UPDATE ${table_name} SET ${table_column_name} = '${to}' WHERE ${table_column_name} = '${from}'`
    )
  }

  deleteSelectOption = async (
    field: IField<SelectProperty>,
    option: string
  ) => {
    const { table_column_name, table_name } = field
    this.dataSpace.exec(
      `UPDATE ${table_name} SET ${table_column_name} = NULL WHERE ${table_column_name} = '${option}'`
    )
  }
}
