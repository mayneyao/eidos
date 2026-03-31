import React, { useEffect, useState, useCallback } from "react"

import { useTableSearchStore } from "../../../table-store-provider"
import type { KanbanItem } from "../hooks"

export interface UseKanbanSearchOptions {
  items: KanbanItem[]
}

export interface UseKanbanSearchReturn {
  highlightedItemId: string | null
  highlightedStatus: string | null
  onBoardRef: (status: string, element: HTMLElement | null) => void
}

/**
 * Hook to integrate kanban view with table search functionality.
 * Returns the currently highlighted item id and its status based on search results.
 */
export const useKanbanSearch = ({
  items,
}: UseKanbanSearchOptions): UseKanbanSearchReturn => {
  const { searchResults, currentSearchIndex, setCurrentSearchIndex } =
    useTableSearchStore()
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null
  )
  const [highlightedStatus, setHighlightedStatus] = useState<string | null>(
    null
  )
  const boardRefs = React.useRef<Map<string, HTMLElement>>(new Map())

  // Register board element ref
  const onBoardRef = useCallback(
    (status: string, element: HTMLElement | null) => {
      if (element) {
        boardRefs.current.set(status, element)
      } else {
        boardRefs.current.delete(status)
      }
    },
    []
  )

  // Scroll to board horizontally when highlighted item changes
  const scrollToBoard = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId)
      if (!item) return

      const status = item.status
      setHighlightedStatus(status)

      // Find the board element for this status
      const boardElement = boardRefs.current.get(status)
      if (!boardElement) return

      // Find the scrollable container (parent with overflow-x-auto)
      const container = boardElement.parentElement
      if (!container) return

      // Check if board is visible in viewport
      const containerRect = container.getBoundingClientRect()
      const boardRect = boardElement.getBoundingClientRect()

      const isVisible =
        boardRect.left >= containerRect.left &&
        boardRect.right <= containerRect.right

      if (!isVisible) {
        // Scroll horizontally to make board visible
        const scrollLeft =
          boardElement.offsetLeft -
          containerRect.width / 2 +
          boardRect.width / 2
        container.scrollTo({
          left: Math.max(0, scrollLeft),
          behavior: "smooth",
        })
      }
    },
    [items]
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
        setHighlightedItemId(rowId)
        // Trigger horizontal scroll
        setTimeout(() => scrollToBoard(rowId), 0)
      }
    }

    window.addEventListener("navigateSearch", onNavigateSearch as EventListener)
    return () => {
      window.removeEventListener(
        "navigateSearch",
        onNavigateSearch as EventListener
      )
    }
  }, [searchResults, currentSearchIndex, setCurrentSearchIndex, scrollToBoard])

  // Clear highlight when search changes
  useEffect(() => {
    if (!searchResults?.length) {
      setHighlightedItemId(null)
      setHighlightedStatus(null)
    }
  }, [searchResults])

  return {
    highlightedItemId,
    highlightedStatus,
    onBoardRef,
  }
}
