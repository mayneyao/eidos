import type { DrilldownCell } from "@glideapps/glide-data-grid"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

type LinkProperty = {
  linkTable: string
}

type LinkCell = DrilldownCell

type LinkCellData = {
  id: string
  title: string
}

export class LinkField extends BaseField<LinkCell, LinkProperty> {
  static type = "link"

  getCellContent(rawData: LinkCellData): LinkCell {
    return {
      kind: GridCellKind.Drilldown,
      data: rawData
        ? [
            {
              text: rawData.title,
            },
          ]
        : [],
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: LinkCell) {
    return {
      rawData: cell.data,
    }
  }
}
