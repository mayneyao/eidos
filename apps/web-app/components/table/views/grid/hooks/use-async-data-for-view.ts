import type {
  CellArray,
  DataEditorProps,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  Item,
  Rectangle
} from "@glideapps/glide-data-grid";
import {
  CompactSelection,
  GridCellKind
} from "@glideapps/glide-data-grid"
import chunk from "lodash/chunk"
import range from "lodash/range"
import type {
  MutableRefObject
} from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { useAutoIndex } from "@/components/table/hooks/use-auto-index"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import {
  rewriteQueryWithOffsetAndLimit,
  rewriteQueryWithSortedQuery
} from "@/packages/core/sqlite/sql-sort-parser"
import type { IView } from "@/packages/core/types/IView"
import { useDebounceFn } from "ahooks"

import { TableContext } from "@/components/table/hooks"
import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { useDataMutation } from "./use-data-mutation"
import { useNavigate } from "react-router-dom"
import { useReadonlySqlite } from "@/hooks/use-readonly-sqlite";

export type RowRange = readonly [number, number]
type RowCallback<T> = (range: RowRange, qs?: string) => Promise<readonly T[]>
type RowToCell<T> = (row: T, col: number) => GridCell
export type RowEditedCallback<T> = (
  cell: Item,
  newVal: EditableGridCell,
  rowData: T
) => T | undefined

export function useAsyncDataForView<TRowType>(data: {
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
  isPreview?: boolean
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
    isPreview,
  } = data
  const tableId = view.table_id
  const isView = tableName.startsWith("vw_")
  const qs = view.query
  const readonlySqlite = useReadonlySqlite()
  const { sqlite: _sqlite } = useSqlite()
  // when preview, the dataview is temporary view, only exists in memory, so we use sqlite. 
  // when view is not preview, the dataview is permanent view, so we can use readonly sqlite.
  const sqlite = isPreview ? _sqlite : readonlySqlite
  const pageSize = Math.min(_pageSize, 50)
  const loadingRef = useRef(CompactSelection.empty())
  const _loadingRef = useRef<number[]>([])
  // rowIdsRef and dataRef are same thing, the diff is rowIdsRef has all row ids, dataRef has only part of row ids
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
  const navigate = useNavigate()

  const getCellContent = useCallback<DataEditorProps["getCellContent"]>(
    (cell) => {
      const [col, row] = cell
      const rowUuid = isView ? row + '' : dataRef.current[row]
      const rowData = rowUuid && getRowDataById(rowUuid)
      if (rowUuid !== undefined && rowData) {
        const cell = toCell(rowData, col)
        const isFileCell = cell.kind === GridCellKind.Custom && (cell.data as any).kind === "file-cell"
        const isUrlCell = cell.kind === GridCellKind.Uri
        if (isUrlCell) {
          return {
            ...cell,
            readonly: true,
            allowOverlay: true,
            onClickUri: (args: any) => {
              if (cell.data.startsWith("/")) {
                navigate(cell.data)
              } else {
                window.open(cell.data, "_blank")
              }
            },
          } as any
        }
        return {
          ...cell,
          readonly: true,
          allowOverlay: true,
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
      if (isView) {
        console.log("getRowDataByIndex", { index, isView })
        return getRowDataById(index + '')
      }
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
      setRows(tableId, d, startIndex, true)
      const vr = visiblePagesRef.current
      rowIdsRef.current = isView ? Array.from({ length: d.length }, (_, i) => i + '') : d.map((r: any) => r._id)
      const data = dataRef.current
      const damageList: { cell: [number, number] }[] = []
      for (const [i, element] of d.entries()) {
        data[i + startIndex] = isView ? i + startIndex + '' : element._id
        for (let col = vr.x; col <= vr.x + vr.width; col++) {
          damageList.push({
            cell: [col, i + startIndex],
          })
        }
      }
      gridRef.current?.updateCells(damageList)
    },
    [gridRef, pageSize, qs, setRows, sqlite, tableId, isView]
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
      setRows(tableId, d, startIndex, true)
      const rowIds = isView ? Array.from({ length: d.length }, (_, i) => i + '') : d.map((r: any) => r._id)
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
    [gridRef, qs, setRows, sqlite, tableId, tableName, isView]
  )

  const loadDataWithOffsetAndLimit = useCallback(
    async (page: number, _pageSize: number = pageSize) => {
      if (!sqlite || !tableName || !tableId || !qs) return
      const startIndex = page * _pageSize
      _loadingRef.current.push(startIndex)
      let sql = rewriteQueryWithOffsetAndLimit(qs, startIndex, _pageSize)
      const d = await sqlite?.sql4mainThread2(sql)
      console.log("loadDataWithOffsetAndLimit", { d, isView, sql })
      setRows(tableId, d, startIndex, true)
      const rowIds = isView ? Array.from({ length: d.length }, (_, i) => i + '') : d.map((r: any) => r._id)
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
    [gridRef, qs, setRows, sqlite, tableId, tableName, pageSize, isView]
  )


  const loadDataWithOffsetAndLimitInVisible = useCallback(() => {
    if (!sqlite || !tableName || !tableId) return
    const r = visiblePages
    const firstPage = Math.max(0, Math.floor((r.y - pageSize / 2) / pageSize))
    const lastPage = Math.floor((r.y + r.height + pageSize / 2) / pageSize)
    for (const page of range(firstPage, lastPage + 1)) {
      if (isInkServiceMode || isDesktopMode) {
        if (_loadingRef.current.includes(page * pageSize)) continue
        loadDataWithOffsetAndLimit(page)
      } else {
        const startIndex = page * pageSize
        if (_loadingRef.current.includes(startIndex)) continue
        const loadRowIds = rowIdsRef.current.slice(
          page * pageSize,
          (page + 1) * pageSize
        )
        loadData(loadRowIds, startIndex)
      }
    }
  }, [loadData, pageSize, sqlite, tableId, tableName, visiblePages])

  const { run: loadDataWithOffsetAndLimitDebounced } = useDebounceFn(loadDataWithOffsetAndLimitInVisible, { wait: 100, leading: true, trailing: true })

  useEffect(() => {
    if (isDesktopMode) {
      // load more data, but flash
      // loadDataWithOffsetAndLimitInVisible()
      loadDataWithOffsetAndLimitDebounced()
    } else {
      // less data, no flash, but blank page
      loadDataWithOffsetAndLimitDebounced()
    }
  }, [loadData, pageSize, sqlite, tableId, tableName, visiblePages, loadDataWithOffsetAndLimitDebounced, loadDataWithOffsetAndLimitInVisible])

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