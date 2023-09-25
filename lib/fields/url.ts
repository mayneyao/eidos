import type { UriCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

type URLProperty = {}

type URLCell = UriCell

export class URLField extends BaseField<URLCell, URLProperty> {
  static type = "url"

  getCellContent(rawData: string): URLCell {
    return {
      kind: GridCellKind.Uri,
      data: rawData ?? "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: URLCell) {
    return {
      rawData: cell.data,
    }
  }
}
