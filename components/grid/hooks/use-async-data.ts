import React, { useEffect } from "react"
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
import chunk from "lodash/chunk.js"
import range from "lodash/range.js"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"

export type RowRange = readonly [number, number]
type RowCallback<T> = (range: RowRange) => Promise<readonly T[]>
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
  getRowData: RowCallback<TRowType>,
  toCell: RowToCell<TRowType>,
  onEdited: RowEditedCallback<TRowType>,
  gridRef: React.MutableRefObject<DataEditorRef | null>,
  addRow: () => void,
  delRows: (rowIds: string[]) => Promise<void>,
  setCount: (count: number) => void
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
  pageSize = Math.max(pageSize, 1)
  const loadingRef = React.useRef(CompactSelection.empty())
  const dataRef = React.useRef<TRowType[]>([])
  const [visiblePages, setVisiblePages] = React.useState<Rectangle>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })
  const visiblePagesRef = React.useRef(visiblePages)
  visiblePagesRef.current = visiblePages

  const onVisibleRegionChanged: NonNullable<
    DataEditorProps["onVisibleRegionChanged"]
  > = React.useCallback((r) => {
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

  const getCellContent = React.useCallback<DataEditorProps["getCellContent"]>(
    (cell) => {
      const [col, row] = cell
      const rowData: TRowType | undefined = dataRef.current[row]
      if (rowData !== undefined) {
        return toCell(rowData, col)
      }
      return {
        kind: GridCellKind.Loading,
        allowOverlay: false,
      }
    },
    [toCell]
  )

  const loadPage = React.useCallback(
    async (page: number) => {
      loadingRef.current = loadingRef.current.add(page)
      const startIndex = page * pageSize
      const d = await getRowData([startIndex, (page + 1) * pageSize])

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
    [getRowData, gridRef, pageSize]
  )

  const getCellsForSelection = React.useCallback(
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

  useEffect(() => {
    // refresh data when table name changes
    loadingRef.current = CompactSelection.empty()
    dataRef.current = []
  }, [tableName])

  useEffect(() => {
    const r = visiblePages
    const firstPage = Math.max(0, Math.floor((r.y - pageSize / 2) / pageSize))
    const lastPage = Math.floor((r.y + r.height + pageSize / 2) / pageSize)
    for (const page of range(firstPage, lastPage + 1)) {
      if (loadingRef.current.hasIndex(page)) continue
      void loadPage(page)
    }
  }, [loadPage, pageSize, visiblePages])

  const onCellEdited = React.useCallback(
    (cell: Item, newVal: EditableGridCell) => {
      const [, row] = cell
      const current = dataRef.current[row]
      if (current === undefined) return

      const result = onEdited(cell, newVal, current)
      if (result !== undefined) {
        dataRef.current[row] = result
      }
    },
    [onEdited]
  )

  const handleAddRow = React.useCallback(async () => {
    setCount(dataRef.current.length + 1)
    try {
      const rowId = await addRow()
      dataRef.current.push({ _id: rowId } as any)
    } catch (error) {
      setCount(dataRef.current.length)
    }
  }, [addRow, setCount])

  const handleDelRows = async (startIndex: number, endIndex: number) => {
    const rowIds = dataRef.current
      .slice(startIndex, endIndex)
      .map((row: any) => row._id)
    // remove from data
    const count = endIndex - startIndex
    dataRef.current.splice(startIndex, count)
    setCount(dataRef.current.length)
    await delRows(rowIds)
  }

  const refreshCurrentVisible = React.useCallback(() => {
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
    return dataRef.current[index]
  }

  const getRowIndexById = (id: string) => {
    const rowIndex = dataRef.current.findIndex((row: any) => row._id === id)
    return rowIndex
  }

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)
    bc.onmessage = (ev) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.DataUpdateSignalType) {
        const { table, _new, _old } = payload
        if (tableName !== table) return
        switch (payload.type) {
          case DataUpdateSignalType.Update:
            const rowIndex = getRowIndexById(_old._id)
            if (rowIndex !== -1) {
              // FIXME: for now we just refresh the visible region, link cell has some problem
              dataRef.current[rowIndex] = _new
              refreshCurrentVisible()
            }
            break
          case DataUpdateSignalType.Delete:
            const rowIndex2 = getRowIndexById(_old._id)
            if (rowIndex2 !== -1) {
              dataRef.current.splice(rowIndex2, 1)
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            }
            break
          case DataUpdateSignalType.Insert:
            const rowIndex3 = getRowIndexById(_new._id)
            if (rowIndex3 === -1) {
              dataRef.current.push(_new)
              setCount(dataRef.current.length)
              refreshCurrentVisible()
            }
            break
          default:
            break
        }
      }
    }
    return () => {
      bc.close()
    }
  }, [refreshCurrentVisible, setCount, tableName])

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
