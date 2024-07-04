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
import { useMap } from "ahooks"
import { chunk, range } from "lodash"

import {
  rewriteQuery2getSortedSqliteRowIds,
  rewriteQueryWithOffsetAndLimit,
} from "@/lib/sqlite/sql-sort-parser"
import { IView } from "@/lib/store/IView"
import { getTableIdByRawTableName, shortenId, uuidv7 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useViewSort } from "@/hooks/use-view-sort"
import { useAutoIndex } from "@/components/table/hooks/use-auto-index"
import { useTableRowEvent } from "@/components/table/hooks/use-table-row-event"
import { useViewLoadingStore } from "@/components/table/hooks/use-view-loading"

import { useTableAppStore } from "../store"

export type RowRange = readonly [number, number]
type RowCallback<T> = (range: RowRange, qs?: string) => Promise<readonly T[]>
type RowToCell<T> = (row: T, col: number) => GridCell
export type RowEditedCallback<T> = (
  cell: Item,
  newVal: EditableGridCell,
  rowData: T
) => T | undefined

export function useAsyncData<TRowType>(data: {
  tableName: string
  pageSize: number
  maxConcurrency: number
  // offset limit
  getRowData: RowCallback<string>
  getRowDataById: (id: string) => TRowType
  toCell: RowToCell<TRowType>
  onEdited: RowEditedCallback<TRowType>
  gridRef: MutableRefObject<DataEditorRef | null>
  addRow: (uuid?: string) => Promise<Record<string, any> | undefined>
  deleteRowsByRange: (
    range: { startIndex: number; endIndex: number }[],
    tableName: string,
    query: string
  ) => Promise<void>
  setCount: React.Dispatch<React.SetStateAction<number>>
  viewCount: number
  qs?: string
  view: IView
}): Pick<
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
  const {
    tableName,
    qs,
    pageSize: _pageSize,
    getRowDataById,
    toCell,
    onEdited,
    gridRef,
    addRow,
    deleteRowsByRange,
    setCount,
    maxConcurrency,
    view,
  } = data

  const { addAddedRowId, addedRowIds, clearAddedRowIds } = useTableAppStore()
  const { setSubPage } = useCurrentSubPage()
  const { space, tableId } = useCurrentPathInfo()
  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { getViewSortedRows } = useViewSort(qs || "")
  const { sqlite } = useSqlite()
  const pageSize = Math.min(_pageSize, 50)
  const loadingRef = useRef(CompactSelection.empty())
  const _loadingRef = useRef<number[]>([])
  const dataRef = useRef<string[]>([])
  const rowIdsRef = useRef<string[]>([])
  const [visiblePages, setVisiblePages] = useState<Rectangle>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const visiblePagesRef = useRef(visiblePages)
  visiblePagesRef.current = visiblePages
  const { setRows } = useSqliteStore()
  const { setLoading } = useViewLoadingStore()

  useAutoIndex(view)
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
      const rowUuid = dataRef.current[row]
      const rowData = rowUuid && getRowDataById(rowUuid)
      if (rowUuid !== undefined && rowData) {
        return toCell(rowData, col)
      }
      return {
        kind: GridCellKind.Loading,
        allowOverlay: false,
      }
    },
    [getRowDataById, toCell]
  )

  const getRowDataByIndex = useCallback(
    (index: number) => {
      const rowUuid = dataRef.current[index]
      if (!rowUuid) {
        return undefined
      }
      return getRowDataById(rowUuid)
    },
    [getRowDataById]
  )

  const loadPage = useCallback(
    async (page: number, _pageSize: number = pageSize) => {
      console.time("load page 0")
      if (!sqlite || !tableId) return
      const startIndex = page * _pageSize
      const d = await sqlite.sql4mainThread2(
        rewriteQueryWithOffsetAndLimit(qs || "", startIndex, _pageSize)
      )
      setRows(tableId, d)
      const vr = visiblePagesRef.current
      rowIdsRef.current = d.map((r) => r.rowid)
      console.timeEnd("load page 0")
      const data = dataRef.current
      const damageList: { cell: [number, number] }[] = []
      for (const [i, element] of d.entries()) {
        data[i + startIndex] = element._id
        for (let col = vr.x; col <= vr.x + vr.width; col++) {
          damageList.push({
            cell: [col, i + startIndex],
          })
        }
      }
      gridRef.current?.updateCells(damageList)
    },
    [gridRef, pageSize, qs, setRows, sqlite, tableId]
  )

  const getCellsForSelection = useCallback(
    (r: Rectangle): (() => Promise<CellArray>) => {
      return async () => {
        const firstPage = Math.max(0, Math.floor(r.y / pageSize))
        const lastPage = Math.floor((r.y + r.height) / pageSize)
        console.log("call getCellsForSelection", firstPage, lastPage)
        for (const pageChunk of chunk(
          range(firstPage, lastPage + 1).filter(
            (i) => !loadingRef.current.hasIndex(i)
          ),
          maxConcurrency
        )) {
          // await Promise.allSettled(pageChunk.map(loadPage))
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
    [getCellContent, maxConcurrency, pageSize]
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

  const refreshData = () => {
    loadingRef.current = CompactSelection.empty()
    _loadingRef.current = []
    dataRef.current = []
    rowIdsRef.current = []
  }

  useEffect(() => {
    // refresh data when table name changes
    refreshData()
    loadPage(0)
  }, [tableName, qs, loadPage])

  const getViewSortedSqliteRowIds = useCallback(async () => {
    console.time("get sorted row ids")
    if (!qs || !sqlite) return
    setLoading(qs, true)
    const _qs = rewriteQuery2getSortedSqliteRowIds(qs)
    const res = await sqlite.sql4mainThread(_qs)
    const rowIds = res.map((r) => r[0])
    console.timeEnd("get sorted row ids")
    setLoading(qs, false)
    rowIdsRef.current = rowIds
    setCount(rowIdsRef.current.length)
  }, [qs, setCount, setLoading, sqlite])

  useEffect(() => {
    getViewSortedSqliteRowIds()
  }, [getViewSortedSqliteRowIds, setLoading, sqlite])

  const loadData = useCallback(
    async (loadRowIds: string[], startIndex: number) => {
      if (!sqlite || !tableName || !tableId) return
      if (loadRowIds.length > 0) {
        _loadingRef.current.push(startIndex)
      } else {
        console.log("loadRowIds is empty")
      }
      console.time(`load data ${startIndex}`)
      const d = await sqlite?.sql4mainThread2(
        `select * from ${tableName} where _id in (${loadRowIds
          .map((id) => `'${id}'`)
          .join(",")})`
      )
      setRows(tableId, d)
      console.timeEnd(`load data ${startIndex}`)
      const rowIds = d.map((r) => r._id)
      const vr = visiblePagesRef.current
      const damageList: { cell: [number, number] }[] = []
      const data = dataRef.current
      for (const [i, element] of rowIds.entries()) {
        data[i + startIndex] = element
        for (let col = vr.x; col <= vr.x + vr.width; col++) {
          damageList.push({
            cell: [col, i + startIndex],
          })
        }
      }
      gridRef.current?.updateCells(damageList)
    },
    [gridRef, setRows, sqlite, tableId, tableName]
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
  }, [gridRef])

  useEffect(() => {
    if (!sqlite || !tableName || !tableId) return
    const r = visiblePages
    const firstPage = Math.max(0, Math.floor((r.y - pageSize / 2) / pageSize))
    const lastPage = Math.floor((r.y + r.height + pageSize / 2) / pageSize)
    for (const page of range(firstPage, lastPage + 1)) {
      const startIndex = page * pageSize
      if (_loadingRef.current.includes(startIndex)) continue
      const loadRowIds = rowIdsRef.current.slice(
        page * pageSize,
        (page + 1) * pageSize
      )
      loadData(loadRowIds, startIndex)
    }
  }, [loadData, pageSize, sqlite, tableId, tableName, visiblePages])

  useEffect(() => {
    // when view changes, reset scroll position
    gridRef.current?.scrollTo(0, 0)
  }, [gridRef, view.query])

  const onCellEdited = useCallback(
    (cell: Item, newVal: EditableGridCell) => {
      const [, row] = cell
      const rowData = getRowDataByIndex(row)
      rowData && onEdited(cell, newVal, rowData)
    },
    [getRowDataByIndex, onEdited]
  )

  const getRowIndexById = (rowId: string) => {
    const rowIndex = rowIdsRef.current.findIndex((id) => id === rowId)
    return rowIndex
  }

  const handleDelRows = async (
    ranges: { startIndex: number; endIndex: number }[]
  ) => {
    const _ranges = [...ranges]
    for (const { startIndex, endIndex } of ranges.reverse()) {
      rowIdsRef.current.splice(startIndex, endIndex - startIndex)
    }
    if (!qs) {
      throw new Error("query is empty")
    }
    await deleteRowsByRange(_ranges, tableName, qs)
  }

  const handleAddRow = useCallback(async () => {
    setCount(rowIdsRef.current.length + 1)
    try {
      const uuid = uuidv7()
      addAddedRowId(uuid)
      const rawData = await addRow(uuid)
      if (rawData) {
        await getViewSortedSqliteRowIds()
        return getRowIndexById(rawData._id)
      }
    } catch (error) {
      setCount(rowIdsRef.current.length)
    }
  }, [addAddedRowId, addRow, getViewSortedSqliteRowIds, setCount])

  useTableRowEvent({
    tableName,
    onInsert: (row) => {
      checkRowExistInQuery(row._id, async (isExist) => {
        if (isExist) {
          setCount((prev) => prev + 1)
          getViewSortedRows().then((rows) => {
            const rowIds = rows.map((r) => r._id)
            rowIdsRef.current = rowIds
            dataRef.current = rowIds
            setCount(rowIds.length)
            refreshCurrentVisible()
          })
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
    },
    onUpdate(row) {
      checkRowExistInQuery(row._id, async (isExist) => {
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
      setCount((prev) => {
        return prev - 1
      })
      refreshCurrentVisible()
    },
  })

  return {
    getCellContent,
    onVisibleRegionChanged,
    onCellEdited,
    getCellsForSelection,
    handleAddRow,
    handleDelRows,
    getRowByIndex: getRowDataByIndex,
  }
}
