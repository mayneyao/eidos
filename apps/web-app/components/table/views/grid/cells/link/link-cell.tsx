import { useState } from "react"
import type {
  CustomCell,
  CustomRenderer,
  ProvideEditorCallback,
} from "@glideapps/glide-data-grid"
import { GridCellKind } from "@glideapps/glide-data-grid"

import type { LinkCellData } from "@/packages/core/fields/link"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { drawDrilldownCell } from "../helper"
import { LinkCellEditor as _LinkCellEditor } from "./link-cell-editor"
import { useTableContext } from "../../../../hooks"

interface LinkCellProps {
  readonly kind: "link-cell"
  readonly value: LinkCellData[]
  readonly linkTable: string
}
export type LinkCell = CustomCell<LinkCellProps>

const LinkCellEditor: ReturnType<ProvideEditorCallback<LinkCell>> = (props) => {
  const { value: cell, onFinishedEditing, onChange, initialValue } = props
  const { value: oldValue, linkTable } = cell.data
  const { space } = useTableContext()
  const [open, setOpen] = useState(true)

  const handleChange = (data: LinkCellData[]) => {
    onChange({
      ...cell,
      data: {
        ...cell.data,
        value: data,
      },
    })
  }

  const handleFinishedEditing = () => {
    setOpen(false)
    onFinishedEditing(cell)
  }

  const handleCancelEditing = () => {
    setOpen(false)
    onFinishedEditing(undefined, [0, 0])
  }

  return (
    <Popover open={open}>
      <PopoverTrigger>
        <div />
      </PopoverTrigger>
      <PopoverContent
        className="click-outside-ignore z-[10000] w-auto p-0 border-0 shadow-none bg-transparent"
        align="start"
        sideOffset={-6}
        alignOffset={-9}
      >
        <_LinkCellEditor
          tableName={linkTable}
          databaseName={space}
          value={oldValue}
          onChange={handleChange}
          onFinishedEditing={handleFinishedEditing}
          onCancelEditing={handleCancelEditing}
        />
      </PopoverContent>
    </Popover>
  )
}

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
    return <LinkCellEditor {...p} />
  },
  onPaste: () => undefined,
  onDelete(cell) {
    return {
      ...cell,
      data: {
        ...cell.data,
        value: [],
      },
    }
  },
}

export default linkCellRenderer
