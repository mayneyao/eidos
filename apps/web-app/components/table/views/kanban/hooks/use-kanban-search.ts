import { useEffect, useState } from "react"

import { useTableSearchStore } from "../../../table-store-provider"
import type { KanbanItem } from "../hooks"

export interface UseKanbanSearchOptions {
  items: KanbanItem[]
}

export interface UseKanbanSearchReturn {
  highlightedItemId: string | null
}

/**
 * Hook to integrate kanban view with table search functionality.
 * Returns the currently highlighted item id based on search results.
 */
export const useKanbanSearch = ({
  items,
}: UseKanbanSearchOptions): UseKanbanSearchReturn => {
  const { searchResults, currentSearchIndex, setCurrentSearchIndex } =
    useTableSearchStore()
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null
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
      }
    }

    window.addEventListener("navigateSearch", onNavigateSearch as EventListener)
    return () => {
      window.removeEventListener(
        "navigateSearch",
        onNavigateSearch as EventListener
      )
    }
  }, [searchResults, currentSearchIndex, setCurrentSearchIndex])

  // Clear highlight when search changes
  useEffect(() => {
    if (!searchResults?.length) {
      setHighlightedItemId(null)
    }
  }, [searchResults])

  return {
    highlightedItemId,
  }
}
