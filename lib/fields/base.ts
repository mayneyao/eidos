import { IUIColumn } from "@/hooks/use-table"

type UIColumn<P> = Omit<IUIColumn, "property"> & {
  property: P
}
export abstract class BaseField<T, P, R = string> {
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

  abstract cellData2RawData(cell: T): any
}
