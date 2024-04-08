import type { TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { FieldType, GridCellKind, TEXT_BASED_COMPARE_OPERATORS } from "./const"

type TextProperty = {}

export class TextField extends BaseField<TextCell, TextProperty> {
  static type = FieldType.Text

  get compareOperators() {
    return TEXT_BASED_COMPARE_OPERATORS
  }

  rawData2JSON(rawData: string) {
    return rawData
  }

  getCellContent(rawData: string | null): TextCell {
    return {
      kind: GridCellKind.Text,
      data: rawData ? rawData + "" : "",
      displayData: rawData ? rawData + "" : "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: TextCell) {
    return {
      rawData: cell.data || null,
    }
  }
}
