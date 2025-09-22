import { useCallback, useContext, useMemo, useState } from "react"
import type { IField } from "@/packages/core/types/IField"
import type { CompactSelectionRanges } from "@glideapps/glide-data-grid"
import {
  ExternalLinkIcon,
  MoveDiagonalIcon,
  MoveUpRightIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"

import { getTableIdByRawTableName, shortenId } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCurrentSubPage } from "@/apps/web-app/hooks/use-current-sub-page"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTranslation } from "react-i18next"

import { TableContext, useTableContext } from "../../hooks"
import { ScriptContextMenu } from "./script-context-menu"
import { useTableAppStore } from "./store"

export function GridContextMenu({
  children,
  handleDelRows,
  getRowByIndex,
  getFieldByIndex,
  openAItools,
}: {
  getFieldByIndex: (index: number) => IField
  handleDelRows: (ranges: { startIndex: number; endIndex: number }[]) => void
  getRowByIndex: (index: number) => any
  children: React.ReactNode
  openAItools: () => void
}) {
  const { t } = useTranslation()
  const { selection, clearSelection } = useTableAppStore()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const count = useMemo(() => {
    let rowCount = 0
    if (selection.current) {
      rowCount = selection.current.range.height
    } else if (selection.rows.length) {
      rowCount = selection.rows.length
    }
    return rowCount.toLocaleString()
  }, [selection])
  const { space, tableName } = useTableContext()
  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { setSubPage } = useCurrentSubPage()

  // Convert rawTableName to tableId
  const tableId = getTableIdByRawTableName(tableName)

  const goto = useGoto()
  const getRow = useCallback(() => {
    if (!selection.current) {
      return
    }
    const rowIndex = selection.current?.range.y
    const row = getRowByIndex(rowIndex)
    return row
  }, [getRowByIndex, selection])

  const getRows = useCallback(() => {
    if (!selection.current) {
      return
    }
    const { y, height } = selection.current?.range
    const rows = []
    for (let i = y; i < y + height; i++) {
      const row = getRowByIndex(i)
      rows.push(row)
    }
    return rows
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
      setSubPage(shortId)
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
  const handleDelete = () => {
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = () => {
    if (!selection.current) {
      if (selection.rows.length) {
        const items = (selection.rows as any).items as CompactSelectionRanges
        const range = items.map((item) => {
          const [startIndex, endIndex] = item
          return {
            startIndex,
            endIndex,
          }
        })
        handleDelRows(range)
      }
    } else {
      const { y, height } = selection.current?.range
      handleDelRows([
        {
          startIndex: y,
          endIndex: y + height,
        },
      ])
    }
    clearSelection()
    setShowDeleteDialog(false)
  }
  const { isReadOnly } = useContext(TableContext)

  return (
    <ContextMenu>
      <ContextMenuTrigger className="h-full w-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem onSelect={() => openRow(true)}>
          <MoveUpRightIcon className="pr-2" />
          Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => openRow()}>
          <MoveDiagonalIcon className="pr-2" />
          Open in full page
        </ContextMenuItem>
        {!isReadOnly && (
          <ContextMenuItem onClick={handleDelete}>
            <Trash2Icon className="pr-2" />
            Delete Rows ({count})
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {currentField?.type === "url" && (
          <>
            <ContextMenuItem onSelect={openURl}>
              <ExternalLinkIcon className="pr-2" />
              Open URL
            </ContextMenuItem>
          </>
        )}
        {!isReadOnly && (
          <ContextMenuItem onClick={openAItools}>
            <SparklesIcon className="pr-2" />
            Ask AI
            <ContextMenuShortcut>Alt+I</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        <ScriptContextMenu getRows={getRows} count={count} />
      </ContextMenuContent>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("table.rows.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("table.rows.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextMenu>
  )
}
