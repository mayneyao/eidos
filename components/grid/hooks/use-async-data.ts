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

import { DataUpdateSignalType, EidosDataEventChannelMsgType } from "@/lib/const"
import { getTableIdByRawTableName, shortenId, uuidv4 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useCurrentSubPage } from "@/hooks/use-current-sub-page"
import { useSqlite } from "@/hooks/use-sqlite"
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
  delRows: (rowIds: string[]) => Promise<void>,
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
  handleDelRows: (start: number, end: number) => void
  getRowByIndex: (index: number) => TRowType | undefined
} {
  const { addAddedRowId, addedRowIds, clearAddedRowIds } = useTableAppStore()
  const { setSubPage } = useCurrentSubPage()
  const { space, tableId } = useCurrentPathInfo()
  const { getOrCreateTableSubDoc } = useSqlite(space)
  const { getViewSortedRowIds } = useViewSort(qs || "")
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

  const handleAddRow = useCallback(async () => {
    setCount(dataRef.current.length + 1)
    try {
      const uuid = uuidv4()
      addAddedRowId(uuid)
      const rowId = await addRow(uuid)
      if (rowId) {
        dataRef.current.push(rowId)
      }
    } catch (error) {
      setCount(dataRef.current.length)
    }
  }, [addAddedRowId, addRow, setCount])

  const handleDelRows = async (startIndex: number, endIndex: number) => {
    const rowIds = dataRef.current.slice(startIndex, endIndex)
    // remove from data
    const count = endIndex - startIndex
    dataRef.current.splice(startIndex, count)
    setCount(dataRef.current.length)
    await delRows(rowIds)
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

  const getRowByIndex = (index: number) => {
    const rowId = dataRef.current[index]
    return getRowDataById(rowId)
  }

  const getRowIndexById = (id: string) => {
    const rowIndex = dataRef.current.findIndex((rowId) => rowId === id)
    return rowIndex
  }

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
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
            // more simple way to refresh the data, but cost more
            getViewSortedRowIds().then((rowIds) => {
              dataRef.current = rowIds
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            })
            break
            break
          case DataUpdateSignalType.Update:
            // more simple way to refresh the data, but cost more
            getViewSortedRowIds().then((rowIds) => {
              dataRef.current = rowIds
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            })
            break
          case DataUpdateSignalType.Delete:
            const rowIndex2 = getRowIndexById(_old._id)
            if (rowIndex2 !== -1) {
              dataRef.current.splice(rowIndex2, 1)
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            }
            break
          // case DataUpdateSignalType.Update:
          //   const rowIndex = getRowIndexById(_old._id)
          //   checkRowExistInQuery(_new._id, (isExist) => {
          //     if (rowIndex !== -1) {
          //       // FIXME: for now we just refresh the visible region, link cell has some problem
          //       if (isExist) {
          //         dataRef.current[rowIndex] = _new._id
          //         refreshCurrentVisible()
          //       } else {
          //         // remove from data
          //         dataRef.current.splice(rowIndex, 1)
          //         setCount(dataRef.current.length)
          //         refreshCurrentVisible()
          //       }
          //     } else {
          //       if (isExist) {
          //         dataRef.current.push(_new._id)
          //         setCount(dataRef.current.length)
          //         refreshCurrentVisible()
          //       }
          //     }
          //   })
          //   break
          // case DataUpdateSignalType.Delete:
          //   const rowIndex2 = getRowIndexById(_old._id)
          //   if (rowIndex2 !== -1) {
          //     dataRef.current.splice(rowIndex2, 1)
          //     setCount(dataRef.current.length)
          //     refreshCurrentVisible()
          //   }
          //   break
          // case DataUpdateSignalType.Insert:
          //   const rowIndex3 = getRowIndexById(_new._id)
          //   // if the row is added by click add row button
          //   if (addedRowIds.has(_new._id)) {
          //     clearAddedRowIds()
          //     return
          //     checkRowExistInQuery(_new._id, async (isExist) => {
          //       if (!isExist) {
          //         // new record is not in query, open as sub-page
          //         const docId = shortenId(_new._id)
          //         await getOrCreateTableSubDoc({
          //           docId,
          //           title: _new.title,
          //           tableId: tableId!,
          //         })
          //         setSubPage(docId)
          //       }
          //     })
          //   } else {
          //     // if the row is added by other user
          //     checkRowExistInQuery(_new._id, async (isExist) => {
          //       if (isExist && rowIndex3 === -1) {
          //         dataRef.current.push(_new._id)
          //         setCount(dataRef.current.length)
          //         refreshCurrentVisible()
          //       }
          //     })
          //   }
          //   break
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
    addedRowIds,
    checkRowExistInQuery,
    clearAddedRowIds,
    getOrCreateTableSubDoc,
    getViewSortedRowIds,
    refreshCurrentVisible,
    setCount,
    setSubPage,
    tableId,
    tableName,
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
