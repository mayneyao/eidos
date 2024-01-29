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

  onPropertyChange = async (
    field: IField<ILookupProperty>,
    newProperty: ILookupProperty
  ) => {
    if (!field) return
    const { table_name, table_column_name } = field
    const { linkFieldId, lookupTargetFieldId } = field.property
    if (
      linkFieldId === newProperty.linkFieldId &&
      lookupTargetFieldId === newProperty.lookupTargetFieldId
    ) {
      return
    }
    const oldLinkField = await this.dataSpace.column.getColumn<ILinkProperty>(
      table_name,
      linkFieldId
    )
    if (!oldLinkField) return

    let newLinkField = oldLinkField
    if (linkFieldId !== newProperty.linkFieldId) {
      const _newLinkField =
        await this.dataSpace.column.getColumn<ILinkProperty>(
          table_name,
          newProperty.linkFieldId
        )
      if (!_newLinkField) return
      newLinkField = _newLinkField
    }

    // delete old reference
    // old lookupTargetFieldId changed
    if (
      linkFieldId === newProperty.linkFieldId &&
      lookupTargetFieldId !== newProperty.lookupTargetFieldId
    ) {
      await this.dataSpace.reference.delBy({
        self_table_name: table_name,
        self_table_column_name: table_column_name,
        ref_table_name: oldLinkField.property.linkTableName,
        ref_table_column_name: lookupTargetFieldId,
        link_table_name: table_name,
        link_table_column_name: linkFieldId,
      })
    }
    // add new reference
    await this.dataSpace.reference.add({
      self_table_name: table_name,
      self_table_column_name: table_column_name,
      ref_table_name: newLinkField.property.linkTableName,
      ref_table_column_name: newProperty.lookupTargetFieldId,
      link_table_name: newLinkField.table_name,
      link_table_column_name: newLinkField.table_column_name,
    })
  }

  /**
   * <linkField>__title field can be treated as a lookup field and the lookupTargetField is the title field
   */
  getLinkTitleContext = async (tableName: string, tableColumnName: string) => {
    const linkField = await this.dataSpace.column.getColumn<ILinkProperty>(
      tableName,
      tableColumnName.replace("__title", "")
    )
    if (!linkField) return
    return {
      targetTableColumnName: "title",
      targetTableName: linkField.property.linkTableName,
      linkFieldId: linkField.table_column_name,
    }
  }

  _getLookupContext = async (tableName: string, tableColumnName: string) => {
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

    return {
      targetTableColumnName,
      targetTableName,
      linkFieldId: column.property.linkFieldId,
    }
  }

  getFieldContext = (tableName: string, tableColumnName: string) => {
    if (tableColumnName.endsWith("__title")) {
      return this.getLinkTitleContext(tableName, tableColumnName)
    }
    return this._getLookupContext(tableName, tableColumnName)
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
    const context = await this.getFieldContext(tableName, tableColumnName)
    if (!context) return
    const { targetTableColumnName, targetTableName, linkFieldId } = context
    let sql = `
    UPDATE ${tableName}
    SET ${tableColumnName} = (
        SELECT GROUP_CONCAT(b.${targetTableColumnName})
        FROM ${targetTableName} as b
        WHERE ',' || ${tableName}.${linkFieldId} || ',' LIKE '%,' || b._id || ',%'
    )`
    // WHERE EXISTS (
    //     SELECT 1
    //     FROM ${targetTableName} as b
    //     WHERE ${tableName}.${column.property.linkFieldId} = b._id
    //   )
    if (rowIds) {
      sql += ` WHERE ${tableName}._id IN (${rowIds.map(() => "?").join(",")})`
      this.dataSpace.exec(sql, [...rowIds])
    } else {
      this.dataSpace.exec(sql)
    }
  }
}
