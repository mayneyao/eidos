import type {
  GridCell,
  GridColumn,
  Item} from "@glideapps/glide-data-grid";
import {
  DataEditor,
  GridCellKind
} from "@glideapps/glide-data-grid"

import { useDynamicTheme } from "@/components/table/views/grid/theme"

import "@glideapps/glide-data-grid/dist/index.css"
import { useTheme } from "@/components/theme-provider"
import { useCallback, useRef } from "react"

interface DataGridProps {
  data: Record<string, any>[]
  onDataChange: (data: any[]) => void
}

const getDataColumns = (data: Record<string, any>[]) => {
  if (!data.length) return []
  return Object.keys(data[0])
}

const getGridColumns = (data: Record<string, any>[]): GridColumn[] => {
  if (!data.length) return []
  return Object.keys(data[0]).map((key) => ({
    title: key,
    id: key,
    width: 150,
  }))
}

const getCellContent = (
  data: Record<string, any>[],
  [col, row]: Item
): GridCell => {
  const columns = getDataColumns(data)
  const value = data[row][columns[col]]
  // if column name is url, auto convert to link
  if (columns[col].toLowerCase().includes("url")) {
    return {
      kind: GridCellKind.Uri,
      data: value,
      displayData: value,
      allowOverlay: false,
      onClickUri: () => {
        console.log("clicked", value)
        window.open(value, "_blank")
      },
    }
  }
  if (value == null) {
    return {
      kind: GridCellKind.Text,
      data: "",
      displayData: "",
      allowOverlay: true,
      allowWrapping: true,
      readonly: false,
    }
  }
  return {
    kind: GridCellKind.Text,
    data: typeof value === "object" ? JSON.stringify(value) : String(value),
    displayData:
      typeof value === "object" ? JSON.stringify(value) : String(value),
    allowOverlay: true,
    allowWrapping: true,
    readonly: false,
  }
}

export function DataGrid({ data, onDataChange }: DataGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const _theme = useDynamicTheme(resolvedTheme || "light")
  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: GridCell) => {
      if (newValue.kind !== GridCellKind.Text) return

      const newData = [...data]
      const columns = getDataColumns(data)
      const columnName = columns[col]

      let parsedValue: any = newValue.data
      const originalValue = data[row][columnName]

      if (typeof originalValue === "number") {
        const num = Number(newValue.data)
        if (!isNaN(num)) {
          parsedValue = num
        }
      } else if (typeof originalValue === "boolean") {
        parsedValue = newValue.data.toLowerCase() === "true"
      } else if (typeof originalValue === "object") {
        try {
          parsedValue = JSON.parse(newValue.data)
        } catch {
          parsedValue = newValue.data
        }
      }

      newData[row] = {
        ...newData[row],
        [columnName]: parsedValue,
      }

      onDataChange(newData)
    },
    [data, onDataChange]
  )

  return (
    <DataEditor
      width="100%"
      height="100%"
      theme={_theme}
      rows={data.length}
      columns={getGridColumns(data)}
      getCellContent={(item) => getCellContent(data, item)}
      onCellEdited={onCellEdited}
      smoothScrollX
      smoothScrollY
      isDraggable={false}
      rowMarkers="number"
      onPaste={true}
      getCellsForSelection={true}
      keybindings={{ search: true }}
    />
  )
}
