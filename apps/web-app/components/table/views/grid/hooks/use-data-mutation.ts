import type { MutableRefObject } from "react"
import { useCallback, useContext } from "react"
import { DataChangeEventHandler } from "@/packages/core/data-pipeline/DataChangeEventHandler"
import type {
  DataEditorRef,
  EditableGridCell,
  Item,
  Rectangle,
} from "@glideapps/glide-data-grid"
import { useThrottleFn, useDebounceFn } from "ahooks"
import type { IView } from "@/packages/core/types/IView"

import { isFieldsInQuery } from "@/packages/core/sqlite/sql-view-query"
import {
  getTableIdByRawTableName,
  isUuidv4,
  shortenId,
  uuidv7,
} from "@/lib/utils"
import { useCurrentSubPage } from "@/apps/web-app/hooks/use-current-sub-page"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useTableOperation } from "@/apps/web-app/hooks/use-table"
import { useViewSort } from "@/apps/web-app/hooks/use-view-sort"
import { TableContext } from "@/components/table/hooks"
import { useTableRowEvent } from "@/components/table/hooks/use-table-row-event"
import { useViewCount } from "@/components/table/hooks/use-view-count"

import { useTableStore } from "../../../table-store-provider"
import { useDataSource } from "./use-data-source"
import { useColumns } from "./use-col"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"

interface IUseDataMutationProps {
  gridRef: MutableRefObject<DataEditorRef | null>
  visiblePagesRef: MutableRefObject<Rectangle>
  dataRef: MutableRefObject<string[]>
  rowIdsRef: MutableRefObject<string[]>
  getRowDataByIndex: (index: number) => any

  view: IView
  // Stats refresh callbacks
  refreshAllStats?: () => void
  refreshColumnStat?: (columnName: string) => void
}

