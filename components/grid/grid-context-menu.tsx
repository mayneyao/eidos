import { useCallback } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"
import { IUIColumn } from "@/hooks/use-table"
import { shortenId } from "@/lib/utils"

import { useTableAppStore } from "./store"

export function ContextMenuDemo({
  children,
  deleteRows,
  getRowByIndex,
  getFieldByIndex,
}: {
  getFieldByIndex: (index: number) => IUIColumn
  deleteRows: (start: number, end: number) => void
  getRowByIndex: (index: number) => any
  children: React.ReactNode
}) {
  const { selection, clearSelection } = useTableAppStore()
  const count = selection.current?.range.height ?? 0

  const { space, tableId } = useCurrentPathInfo()
  const { getOrCreateTableSubDoc } = useSqlite(space)
  const goto = useGoto()
  const getRow = useCallback(() => {
    if (!selection.current) {
      return
    }
    const rowIndex = selection.current?.range.y
    const row = getRowByIndex(rowIndex)
    return row
  }, [getRowByIndex, selection])

  const getField = useCallback(() => {
    if (!selection.current) {
      return
    }
    const cellIndex = selection.current?.range.x
    const field = getFieldByIndex(cellIndex)
    return field
  }, [getFieldByIndex, selection])

  const getCell = useCallback(() => {
    const row = getRow()
    const field = getField()
    if (!row || !field) return
    const cell = row[field.table_column_name!]
    return cell
  }, [getField, getRow])

  const openRow = async (right?: boolean) => {
    const row = getRow()
    if (!row) return
    const shortId = shortenId(row._id)
    await getOrCreateTableSubDoc({
      docId: shortId,
      title: row.title,
      tableId: tableId!,
    })
    if (right) {
      goto(space, tableId, shortId)
    } else {
      goto(space, shortId)
    }
  }
  const currentField = getField()

  const openURl = () => {
    const cell = getCell()
    if (!cell) return
    window.open(cell, "_blank")
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger className="h-full w-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset onSelect={() => openRow()}>
          Open
        </ContextMenuItem>
        <ContextMenuItem inset onSelect={() => openRow(true)}>
          Open Right
        </ContextMenuItem>
        <ContextMenuItem
          inset
          onClick={() => {
            if (!selection.current) {
              return
            }
            const { y, height } = selection.current?.range
            deleteRows(y, y + height)
            clearSelection()
          }}
        >
          Delete Rows ({count})
        </ContextMenuItem>
        <ContextMenuSeparator />
        {currentField?.type === "url" && (
          <>
            <ContextMenuItem inset onSelect={openURl}>
              Open URL
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
