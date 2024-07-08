import { MutableRefObject, useCallback, useContext } from "react"
import { DataChangeEventHandler } from "@/worker/web-worker/data-pipeline/DataChangeEventHandler"
import {
  DataEditorRef,
  EditableGridCell,
  Item,
  Rectangle,
} from "@glideapps/glide-data-grid"
import { IView } from "lib/store/IView"

import { isFieldsInQuery } from "@/lib/sqlite/sql-view-query"
import { getTableIdByRawTableName, uuidv7 } from "@/lib/utils"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useSqlite } from "@/hooks/use-sqlite"
import { useTableOperation } from "@/hooks/use-table"
import { TableContext } from "@/components/table/hooks"
import { useTableRowEvent } from "@/components/table/hooks/use-table-row-event"
import { useViewCount } from "@/components/table/hooks/use-view-count"

import { useTableAppStore } from "../store"
import { useDataSource } from "./use-data-source"

interface IUseDataMutationProps {
  gridRef: MutableRefObject<DataEditorRef | null>
  visiblePagesRef: MutableRefObject<Rectangle>
  dataRef: MutableRefObject<string[]>
  rowIdsRef: MutableRefObject<string[]>
  getRowDataByIndex: (index: number) => any
  getViewSortedRows: () => Promise<any[]>
  view: IView
}

export const useDataMutation = ({
  view,
  gridRef,
  dataRef,
  rowIdsRef,
  visiblePagesRef,
  getRowDataByIndex,
  getViewSortedRows,
}: IUseDataMutationProps) => {
  const { addAddedRowId, addedRowIds, clearAddedRowIds } = useTableAppStore()
  const { setSubPage } = useCurrentSubPage()
  const { tableName, space } = useContext(TableContext)

  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { increaseCount, reduceCount, setCount } = useViewCount(view)

  //   const { getViewSortedRows } = useViewSort()
  const { query: qs, table_id } = view
  const { sqlite } = useSqlite()
  const { toCell, onEdited } = useDataSource(tableName, space)

  const { deleteRowsByRange, getRowData, getRowDataById, addRow } =
    useTableOperation(tableName, space)

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
      const [, row] = cell
      const rowData = getRowDataByIndex(row)
      rowData && onEdited(cell, newVal, rowData)
    },
    [getRowDataByIndex, onEdited]
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
    const _ranges = [...ranges]
    for (const { startIndex, endIndex } of ranges.reverse()) {
      rowIdsRef.current.splice(startIndex, endIndex - startIndex)
      dataRef.current.splice(startIndex, endIndex - startIndex)
    }
    if (!qs) {
      throw new Error("query is empty")
    }
    await deleteRowsByRange(_ranges, tableName, qs)
  }

  const handleAddRow = useCallback(async () => {
    // update ui first
    increaseCount()
    try {
      const uuid = uuidv7()
      addAddedRowId(uuid)
      await addRow(uuid)
      rowIdsRef.current.push(uuid)
      dataRef.current.push(uuid)
      return rowIdsRef.current.length - 1
      // if (rawData) {
      //   // await getViewSortedSqliteRowIds()
      //   return rowIdsRef.current.length + 1
      //   // return getRowIndexById(rawData._id)
      // }
    } catch (error) {
      // fallback
      setCount(rowIdsRef.current.length)
    }
  }, [addAddedRowId, addRow, dataRef, increaseCount, rowIdsRef, setCount])

  useTableRowEvent({
    tableName,
    onInsert: (row) => {
      // checkRowExistInQuery(row._id, async (isExist) => {
      //   if (isExist) {
      //     getViewSortedRows().then((rows) => {
      //       const rowIds = rows.map((r) => r._id)
      //       rowIdsRef.current = rowIds
      //       dataRef.current = rowIds
      //       setCount(rowIds.length)
      //       refreshCurrentVisible()
      //     })
      //   } else {
      //     if (addedRowIds.has(row._id)) {
      //       const shortId = shortenId(row._id)
      //       console.time("getOrCreateTableSubDoc")
      //       if (!tableId) return
      //       await getOrCreateTableSubDoc({
      //         docId: shortId,
      //         title: "",
      //         tableId: tableId,
      //       })
      //       console.timeEnd("getOrCreateTableSubDoc")
      //       setSubPage(shortId)
      //     }
      //   }
      // })
      if (addedRowIds.has(row._id)) {
        clearAddedRowIds()
        refreshCurrentVisible()
        return
      }
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
          getViewSortedRows().then((rows) => {
            const rowIds = rows.map((r) => r._id)
            setCount(rowIds.length)
            refreshCurrentVisible()
          })
        } else {
          getViewSortedRows().then((rows) => {
            const rowIds = rows.map((r) => r._id)
            setCount(rowIds.length)
            refreshCurrentVisible()
          })
        }
      })
    },
    onDelete(row) {
      rowIdsRef.current = rowIdsRef.current.filter((id) => id !== row.row_id)
      dataRef.current = rowIdsRef.current
      reduceCount()
      refreshCurrentVisible()
    },
  })

  return {
    handleAddRow,
    handleDelRows,
    onCellEdited,
    onCellsEdited,
  }
}
