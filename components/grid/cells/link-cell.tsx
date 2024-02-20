import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
  ProvideEditorCallback,
} from "@glideapps/glide-data-grid"
import { CheckIcon } from "lucide-react"

import { LinkCellData } from "@/lib/fields/link"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Separator } from "@/components/ui/separator"
import { Loading } from "@/components/loading"

import { useRealtimeTableData } from "../hooks/use-realtime-table-data"
import { drawDrilldownCell } from "./helper"

interface LinkCellProps {
  readonly kind: "link-cell"
  readonly value: LinkCellData[]
  readonly linkTable: string
}
export type LinkCell = CustomCell<LinkCellProps>

const LinkCellEditor: ReturnType<ProvideEditorCallback<LinkCell>> = (props) => {
  const { value: cell, onFinishedEditing, initialValue } = props
  const { value: oldValue, linkTable } = cell.data
  const { space } = useCurrentPathInfo()
  const { data, loading } = useRealtimeTableData(space, linkTable)
  const handleClick = (data: any) => {
    onFinishedEditing({
      ...cell,
      data: {
        ...cell.data,
        value: [
          {
            id: data._id,
            title: data.title,
          },
        ],
      },
    })
  }
  return (
    <div className="rounded-md border-none p-2 outline-none">
      {loading && <Loading />}
      {data.map((v, i) => {
        const selected = oldValue.find((old) => old.id === v._id)
        return (
          <div key={v._id}>
            <div
              key={v._id}
              className="flex cursor-pointer text-sm"
              onClick={() => {
                handleClick(v)
              }}
            >
              {v.title} {selected && <CheckIcon className="ml-2 h-5 w-5" />}
            </div>
            <Separator className="my-2" />
          </div>
        )
      })}
    </div>
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
