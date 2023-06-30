import { IUIColumn } from "@/hooks/use-table"

type UIColumn<P> = Omit<IUIColumn, "property"> & {
  property: P
}

interface IBaseField<T, P, R> {
  column: UIColumn<P>
  getCellContent(rawData: any): T
  cellData2RawData(cell: T): any
}

export abstract class BaseField<T, P, R = string>
  implements IBaseField<T, P, R>
{
  static type: string

  /**
   * each table column has a corresponding ui column, which stored in the `${ColumnTableName}` table
   * we use the ui column to store the column's display name, type, and other ui related information
   * different field will have different property
   */
  column: UIColumn<P>
  constructor(column: UIColumn<P>) {
    this.column = {
      ...column,
      property: JSON.parse((column.property as any) ?? "{}") as any,
    }
  }

  /**
   * getCellContent will be called when the cell is rendered
   * transform the raw data into the cell content for rendering
   * @param rawData this is the raw data stored in the database
   */
  abstract getCellContent(rawData: any): T

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
}
