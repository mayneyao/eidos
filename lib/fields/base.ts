import { IField } from "@/lib/store/interface"

import { getFieldInstance } from "."
import { CompareOperator, FieldType } from "./const"

// cellData, Property, RawData, row context, field context
interface IBaseField<CD, P, R, RC, FC> {
  /**
   * column from eidos__columns table, guild how to render this field
   */
  column: IField<P>
  context: FC | undefined

  get entityFieldInstance(): BaseField<any, any, any, any, any> | null

  /**
   * define the compare operators for this field, will be used in the filter
   */
  compareOperators: string[]
  /**
   * for render cell, for grid view
   * @param rawData raw data stored in the database
   * @param context some field need context to render, like user field need user map. we only store the user id in the database
   */
  getCellContent(rawData: any, context?: RC): CD

  /**
   * we store the raw data in the database, but we need to transform the raw data into json for other usage which make it more readable
   * eg: API, SDK, Script etc
   * {
   *  title: "this is title",
   *  cl_xxx: "field1 value",
   *  cl_yyy: "field2 value",
   * } => {
   *  title: "this is title",
   *  field1: "field1 value",
   *  field2: "field2 value",
   * }
   * @param rawData data stored in the database, most of the time, it's a string
   */
  rawData2JSON(rawData: R): any

  /**
   * transform the cell data into raw data, which can be stored in the database
   * @param cell cell data, which is the return value of getCellContent
   */
  cellData2RawData(cell: CD): any
}

export abstract class BaseField<CD, P, R = string, RC = any, FC = any>
  implements IBaseField<CD, P, R, RC, FC>
{
  static type: FieldType

  /**
   * each table column has a corresponding ui column, which stored in the `${ColumnTableName}` table
   * we use the ui column to store the column's display name, type, and other ui related information
   * different field will have different property
   */
  column: IField<P>
  context: FC | undefined
  constructor(column: IField<P>, context?: FC) {
    this.column = column
    this.context = context
  }

  get entityFieldInstance(): BaseField<any, any, any, any, any> | null {
    const field = getFieldInstance(this.column)
    return field
  }

  // is this field can be transformed to another field
  get isTransformable() {
    return false
  }

  abstract get compareOperators(): CompareOperator[]
  /**
   * getCellContent will be called when the cell is rendered
   * transform the raw data into the cell content for rendering
   * @param rawData this is the raw data stored in the database
   */
  abstract getCellContent(rawData: any, context?: RC): CD

  abstract rawData2JSON(rawData: R): any

  abstract cellData2RawData(cell: CD): {
    rawData: any
    shouldUpdateFieldProperty?: boolean
  }

  /**
   * every field should have a property, when you create a new field, you should implement this method
   * @returns
   */
  static getDefaultFieldProperty() {
    return {}
  }

  text2RawData(text: string | number) {
    return text ?? null
  }
}
