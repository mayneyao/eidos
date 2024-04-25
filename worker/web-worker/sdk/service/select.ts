import { SelectField, SelectProperty } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"
import { nonNullable } from "@/lib/utils"

import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"

export class SelectFieldService {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
  }

  updateFieldPropertyIfNeed = async (
    field: IField<SelectProperty>,
    value: string
  ) => {
    const selectFieldInstance = new SelectField(field)
    const cellValue = selectFieldInstance.getCellContent(value)
    const { shouldUpdateColumnProperty } =
      selectFieldInstance.cellData2RawData(cellValue)
    if (shouldUpdateColumnProperty) {
      await this.dataSpace.updateColumnProperty({
        tableColumnName: field.table_column_name,
        tableName: field.table_name,
        property: selectFieldInstance.column.property,
        type: field.type,
      })
    }
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

  beforeConvert = async (field: IField<any>) => {
    // get all select options
    const { table_column_name, table_name } = field
    const textList = this.dataSpace.syncExec2(
      `SELECT DISTINCT ${table_column_name} FROM ${table_name}`
    )
    const textList2 = textList
      .map((item: any) => item[table_column_name])
      .filter(nonNullable)
    const options = SelectField.generateOptionsByNames(textList2)
    return options
  }
}
