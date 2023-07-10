import { GridCellKind, NumberCell } from "@platools/glide-data-grid"

import { BaseField } from "./base"

type NumberProperty = {}

export class NumberField extends BaseField<NumberCell, NumberProperty, number> {
  static type = "number"

  getCellContent(rawData: number | undefined): NumberCell {
    return {
      kind: GridCellKind.Number,
      data: rawData,
      displayData: rawData == null ? "" : `${rawData}`,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: NumberCell) {
    return {
      rawData: cell.data,
    }
  }
}
