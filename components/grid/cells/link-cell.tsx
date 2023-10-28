import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid"

import { LinkCellData } from "@/lib/fields/link"

import { drawDrilldownCell } from "./helper"

interface LinkCellProps {
  readonly kind: "link-cell"
  readonly value: LinkCellData[]
}
export type LinkCell = CustomCell<LinkCellProps>

export const linkCellRenderer: CustomRenderer<LinkCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is LinkCell =>
    (cell.data as any).kind === "link-cell",
  needsHover: false,
  needsHoverPosition: false,
  measure: (ctx, cell, t) =>
    cell.data.value.reduce(
      (acc, data) =>
        ctx.measureText(data.title).width +
        acc +
        20 +
        (data.img !== undefined ? 18 : 0),
      0
    ) +
    2 * t.cellHorizontalPadding -
    4,
  draw: (a) => drawDrilldownCell(a, a.cell.data.value),
  provideEditor: () => (p) => {
    const { value } = p
    return <div>link editor</div>
  },
  onPaste: () => undefined,
}

export default linkCellRenderer
