import { LinkCell } from "@/components/grid/cells/link-cell"

import { BaseField } from "./base"
import { GridCellKind } from "./const"

type LinkProperty = {
  linkTable: string
}

export type LinkCellData = {
  id: string
  title: string
  img?: string
}

export class LinkField extends BaseField<LinkCell, LinkProperty> {
  static type = "link"

  getCellContent(rawData: LinkCellData[]): LinkCell {
    console.log("rawData", rawData)
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "link-cell",
        value: rawData ?? [],
      },
      copyData: rawData?.map((item) => item.title).join(", "),
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: LinkCell) {
    return {
      rawData: cell.data.value.map((item) => item.id).join(", "),
    }
  }
}
