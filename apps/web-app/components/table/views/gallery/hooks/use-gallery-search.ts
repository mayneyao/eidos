import { useEffect, useState, useCallback, useRef } from "react"
import type { VariableSizeGrid as Grid } from "react-window"

import { useTableSearchStore } from "../../../table-store-provider"

export interface UseGallerySearchOptions {
  data: string[]
  columnCount: number
}

export interface UseGallerySearchReturn<T> {
  highlightedRowId: string | null
  gridRef: React.RefObject<Grid<T>>
}

/**
 * Hook to integrate gallery view with table search functionality.
 * Handles search navigation and highlights matching cards.
 */
export const useGallerySearch = <T>({
  data,
  columnCount,
}: UseGallerySearchOptions): UseGallerySearchReturn<T> => {
  const { searchResults, currentSearchIndex, setCurrentSearchIndex } =
    useTableSearchStore()
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null)
  const gridRef = useRef<Grid<T>>(null)

  const scrollToRowId = useCallback(
    (rowId: string) => {
      if (!gridRef.current) return

      const dataIndex = data.indexOf(rowId)
      if (dataIndex === -1) return

      const rowIndexInGrid = Math.floor(dataIndex / columnCount)
      const columnIndexInGrid = dataIndex % columnCount

      gridRef.current.scrollToItem({
        rowIndex: rowIndexInGrid,
        columnIndex: columnIndexInGrid,
        align: "center",
      })
    },
    [data, columnCount]
  )

  // Handle search navigation
  useEffect(() => {
    const onNavigateSearch = (e: CustomEvent) => {
      const { direction } = e.detail

      if (!searchResults?.length) return

      let newIndex = currentSearchIndex

      if (direction === "next") {
        newIndex =
          currentSearchIndex < searchResults.length - 1
            ? currentSearchIndex + 1
            : 0
      } else if (direction === "prev") {
        newIndex =
          currentSearchIndex > 0
            ? currentSearchIndex - 1
            : searchResults.length - 1
      }

      setCurrentSearchIndex(newIndex)

      // Get the rowId of the current search result
      const result = searchResults[newIndex]
      if (result?.row?._id) {
        const rowId = result.row._id
        setHighlightedRowId(rowId)
        scrollToRowId(rowId)
      }
    }

    window.addEventListener("navigateSearch", onNavigateSearch as EventListener)
    return () => {
      window.removeEventListener(
        "navigateSearch",
        onNavigateSearch as EventListener
      )
    }
  }, [searchResults, currentSearchIndex, setCurrentSearchIndex, scrollToRowId])

  // Clear highlight when search changes
  useEffect(() => {
    if (!searchResults?.length) {
      setHighlightedRowId(null)
    }
  }, [searchResults])

  return {
    highlightedRowId,
    gridRef,
  }
}
