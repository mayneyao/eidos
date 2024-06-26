import type { BooleanCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { CompareOperator, FieldType, GridCellKind } from "./const"

type CheckboxProperty = {}
type CheckboxCell = BooleanCell

export class CheckboxField extends BaseField<
  CheckboxCell,
  CheckboxProperty,
  number
> {
  static type = FieldType.Checkbox

  get compareOperators() {
    return [CompareOperator.IsEmpty, CompareOperator.IsNotEmpty]
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
      rawData: cell.data ? 1 : null,
    }
  }
}
