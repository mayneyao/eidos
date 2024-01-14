import type { DatePickerCell } from "@/components/grid/cells/date-picker-cell"

import { BaseField } from "./base"
import { CompareOperator, GridCellKind } from "./const"

type DateProperty = {}

type DateCell = DatePickerCell

export class DateField extends BaseField<DateCell, DateProperty, string> {
  static type = "date"

  rawData2JSON(rawData: string) {
    return rawData
  }

  get compareOperators() {
    return [CompareOperator.IsEmpty, CompareOperator.IsNotEmpty]
  }

  getCellContent(rawData: string | undefined): DateCell {
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "date-picker-cell",
        date: rawData ? new Date(rawData) : undefined,
        displayDate: rawData ? new Date(rawData).toLocaleString() : "",
        format: "date",
      },
      copyData: rawData ?? "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: DateCell) {
    return {
      rawData: cell.data.date?.toISOString(),
    }
  }
}
