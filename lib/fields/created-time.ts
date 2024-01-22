import { TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"

type DateProperty = {}

export class CreatedTimeField extends BaseField<
  TextCell,
  DateProperty,
  string
> {
  static type = FieldType.CreatedTime

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

  getCellContent(rawData: string | undefined): TextCell {
    // 2024-01-22 02:51:26 => 2024-01-22T02:51:26.000Z
    const str = rawData
      ? new Date(rawData.split(" ").join("T") + ".000Z").toLocaleString()
      : ""
    return {
      kind: GridCellKind.Text,
      data: str,
      displayData: str,
      allowOverlay: false,
      readonly: true,
    }
  }
  cellData2RawData(cell: TextCell) {
    return {
      rawData: cell.data || null,
    }
  }
}
