import { GridCellKind, TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"

type TitleProperty = {}

export class TitleField extends BaseField<TextCell, TitleProperty> {
  static type = "title"

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
