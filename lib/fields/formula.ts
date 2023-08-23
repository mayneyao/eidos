import { GridCellKind, TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"

export type FormulaProperty = {
  formula: string
}

export class FormulaField extends BaseField<TextCell, FormulaProperty> {
  static type = "formula"

  getCellContent(rawData: string): TextCell {
    return {
      kind: GridCellKind.Text,
      data: rawData?.toString() ?? "",
      displayData: rawData?.toString() ?? "",
      allowOverlay: true,
      readonly: true,
    }
  }

  cellData2RawData(cell: TextCell) {
    return {
      rawData: cell.data,
    }
  }
}
