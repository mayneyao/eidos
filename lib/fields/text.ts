import { GridCellKind, TextCell } from "@platools/glide-data-grid"

import { BaseField } from "./base"

type TextProperty = {}

export class TextField extends BaseField<TextCell, TextProperty> {
  static type = "text"

  getCellContent(rawData: string): TextCell {
    return {
      kind: GridCellKind.Text,
      data: rawData ?? "",
      displayData: rawData ?? "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: TextCell) {
    return {
      rawData: cell.data,
    }
  }
}
