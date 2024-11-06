import { getFieldInstance } from "."
import { IField } from "../store/interface"
import { getTableIdByRawTableName } from "../utils"
import { BaseField } from "./base"
import { FieldType, GridCellKind } from "./const"
import { ILinkProperty } from "./link"

export type ILookupProperty = {
  linkFieldId: string
  lookupTargetFieldId: string
}

/**
 * a -> b -> c -> d ....
 * if a&b&c&d are lookup field, we need to get the lookup fields map from a to d
 * walk through the lookup fields, and get the lookup fields map
 */
export type ILookupContext = {
  linkField: IField<ILinkProperty> | null
  lookupTargetFieldsMap: {
    [lookupTargetTableId: string]: {
      [fieldId: string]: {
        field: IField<any>
        context: ILookupContext | null
      }
    }
  }
}

export class LookupField extends BaseField<
  any,
  ILookupProperty,
  any,
  any,
  ILookupContext
> {
  static type = FieldType.Link

  /**
   * get target field instance, no matter it is a lookup field or not
   * we will store all lookup cell data in database, if we want to get lookup cell data, we just need to get the target field
   * do not need to get the entity field instance
   * @returns
   */
  getTargetFieldInstance(): BaseField<any, any, any, any, any> | null {
    const { lookupTargetFieldId } = this.column.property
    const linkTable = this.context?.linkField?.property?.linkTableName
    const linkTableId = getTableIdByRawTableName(linkTable || "")
    const target =
      this.context?.lookupTargetFieldsMap[linkTableId]?.[lookupTargetFieldId]
    if (!target) return null
    return getFieldInstance(target.field, target.context)
  }

  /**
   * for render, we need to get the entity field instance
   * a->b->c->d
   * maybe a&b&c are lookup field, but d is not a lookup field
   * we will get the target field recursively until the target field is not a lookup field
   * @returns
   */
  get entityFieldInstance():
    | BaseField<any, any, any, any, any>
    | LookupField
    | null {
    const targetField = this.getTargetFieldInstance()
    if (!targetField) return null
    if (targetField.column.type === FieldType.Lookup) {
      return (targetField as LookupField).entityFieldInstance
    }
    return targetField
  }

  rawData2JSON(rawData: any): any {
    const field = this.entityFieldInstance
    return field?.rawData2JSON(rawData as never) || null
  }

  get compareOperators(): any {
    const field = this.entityFieldInstance
    return field?.compareOperators || []
  }

  getCellContent(rawData: string, context: any): any {
    const field = this.entityFieldInstance
    if (!field) {
      return {
        kind: GridCellKind.Text,
        data: "",
        displayData: "",
        allowOverlay: false,
      }
    }
    let cellData: any

    if ('getCellContentViaLookup' in field) {
      cellData = (field as any).getCellContentViaLookup(rawData)
    } else {
      cellData = field?.getCellContent(rawData as never, context)
    }
    return {
      ...cellData,
      allowOverlay: false, // lookup field should not be editable
    }
  }

  cellData2RawData(cell: any) {
    return {
      rawData: null,
    }
  }
}
