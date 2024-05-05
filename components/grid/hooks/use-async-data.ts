import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  CellArray,
  CompactSelection,
  DataEditorProps,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  GridCellKind,
  Item,
  Rectangle,
} from "@glideapps/glide-data-grid"
import { chunk, range } from "lodash"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsg,
  EidosDataEventChannelMsgType,
} from "@/lib/const"
import { hasOrderBy } from "@/lib/sqlite/sql-sort-parser"
import { getTableIdByRawTableName, shortenId, uuidv4 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useSqlite } from "@/hooks/use-sqlite"
import { useUiColumns } from "@/hooks/use-ui-columns"
import { useViewSort } from "@/hooks/use-view-sort"

import { useTableAppStore } from "../store"

export type RowRange = readonly [number, number]
type RowCallback<T> = (range: RowRange, qs?: string) => Promise<readonly T[]>
type RowToCell<T> = (row: T, col: number) => GridCell
export type RowEditedCallback<T> = (
  cell: Item,
  newVal: EditableGridCell,
  rowData: T
) => T | undefined

export function useAsyncData<TRowType>(
  tableName: string,
  pageSize: number,
  maxConcurrency: number,
  // offset limit
  getRowData: RowCallback<string>,
  getRowDataById: (id: string) => TRowType,
  toCell: RowToCell<TRowType>,
  onEdited: RowEditedCallback<TRowType>,
  gridRef: MutableRefObject<DataEditorRef | null>,
  addRow: (uuid?: string) => Promise<string | undefined>,
  deleteRowsByRange: (
    range: { startIndex: number; endIndex: number }[],
    tableName: string,
    query: string
  ) => Promise<void>,
  setCount: (count: number) => void,
  qs?: string
): Pick<
  DataEditorProps,
  | "getCellContent"
  | "onVisibleRegionChanged"
  | "onCellEdited"
  | "getCellsForSelection"
