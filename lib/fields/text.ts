import type { TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

type TextProperty = {}

export class TextField extends BaseField<TextCell, TextProperty> {
  static type = "text"

  rawData2JSON(rawData: string) {
    return rawData
  }

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
