import DataEditor, { DataEditorProps, Item } from "@glideapps/glide-data-grid"
import { useWhyDidYouUpdate } from "ahooks"
import { useCallback } from "react"

import { IField } from "@/lib/store/interface"

import { customCells } from "../grid/cells"
import { useColumns } from "../grid/hooks/use-col"

const config: Partial<DataEditorProps> = {
  width: "100%",
  height: 40,
  rowHeight: 36,
  headerHeight: 0,
}

export const StandaloneCellRender = (props: { column: IField; cell: any }) => {
  const { columns } = useColumns([props.column])
  const getCellContent = useCallback(
    (cell: Item) => {
      return props.cell
    },
    [props.cell]
  )
  useWhyDidYouUpdate("StandaloneCellRender", props)
  return (
    // <div className="" ref={editorRef}>
    <DataEditor
      {...config}
      customRenderers={customCells}
      columns={columns}
      getCellContent={getCellContent}
      theme={{
        borderColor: "transparent",
        accentColor: "transparent",
        horizontalBorderColor: "transparent",
        headerBottomBorderColor: "transparent",
      }}
      rows={1}
    />
    // </div>
  )
}
