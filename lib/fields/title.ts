import type { TextCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import {
  CompareOperator,
  FieldType,
  GridCellKind,
  TEXT_BASED_COMPARE_OPERATORS,
} from "./const"

type TitleProperty = {}

export class TitleField extends BaseField<TextCell, TitleProperty> {
  static type = FieldType.Title

  get compareOperators() {
    return TEXT_BASED_COMPARE_OPERATORS
  }

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
      rawData: cell.data || null,
    }
  }
}
