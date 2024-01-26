import { LinkCell } from "@/components/grid/cells/link-cell"

import { BaseField } from "./base"
import { FieldType, GridCellKind } from "./const"

export type ILinkProperty = {
  linkTable: string
}

export type LinkCellData = {
  id: string
  title: string
  img?: string
}

export class LinkField extends BaseField<LinkCell, ILinkProperty> {
  static type = FieldType.Link

  rawData2JSON(rawData: string) {
    return rawData
  }

  get compareOperators() {
    return []
  }

  getCellContent(
    rawData: string,
    context?: { row?: Record<string, string> }
  ): LinkCell {
    const titleKey = `${this.column.table_column_name}__title`
    const showText = context?.row?.[titleKey] || "unknown"
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "link-cell",
        value: rawData
          ? [
              {
                id: rawData,
                title: showText,
              },
            ]
          : [],
        linkTable: this.column.property.linkTable,
      },
      copyData: showText,
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: LinkCell) {
    return {
      rawData: cell.data.value.map((item) => item.id).join(", ") || null,
    }
  }
}
