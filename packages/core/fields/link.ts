import { z } from "zod"
import { zip } from "@/lib/lodash"

import type { CustomCell } from "@glideapps/glide-data-grid"

interface LinkCellProps {
  readonly kind: "link-cell"
  readonly value: LinkCellData[]
  readonly linkTable: string
}
export type LinkCell = CustomCell<LinkCellProps>

import { BaseField } from "./base"
import { FieldType, GridCellKind } from "./const"

export type ILinkProperty = {
  linkTableName: string
  linkColumnName: string
}

export const LinkPropertySchema = z.object({
  linkTableName: z.string(),
  linkColumnName: z.string(),
})

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
      rawData: cell.data.value.map((item) => item.id).join(",") || null,
    }
  }
}