> & {
  handleAddRow: () => void
  handleDelRows: (range: { startIndex: number; endIndex: number }[]) => void
  getRowByIndex: (index: number) => TRowType | undefined
} {
  const { addAddedRowId, addedRowIds, clearAddedRowIds } = useTableAppStore()
  const { setSubPage } = useCurrentSubPage()
  const { space, tableId } = useCurrentPathInfo()
  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { getViewSortedRows } = useViewSort(qs || "")
  const { updateUiColumns } = useUiColumns(tableName)
  const _hasOrderBy = hasOrderBy(qs)
  const { sqlite } = useSqlite()

  pageSize = Math.max(pageSize, 1)
  const loadingRef = useRef(CompactSelection.empty())
  const dataRef = useRef<string[]>([])
  const [visiblePages, setVisiblePages] = useState<Rectangle>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const visiblePagesRef = useRef(visiblePages)
  visiblePagesRef.current = visiblePages

  const onVisibleRegionChanged: NonNullable<
    DataEditorProps["onVisibleRegionChanged"]
  > = useCallback((r) => {
    setVisiblePages((cv) => {
      if (
        r.x === cv.x &&
        r.y === cv.y &&
        r.width === cv.width &&
        r.height === cv.height
      )
        return cv
      return r
    })
  }, [])

  const getCellContent = useCallback<DataEditorProps["getCellContent"]>(
    (cell) => {
      const [col, row] = cell
      const rowId: string | undefined = dataRef.current[row]
      const rowData = getRowDataById(rowId)
      if (rowId !== undefined) {
        return toCell(rowData, col)
      }
      return {
        kind: GridCellKind.Loading,
        allowOverlay: false,
      }
    },
    [getRowDataById, toCell]
  )

  const loadPage = useCallback(
    async (page: number) => {
      loadingRef.current = loadingRef.current.add(page)
      const startIndex = page * pageSize
      const d = await getRowData([startIndex, (page + 1) * pageSize], qs)

      const vr = visiblePagesRef.current

      const damageList: { cell: [number, number] }[] = []
      const data = dataRef.current
      for (const [i, element] of d.entries()) {
        data[i + startIndex] = element
        for (let col = vr.x; col <= vr.x + vr.width; col++) {
          damageList.push({
            cell: [col, i + startIndex],
          })
        }
      }
      gridRef.current?.updateCells(damageList)
    },
    [getRowData, gridRef, pageSize, qs]
  )

  const getCellsForSelection = useCallback(
    (r: Rectangle): (() => Promise<CellArray>) => {
      return async () => {
        const firstPage = Math.max(0, Math.floor(r.y / pageSize))
        const lastPage = Math.floor((r.y + r.height) / pageSize)

        for (const pageChunk of chunk(
          range(firstPage, lastPage + 1).filter(
            (i) => !loadingRef.current.hasIndex(i)
          ),
          maxConcurrency
        )) {
          await Promise.allSettled(pageChunk.map(loadPage))
        }

        const result: GridCell[][] = []

        for (let y = r.y; y < r.y + r.height; y++) {
          const row: GridCell[] = []
          for (let x = r.x; x < r.x + r.width; x++) {
            row.push(getCellContent([x, y]))
          }
          result.push(row)
        }

        return result
      }
    },
    [getCellContent, loadPage, maxConcurrency, pageSize]
  )

  const refreshData = () => {
    loadingRef.current = CompactSelection.empty()
    dataRef.current = []
  }

  // check a record whether exist in a view after insert/update
  const checkRowExistInQuery = useCallback(
    async (rowId: string, callback: (isExist: boolean) => void) => {
      if (!sqlite || !qs) return
      const tableId = getTableIdByRawTableName(tableName)
      const isExist = await sqlite.isRowExistInQuery(tableId, rowId, qs)
      callback(isExist)
    },
    [sqlite, qs, tableName]
  )

  useEffect(() => {
    // refresh data when table name changes
    refreshData()
  }, [tableName, qs])

  useEffect(() => {
    const r = visiblePages
    const firstPage = Math.max(0, Math.floor((r.y - pageSize / 2) / pageSize))
    const lastPage = Math.floor((r.y + r.height + pageSize / 2) / pageSize)
    for (const page of range(firstPage, lastPage + 1)) {
      if (loadingRef.current.hasIndex(page)) continue
      void loadPage(page)
    }
  }, [loadPage, pageSize, visiblePages])

  const onCellEdited = useCallback(
    (cell: Item, newVal: EditableGridCell) => {
      const [, row] = cell
      const current = dataRef.current[row]
      if (current === undefined) return
      const rowData = getRowDataById(current)
      onEdited(cell, newVal, rowData)
    },
    [getRowDataById, onEdited]
  )

  const getRowIndexById = (id: string) => {
    const rowIndex = dataRef.current.findIndex((rowId) => rowId === id)
    return rowIndex
  }

  const handleDelRows = async (
    ranges: { startIndex: number; endIndex: number }[]
  ) => {
    const _ranges = [...ranges]
    for (const { startIndex, endIndex } of ranges.reverse()) {
      dataRef.current.splice(startIndex, endIndex - startIndex)
    }
    setCount(dataRef.current.length)
    if (!qs) {
      throw new Error("query is empty")
    }
    await deleteRowsByRange(_ranges, tableName, qs)
  }

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
  }, [gridRef])

  const handleAddRow = useCallback(async () => {
    setCount(dataRef.current.length + 1)
    try {
      const uuid = uuidv4()
      addAddedRowId(uuid)
      const rowId = await addRow(uuid)
      if (rowId) {
        dataRef.current.push(rowId)
        const rows = await getViewSortedRows()
        const rowIds = rows.map((r) => r._id)
        dataRef.current = rowIds
        setCount(dataRef.current.length)
        return getRowIndexById(rowId)
      }
    } catch (error) {
      setCount(dataRef.current.length)
    }
  }, [addAddedRowId, addRow, getViewSortedRows, setCount])

  const getRowByIndex = (index: number) => {
    const rowId = dataRef.current[index]
    return getRowDataById(rowId)
  }

  useEffect(() => {
    const handler = (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.DataUpdateSignalType) {
        const { table, _new, _old } = payload
        if (tableName !== table) return
        switch (payload.type) {
          case DataUpdateSignalType.Insert:
            checkRowExistInQuery(_new._id, async (isExist) => {
              if (!isExist) {
                // new record is not in query, open as sub-page
                const docId = shortenId(_new._id)
                await getOrCreateTableSubDoc({
                  docId,
                  title: _new.title,
                  tableId: tableId!,
                })
                setSubPage(docId)
              }
            })
            if (addedRowIds.has(_new._id)) {
              clearAddedRowIds()
              refreshCurrentVisible()
              return
            }
            // more simple way to refresh the data, but cost more
            getViewSortedRows().then((rows) => {
              const rowIds = rows.map((r) => r._id)
              dataRef.current = rowIds
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            })
            break
          case DataUpdateSignalType.Update:
            // more simple way to refresh the data, but cost more
            _hasOrderBy &&
              getViewSortedRows().then((rows) => {
                const rowIds = rows.map((r) => r._id)
                dataRef.current = rowIds
                setCount(dataRef.current.length)
                refreshCurrentVisible()
              })
            break
          case DataUpdateSignalType.Delete:
            // more simple way to refresh the data, but cost more
            getViewSortedRows().then((rows) => {
              const rowIds = rows.map((r) => r._id)
              dataRef.current = rowIds
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            })
            break
          default:
            break
        }
      }
    }
    window.addEventListener("message", handler)
    return () => {
      window.removeEventListener("message", handler)
    }
  }, [
    _hasOrderBy,
    addedRowIds,
    checkRowExistInQuery,
    clearAddedRowIds,
    getOrCreateTableSubDoc,
    getViewSortedRows,
    refreshCurrentVisible,
    setCount,
    setSubPage,
    tableId,
    tableName,
    updateUiColumns,
  ])

  return {
    getCellContent,
    onVisibleRegionChanged,
    onCellEdited,
    getCellsForSelection,
    handleAddRow,
    handleDelRows,
    getRowByIndex,
  }
}
