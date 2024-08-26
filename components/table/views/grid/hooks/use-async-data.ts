import {
  MutableRefObject,
  useCallback,
  useContext,
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
  rewriteQuery2getSortedSqliteRowIds,
  rewriteQueryWithOffsetAndLimit,
  rewriteQueryWithSortedQuery,
} from "@/lib/sqlite/sql-sort-parser"
import { IView } from "@/lib/store/IView"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useAutoIndex } from "@/components/table/hooks/use-auto-index"
import { useViewCount } from "@/components/table/hooks/use-view-count"
import { useViewLoadingStore } from "@/components/table/hooks/use-view-loading"

import { useDataMutation } from "./use-data-mutation"
import { TableContext } from "@/components/table/hooks"

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
  gridRef: MutableRefObject<DataEditorRef | null>
  viewCount: number
  view: IView
}): Pick<
  DataEditorProps,
  | "getCellContent"
  | "onVisibleRegionChanged"
  | "onCellEdited"
  | "onCellsEdited"
  | "getCellsForSelection"
> & {
  handleAddRow: () => void
  handleDelRows: (range: { startIndex: number; endIndex: number }[]) => void
  getRowByIndex: (index: number) => TRowType | undefined
  getIndexByRowId: (rowId: string) => number
} {
  const {
    tableName,
    pageSize: _pageSize,
    getRowDataById,
    toCell,
    gridRef,
    maxConcurrency,
    view,
  } = data
  const tableId = view.table_id
  const qs = view.query
  const { sqlite } = useSqlite()
  const pageSize = Math.min(_pageSize, 50)
  const loadingRef = useRef(CompactSelection.empty())
  const _loadingRef = useRef<number[]>([])
  // rowIdsRef and dataRef are same thing, the diff is rowIdsRef has all row ids, dataRef has only part of row ids
  const dataRef = useRef<string[]>([])
  const rowIdsRef = useRef<string[]>([])
  const { setCount } = useViewCount(view)

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
  const { isReadOnly } = useContext(TableContext)

  const getCellContent = useCallback<DataEditorProps["getCellContent"]>(
    (cell) => {
      const [col, row] = cell
      const rowUuid = dataRef.current[row]
      const rowData = rowUuid && getRowDataById(rowUuid)
      if (rowUuid !== undefined && rowData) {
        const cell = toCell(rowData, col)
        const isFileCell = cell.kind === GridCellKind.Custom && (cell.data as any).kind === "file-cell"
        return {
          ...cell,
          readonly: Boolean(isReadOnly),
          allowOverlay: isFileCell,
        } as any
      }
      return {
        kind: GridCellKind.Loading,
        allowOverlay: false,
      }
    },
    [getRowDataById, toCell, isReadOnly]
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
      if (!sqlite || !tableId) return
      const startIndex = page * _pageSize
      let sql = rewriteQueryWithOffsetAndLimit(qs || "", startIndex, _pageSize)
      const d = await sqlite.sql4mainThread2(sql)
      setRows(tableId, d)
      const vr = visiblePagesRef.current
      rowIdsRef.current = d.map((r: any) => r._id)
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
    if (!qs || !sqlite) return
    setLoading(qs, true)
    const _qs = rewriteQuery2getSortedSqliteRowIds(qs)
    const res = await sqlite.sql4mainThread(_qs)
    const rowIds = res.map((r: any) => r[0])
    setLoading(qs, false)
    rowIdsRef.current = rowIds
    setCount(rowIdsRef.current.length)
  }, [qs, setCount, setLoading, sqlite])

  useEffect(() => {
    getViewSortedSqliteRowIds()
  }, [getViewSortedSqliteRowIds, setLoading, sqlite])

  const loadData = useCallback(
    async (loadRowIds: string[], startIndex: number) => {
      if (!sqlite || !tableName || !tableId || !qs) return
      if (loadRowIds.length > 0) {
        _loadingRef.current.push(startIndex)
      } else {
        return
      }
      let sql = `select * from ${tableName} where _id in (${loadRowIds
        .map((id) => `'${id}'`)
        .join(",")})`
      sql = rewriteQueryWithSortedQuery(sql, qs)
      const d = await sqlite?.sql4mainThread2(sql)
      setRows(tableId, d)
      const rowIds = d.map((r: any) => r._id)
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
    [gridRef, qs, setRows, sqlite, tableId, tableName]
  )

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

  const getIndexByRowId = useCallback(
    (rowId: string) => {
      return rowIdsRef.current.findIndex((r) => r === rowId)
    },
    [rowIdsRef]
  )

  const { handleAddRow, handleDelRows, onCellEdited, onCellsEdited } =
    useDataMutation({
      view,
      gridRef,
      visiblePagesRef,
      dataRef,
      rowIdsRef,
      getRowDataByIndex,
    })

  return {
    getCellContent,
    handleAddRow,
    handleDelRows,
    onCellEdited,
    onCellsEdited,
    onVisibleRegionChanged,
    getCellsForSelection,
    getRowByIndex: getRowDataByIndex,
    getIndexByRowId,
  }
}
