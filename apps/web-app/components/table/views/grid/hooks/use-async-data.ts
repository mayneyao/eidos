import type {
  BaseGridMouseEventArgs,
  CellArray,
  DataEditorProps,
  DataEditorRef,
  EditableGridCell,
  GridCell,
  Item,
  Rectangle,
} from "@glideapps/glide-data-grid"
import { CompactSelection, GridCellKind } from "@glideapps/glide-data-grid"
import { chunk, range } from "@/lib/lodash"
import type { MutableRefObject } from "react"
import { useCallback, useContext, useEffect, useRef, useState } from "react"

import { useAutoIndex } from "@/components/table/hooks/use-auto-index"
import { useViewCount } from "@/components/table/hooks/use-view-count"
import { useViewLoadingStore } from "@/components/table/hooks/use-view-loading"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import {
  _rewriteQuery2getSortedSqliteRowIds,
  rewriteQuery2getSortedSqliteRowIds,
  rewriteQueryWithOffsetAndLimit,
  rewriteQueryWithSortedQuery,
} from "@/packages/core/sqlite/sql-sort-parser"
import type { IView } from "@/packages/core/types/IView"
import { useDebounceFn } from "ahooks"

import { TableContext } from "@/components/table/hooks"
import { isInkServiceMode, isDesktopMode } from "@/lib/env"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useDataMutation } from "./use-data-mutation"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

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
  // Stats refresh callbacks
  refreshAllStats?: () => void
  refreshColumnStat?: (columnName: string) => void
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
    refreshAllStats,
    refreshColumnStat,
  } = data
  const tableId = view.table_id
  const isView = tableName.startsWith("vw_")
  const qs = view.query
  const { sqlite } = useSqlite()
  const pageSize = Math.min(_pageSize, 50)
  const loadingRef = useRef(CompactSelection.empty())
  const _loadingRef = useRef<number[]>([])
  // rowIdsRef and dataRef are same thing, the diff is rowIdsRef has all row ids, dataRef has only part of row ids
  const dataRef = useRef<string[]>([])
  const rowIdsRef = useRef<string[]>([])
  const { count } = useViewCount(view)

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
  const { navigate } = useRouterAdapter()

  const getCellContent = useCallback<DataEditorProps["getCellContent"]>(
    (cell) => {
      const [col, row] = cell
      const rowUuid = isView ? row + "" : dataRef.current[row]
      const rowData = rowUuid && getRowDataById(rowUuid)
      if (rowUuid !== undefined && rowData) {
        const cell = toCell(rowData, col)
        const isFileCell =
          cell.kind === GridCellKind.Custom &&
          (cell.data as any).kind === "file-cell"
        const isUrlCell = cell.kind === GridCellKind.Uri
        if (isUrlCell) {
          return {
            ...cell,
            readonly: isReadOnly,
            allowOverlay: true,
            onClickUri: (args: BaseGridMouseEventArgs) => {
              if (cell.data.startsWith("/")) {
                const openInNewTab = args.ctrlKey || args.metaKey
                navigate(cell.data, {
                  target: openInNewTab ? "_blank" : undefined,
                })
              } else {
                const openInRightPanel = args.metaKey || args.ctrlKey
                if (openInRightPanel) {
                  const { openTab } = useTabStore.getState()
                  openTab(cell.data, "URL", { openInRightPanel: true })
                } else {
                  window.open(cell.data, "_blank")
                }
              }
            },
          } as any
        }
        if (!isReadOnly) {
          return cell
        }
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
      if (isView) {
        console.log("getRowDataByIndex", { index, isView })
        return getRowDataById(index + "")
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
      setRows(tableId, d, startIndex)
      const vr = visiblePagesRef.current
      rowIdsRef.current = isView
        ? Array.from({ length: d.length }, (_, i) => i + "")
        : d.map((r: any) => r._id)
      const data = dataRef.current
      const damageList: { cell: [number, number] }[] = []
      for (const [i, element] of d.entries()) {
        data[i + startIndex] = isView ? i + startIndex + "" : element._id
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
  const { setBlockUIMsg, setBlockUIData } = useAppRuntimeStore()

  const getViewSortedSqliteRowIds = useCallback(async () => {
    if (!qs || !sqlite) return
    setLoading(qs, true)
    let allRowIds: string[] = []
    const batchSize = 150000
    if (count > batchSize) {
      setBlockUIMsg("loading")
    }
    const start = performance.now()
    const queries = rewriteQuery2getSortedSqliteRowIds(qs, count, batchSize)
    // for (let i = 0; i < queries.length; i++) {
    //   const res = await sqlite.sql4mainThread(queries[i])
    //   setBlockUIData({
    //     progress: (i / queries.length) * 100,
    //   })
    //   const rowIds = res.map((r: any) => r[0])
    //   allRowIds = allRowIds.concat(rowIds)

    //   // If we've fetched less than 200,000 rows (except for the last query), we can stop
    //   if (i < queries.length - 1 && rowIds.length < batchSize) {
    //     break
    //   }
    // }

    let completedCount = 0
    const queryPromises = queries.map((query) =>
      sqlite!.sql4mainThread(query).then((res) => {
        completedCount++
        setBlockUIData({
          progress: (completedCount / queries.length) * 100,
        })
        return res
      })
    )

    const results = await Promise.all(queryPromises)
    for (let i = 0; i < results.length; i++) {
      const rowIds = results[i].map((r: any) => r[0])
      allRowIds = allRowIds.concat(rowIds)
      // If we've fetched less than 200,000 rows (except for the last query), we can stop
      if (i < results.length - 1 && rowIds.length < batchSize) {
        break
      }
    }
    const end = performance.now()
    console.log(`Time taken: ${end - start} milliseconds for ${count} rows`)
    setBlockUIMsg(null)
    // const _qs = _rewriteQuery2getSortedSqliteRowIds(qs)
    // const res = await sqlite.sql4mainThread(_qs)
    // allRowIds = res.map((r: any) => r[0])

    rowIdsRef.current = allRowIds
    // setCount(allRowIds.length)
    setLoading(qs, false)
  }, [qs, setLoading, count, sqlite])

  // Track previous count to detect changes from other tabs
  const prevCountRef = useRef(count)

  useEffect(() => {
    if (isReadOnly) {
      return
    }
    getViewSortedSqliteRowIds()
  }, [getViewSortedSqliteRowIds])

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
      setRows(tableId, d, startIndex)
      const rowIds = isView
        ? Array.from({ length: d.length }, (_, i) => i + "")
        : d.map((r: any) => r._id)
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
      setRows(tableId, d, startIndex)
      const rowIds = isView
        ? Array.from({ length: d.length }, (_, i) => i + "")
        : d.map((r: any) => r._id)
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

  const { run: loadDataWithOffsetAndLimitDebounced } = useDebounceFn(
    loadDataWithOffsetAndLimitInVisible,
    { wait: 100, leading: true, trailing: true }
  )

  useEffect(() => {
    if (isDesktopMode) {
      // load more data, but flash
      // loadDataWithOffsetAndLimitInVisible()
      loadDataWithOffsetAndLimitDebounced()
    } else {
      // less data, no flash, but blank page
      loadDataWithOffsetAndLimitDebounced()
    }
  }, [
    loadData,
    pageSize,
    sqlite,
    tableId,
    tableName,
    visiblePages,
    loadDataWithOffsetAndLimitDebounced,
    loadDataWithOffsetAndLimitInVisible,
  ])

  // When count changes (e.g., due to insert/delete from another tab via shared store),
  // we need to reload data to stay in sync
  useEffect(() => {
    if (count !== prevCountRef.current) {
      prevCountRef.current = count
      // Clear the loading cache so pages can be reloaded with fresh data
      _loadingRef.current = []
      // Reload the current visible region to get updated data
      loadDataWithOffsetAndLimitDebounced()
    }
  }, [count, loadDataWithOffsetAndLimitDebounced])

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
      refreshAllStats,
      refreshColumnStat,
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
