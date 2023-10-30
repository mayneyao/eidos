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
    if (typeof rawData === "string") {
      return {
        kind: GridCellKind.Custom,
        data: {
          kind: "link-cell",
          value: [
            {
              id: rawData,
              title: "unknown",
            },
          ],
          linkTable: this.column.property.linkTable,
        },
        copyData: "unknown",
        allowOverlay: true,
      }
    }
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "link-cell",
        value: rawData ?? [],
        linkTable: this.column.property.linkTable,
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
