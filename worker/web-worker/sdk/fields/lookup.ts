import { getFieldInstance } from "@/lib/fields"
import { FieldType } from "@/lib/fields/const"
import { ILinkProperty } from "@/lib/fields/link"
import {
  ILookupContext,
  ILookupProperty,
  LookupField,
} from "@/lib/fields/lookup"
import { IField } from "@/lib/store/interface"
import { getTableIdByRawTableName } from "@/lib/utils"

import { DataSpace } from "../../DataSpace"
import { TableManager } from "../table"

export class LookupFieldService {
  dataSpace: DataSpace
  constructor(private table: TableManager) {
    this.dataSpace = this.table.dataSpace
  }

  /**
   * find all fields that lookup field depends on
   */
  getLookupContext = async (
    tableName: string,
    tableColumnName: string
  ): Promise<ILookupContext | null> => {
    console.log("getLookupContext", {
      tableName,
      tableColumnName,
    })
    const column = await this.dataSpace.column.getColumn(
      tableName,
      tableColumnName
    )
    if (!column) return null
    const field = column as IField<ILookupProperty>
    const { linkFieldId, lookupTargetFieldId } = field.property
    const linkField = await this.dataSpace.column.getColumn<ILinkProperty>(
      tableName,
      linkFieldId
    )

    if (!linkField) {
      return null
    }
    const lookupTargetField = await this.dataSpace.column.getColumn(
      linkField.property.linkTableName,
      lookupTargetFieldId
    )
    if (!lookupTargetField) {
      return null
    }
    let context: ILookupContext["lookupTargetFieldsMap"][string][string]["context"] =
      null
    if (lookupTargetField.type === FieldType.Lookup) {
      context = await this.getLookupContext(
        linkField.property.linkTableName,
        lookupTargetFieldId
      )
    }
    return {
      linkField,
      lookupTargetFieldsMap: {
        [getTableIdByRawTableName(linkField.property.linkTableName)]: {
          [lookupTargetFieldId]: {
            field: lookupTargetField,
            context,
          },
        },
      },
    }
  }

  /**
   *
   * @param id table_column_name
   */
  updateColumn = async (
    tableName: string,
    tableColumnName: string,
    rowIds?: string[]
  ) => {
    const column = await this.dataSpace.column.getColumn<ILookupProperty>(
      tableName,
      tableColumnName
    )
    if (!column) return
    const context = await this.getLookupContext(tableName, tableColumnName)
    const field = getFieldInstance<LookupField>(column, context)
    const targetField = field.getTargetFieldInstance()
    if (!targetField) return
    const {
      table_column_name: targetTableColumnName,
      table_name: targetTableName,
    } = targetField.column
    let sql = `
    UPDATE ${tableName}
    SET ${tableColumnName} = (
        SELECT GROUP_CONCAT(b.${targetTableColumnName})
        FROM ${targetTableName} as b
        WHERE ',' || ${tableName}.${column.property.linkFieldId} || ',' LIKE '%,' || b._id || ',%'
    )`
    // WHERE EXISTS (
    //     SELECT 1
    //     FROM ${targetTableName} as b
    //     WHERE ${tableName}.${column.property.linkFieldId} = b._id
    //   )
    if (rowIds) {
      sql += ` WHERE ${tableName}._id IN (?)`
      console.log(sql)
      this.dataSpace.exec(sql, [rowIds])
    } else {
      console.log(sql)
      this.dataSpace.exec(sql)
    }
  }
}
