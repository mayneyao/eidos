import type { DatePickerCell } from "@/components/table/views/grid/cells/date-picker-cell"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"

type DateProperty = {}

type DateCell = DatePickerCell

export class DateField extends BaseField<DateCell, DateProperty, string> {
  static type = FieldType.Date

  rawData2JSON(rawData: string) {
    return rawData
  }

  get compareOperators() {
    return [
      CompareOperator.Equal,
      CompareOperator.NotEqual,
      CompareOperator.GreaterThan,
      CompareOperator.GreaterThanOrEqual,
      CompareOperator.LessThan,
      CompareOperator.LessThanOrEqual,
      CompareOperator.IsEmpty,
      CompareOperator.IsNotEmpty,
    ]
  }

  getCellContent(rawData: string | undefined): DateCell {
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "date-picker-cell",
        date: rawData ? new Date(rawData) : undefined,
        displayDate: rawData ? new Date(rawData).toLocaleDateString() : "",
        format: "date",
      },
      copyData: rawData ?? "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: DateCell) {
    return {
      rawData: cell.data.date?.toISOString() || null,
    }
  }
}
