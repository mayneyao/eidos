import { IField } from "@/lib/store/interface"

import { CompareOperator } from "./const"

type UIColumn<P> = Omit<IField, "property"> & {
  property: P
}

interface IBaseField<T, P, R> {
  column: UIColumn<P>
  compareOperators: string[]
  getCellContent(rawData: any): T
  rawData2JSON(rawData: R): any
  cellData2RawData(cell: T): any
}

export abstract class BaseField<T, P, R = string>
  implements IBaseField<T, P, R>
{
  static type: string

  static getDefaultProperty() {
    return {}
  }

  /**
   * each table column has a corresponding ui column, which stored in the `${ColumnTableName}` table
   * we use the ui column to store the column's display name, type, and other ui related information
   * different field will have different property
   */
  column: UIColumn<P>
  constructor(column: UIColumn<P>) {
    this.column = column
  }

  abstract get compareOperators(): CompareOperator[]
  /**
   * getCellContent will be called when the cell is rendered
   * transform the raw data into the cell content for rendering
   * @param rawData this is the raw data stored in the database
   */
  abstract getCellContent(rawData: any): T

  abstract rawData2JSON(rawData: R): any

  abstract cellData2RawData(cell: T): {
    rawData: any
    shouldUpdateFieldProperty?: boolean
  }

  /**
   * every field should have a property, when you create a new field, you should implement this method
   * @returns
   */
  getDefaultFieldProperty(): P {
    return {} as P
  }

  text2RawData(text: string) {
    return text || null
  }
}
