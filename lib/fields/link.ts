import { zip } from "lodash"

import { LinkCell } from "@/components/grid/cells/link-cell"

import { BaseField } from "./base"
import { FieldType, GridCellKind } from "./const"

export type ILinkProperty = {
  linkTableName: string
  linkColumnName: string
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
    const ids = rawData?.split(",") || []
    const titles = context?.row?.[titleKey]?.split(",") || []
    return {
      kind: GridCellKind.Custom,
      data: {
        kind: "link-cell",
        value: zip(ids, titles).map(([id, title]) => ({
          id: id || "",
          title: title || "Untitled",
        })),
        linkTable: this.column.property.linkTableName,
      },
      copyData: context?.row?.[titleKey] || "",
      allowOverlay: true,
    }
  }

  cellData2RawData(cell: LinkCell) {
    return {
      rawData: cell.data.value.map((item) => item.id).join(", ") || null,
    }
  }
}
