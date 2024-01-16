import type { TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

export type FormulaProperty = {
  formula: string
}

export class FormulaField extends BaseField<TextCell, FormulaProperty> {
  static type = "formula"

  get compareOperators() {
    return []
  }

  rawData2JSON(rawData: string) {
    return rawData
  }

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
      rawData: cell.data || null,
    }
  }
}
