import type { BooleanCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { CompareOperator, GridCellKind } from "./const"

type CheckboxProperty = {}
type CheckboxCell = BooleanCell

export class CheckboxField extends BaseField<
  CheckboxCell,
  CheckboxProperty,
  number
> {
  static type = "checkbox"

  get compareOperators() {
    return [CompareOperator.Equal, CompareOperator.NotEqual]
  }
  rawData2JSON(rawData: number) {
    return rawData
  }

  getCellContent(rawData: number | undefined): CheckboxCell {
    return {
      kind: GridCellKind.Boolean,
      data: Boolean(rawData),
      allowOverlay: false,
    }
  }

  cellData2RawData(cell: CheckboxCell) {
    return {
      rawData: cell.data ? 1 : 0,
    }
  }
}
