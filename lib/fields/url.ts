import type { UriCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import {
  CompareOperator,
  GridCellKind,
  TEXT_BASED_COMPARE_OPERATORS,
} from "./const"

type URLProperty = {}

type URLCell = UriCell

export class URLField extends BaseField<URLCell, URLProperty> {
  static type = "url"

  get compareOperators() {
    return TEXT_BASED_COMPARE_OPERATORS
  }

  rawData2JSON(rawData: string) {
    return rawData
  }

  getCellContent(rawData: string): URLCell {
    return {
      kind: GridCellKind.Uri,
      data: rawData ?? "",
      allowOverlay: true,
      hoverEffect: true,
      onClickUri: (args) => {
        window.open(rawData, "_blank")
      },
    }
  }

  cellData2RawData(cell: URLCell) {
    return {
      rawData: cell.data || null,
    }
  }
}
