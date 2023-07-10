import { BooleanCell, GridCellKind } from "@platools/glide-data-grid"

import { BaseField } from "./base"

type CheckboxProperty = {}
type CheckboxCell = BooleanCell

export class CheckboxField extends BaseField<
  CheckboxCell,
  CheckboxProperty,
  number
> {
  static type = "checkbox"

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