export const useDataMutation = ({
  view,
  gridRef,
  dataRef,
  rowIdsRef,
  visiblePagesRef,
  getRowDataByIndex,
  refreshAllStats,
  refreshColumnStat,
}: IUseDataMutationProps) => {
  const { addAddedRowId, addedRowIds, clearAddedRowIds } = useTableStore()
  const { setSubPage } = useCurrentSubPage()
  const { tableName, space } = useContext(TableContext)
  const { getViewSortedRows } = useViewSort(view.query)

  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { increaseCount, reduceCount, setCount } = useViewCount(view)

  //   const { getViewSortedRows } = useViewSort()
  const { query: qs } = view
  const { sqlite } = useSqlite()
  const { toCell, onEdited } = useDataSource(tableName, space)
  const { uiColumns } = useUiColumns(tableName, space)
  const { showColumns } = useColumns(uiColumns, view)

  const { deleteRowsByRange, deleteRowsByIds, addRow } = useTableOperation(
    tableName,
    space
  )
  const tableId = view.table_id

  // Debounced version of refreshColumnStat to avoid frequent SQL queries during rapid edits
  const { run: debouncedRefreshColumnStat } = useDebounceFn(
    (columnName: string) => {
      refreshColumnStat?.(columnName)
    },
    { wait: 300 }
  )

  const refreshCurrentVisible = useCallback(() => {
    const vr = visiblePagesRef.current
    const damageList: { cell: [number, number] }[] = []
    const height = vr.height
    for (let row = vr.y; row < vr.y + height; row++) {
      for (let col = vr.x; col < vr.x + vr.width; col++) {
        damageList.push({
          cell: [col, row],
        })
      }
    }
    gridRef.current?.updateCells(damageList)
  }, [gridRef, visiblePagesRef])

  const { run: updateView } = useThrottleFn(
    async (rowId?: string) => {
      const rows = await getViewSortedRows()
      if (!rows) return
      const rowIds = rows.map((r: any) => r._id)
      if (rowId) {
        // handle row index change after sort
        const oldIndex = rowIdsRef.current.findIndex((id) => id === rowId)
        const newIndex = rowIds.findIndex((id: any) => id === rowId)
        if (oldIndex !== newIndex) {
          // TODO: tips for user
        }
      }
      rowIdsRef.current = rowIds
      dataRef.current = [...rowIds]
      setCount(rowIds.length)
      refreshCurrentVisible()
    },
    {
      wait: 300,
    }
  )

  // check a record whether exist in a view after insert/update
  const checkRowExistInQuery = useCallback(
    async (rowId: string, callback: (isExist: boolean) => void) => {
      if (!sqlite || !qs) return
      const tableId = getTableIdByRawTableName(tableName)
      const isExist = await sqlite.isRowExistInQuery(tableId, rowId, qs)
      callback(Boolean(isExist))
    },
    [sqlite, qs, tableName]
  )

  const onCellEdited = useCallback(
    (cell: Item, newVal: EditableGridCell) => {
      const [col] = cell
      const [, row] = cell
      const rowData = getRowDataByIndex(row)
      rowData && onEdited(cell, newVal, rowData)

      // Refresh this column's stats (debounced to avoid frequent SQL queries)
      if (debouncedRefreshColumnStat) {
        const field = showColumns[col]
        if (field) {
          debouncedRefreshColumnStat(field.table_column_name)
        }
      }
    },
    [getRowDataByIndex, onEdited, showColumns, debouncedRefreshColumnStat]
  )

  const onCellsEdited = (
    newValues: readonly { location: Item; value: EditableGridCell }[]
  ) => {
    console.log("onCellsEdited", newValues)
    return false
  }

  const handleDelRows = async (
    ranges: { startIndex: number; endIndex: number }[]
  ) => {
    let oldCount = rowIdsRef.current.length
    const _ranges = [...ranges]
    const toDeleteIds = []
    for (const { startIndex, endIndex } of ranges.reverse()) {
      const ids = rowIdsRef.current.splice(startIndex, endIndex - startIndex)
      toDeleteIds.push(...ids)
      dataRef.current.splice(startIndex, endIndex - startIndex)
    }
    if (!qs) {
      throw new Error("query is empty")
    }

    try {
      setCount(rowIdsRef.current.length)
      refreshCurrentVisible()
      // old version of uuid
      if (toDeleteIds.some((id) => isUuidv4(id))) {
        console.log("deleteRowsByIds")
        await deleteRowsByIds(toDeleteIds, tableName)
      } else {
        await deleteRowsByRange(_ranges, tableName, qs)
      }
      // Refresh all stats
      refreshAllStats?.()
    } catch (error) {
      // fallback
      setCount(oldCount)
    }
  }

  const handleAddRow = useCallback(async () => {
    // update ui first
    increaseCount()
    try {
      const uuid = uuidv7()
      addAddedRowId(uuid)
      await addRow(uuid)
      rowIdsRef.current.push(uuid)
      const index = rowIdsRef.current.length - 1
      dataRef.current[index] = uuid
      // Refresh all stats
      refreshAllStats?.()
      return index
    } catch (error) {
      // fallback
      setCount(rowIdsRef.current.length)
    }
  }, [
    addAddedRowId,
    addRow,
    dataRef,
    increaseCount,
    rowIdsRef,
    setCount,
    refreshAllStats,
  ])

  useTableRowEvent({
    tableName,
    onInsert: (row) => {
      checkRowExistInQuery(row._id, async (isExist) => {
        if (isExist) {
          updateView()
        } else {
          if (addedRowIds.has(row._id)) {
            const shortId = shortenId(row._id)
            console.time("getOrCreateTableSubDoc")
            if (!tableId) return
            await getOrCreateTableSubDoc({
              docId: shortId,
              title: "",
              tableId: tableId,
            })
            console.timeEnd("getOrCreateTableSubDoc")
            setSubPage(shortId)
          }
        }
      })
      if (addedRowIds.has(row._id)) {
        clearAddedRowIds()
        refreshCurrentVisible()
        return
      }
      // Refresh all stats
      refreshAllStats?.()
    },
    onUpdate(_new, _old) {
      checkRowExistInQuery(_new._id, async (isExist) => {
        const diff = DataChangeEventHandler.getDiff(_old, _new)
        const diffKeys = Object.keys(diff)
        if (!isFieldsInQuery(qs, diffKeys)) {
          // the updated fields are not in the query, no need to update
          return
        }
        if (isExist) {
          updateView()
        } else {
          rowIdsRef.current = rowIdsRef.current.filter((id) => id !== _new._id)
          dataRef.current = dataRef.current.filter((id) => id !== _new._id)
          setCount(rowIdsRef.current.length)
          refreshCurrentVisible()
        }
        // Refresh changed columns' stats (debounced)
        diffKeys.forEach((key) => {
          if (!key.startsWith("_")) {
            debouncedRefreshColumnStat(key)
          }
        })
      })
    },
  })

  return {
    handleAddRow,
    handleDelRows,
    onCellEdited,
    onCellsEdited,
  }
}
