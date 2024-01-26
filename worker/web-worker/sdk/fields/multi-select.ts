import { SelectProperty } from "@/lib/fields/select"
import { IField } from "@/lib/store/interface"

import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"

export class MultiSelectFieldService {
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
    /**
     * multi-select cell store data just like this: "a,b,c"
     * we can't use REPLACE function to update the data, but we need use json_each function to update the data
     * eg: cell data is "a,b,c"
     * update = {
     *  from: "a",
     *  to: "d"
     * }
     * after update, the cell data should be "d,b,c"
     */
    this.dataSpace.exec(`
    UPDATE ${table_name}
    SET ${table_column_name} = 
      CASE
        WHEN ${table_column_name} = '${from}' THEN '${to}'
        ELSE
          CASE
            WHEN instr(${table_column_name}, ',${from},') > 0 THEN replace(${table_column_name}, ',${from},', ',${to},')
            WHEN substr(${table_column_name}, 1, length('${from}')) = '${from}' THEN replace(${table_column_name}, '${from},', '${to},')
            WHEN substr(${table_column_name}, -length('${from}')) = '${from}' THEN replace(${table_column_name}, ',${from}', ',${to}')
          END
      END
    WHERE ${table_column_name} LIKE '%${from}%'
  `)
  }

  deleteSelectOption = async (
    field: IField<SelectProperty>,
    option: string
  ) => {
    const { table_column_name, table_name } = field
    this.dataSpace.exec(`
    UPDATE ${table_name}
    SET ${table_column_name} = 
      CASE
        WHEN ${table_column_name} = '${option}' THEN NULL
        ELSE
          CASE
            WHEN instr(${table_column_name}, ',${option},') > 0 THEN replace(${table_column_name}, ',${option},', ',')
            WHEN substr(${table_column_name}, 1, length('${option}')) = '${option}' THEN replace(${table_column_name}, '${option},', '')
            WHEN substr(${table_column_name}, -length('${option}')) = '${option}' THEN replace(${table_column_name}, ',${option}', '')
          END
      END
    WHERE ${table_column_name} LIKE '%${option}%'
  `)
  }
}
