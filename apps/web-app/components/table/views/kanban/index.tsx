"use client"

import { useMemo, useState, useCallback } from "react"

import type { IView } from "@/packages/core/types/IView"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import {
  KanbanProvider,
  type DragEndEvent,
} from "@/components/ui/kibo-ui/kanban"
import { ChevronRight } from "lucide-react"

import { useShowColumns } from "../../hooks"
import type { KanbanItem } from "./hooks"
import { useKanbanViewData } from "./hooks"
import { KanbanBoard } from "./kanban-board"
import { useKanbanSearch } from "./hooks/use-kanban-search"

// Initial number of visible groups
const INITIAL_VISIBLE_BOARDS = 10
// Number to load more each time
const LOAD_MORE_STEP = 10

export const KanbanView = ({
  space,
  tableName,
  view,
}: {
  space: string
  tableName: string
  view: IView
}) => {
  const { items, loading, updateItemStatus, statusCounts } =
    useKanbanViewData(view)
  const { uiColumns, uiColumnMap, rawIdNameMap } = useUiColumns(
    tableName,
    space
  )
  const showFields = useShowColumns(uiColumns, view)

  // Control the number of visible groups
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_BOARDS)

  // items groupBy status
  const itemsGroupByStatus = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.status] = [...(acc[item.status] || []), item]
        return acc
      },
      {} as Record<string, KanbanItem[]>
    )
  }, [items])

  // Search integration
  const { highlightedItemId, onBoardRef } = useKanbanSearch({ items })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      return
    }

    const newStatus = over.id as string
    updateItemStatus(active.id as string, newStatus)
  }

  // Load more
  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) =>
      Math.min(prev + LOAD_MORE_STEP, statusCounts.length)
    )
  }, [statusCounts.length])

  // Currently visible groups
  const statusCountsToShow = useMemo(() => {
    return statusCounts.slice(0, visibleCount)
  }, [statusCounts, visibleCount])

  // Whether there are more
  const hasMore = visibleCount < statusCounts.length
  const remainingCount = statusCounts.length - visibleCount

  if (loading) {
    return (
      <div className="p-4 h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!view.properties?.groupByField) {
    return (
      <div className="p-4 h-full flex w-full overflow-x-auto">
        <div className="text-muted-foreground">
          No group by field, please configure the view to group by a field.
        </div>
      </div>
    )
  }

  return (
    <KanbanProvider
      onDragEnd={handleDragEnd}
      className="p-4 h-full flex w-full overflow-x-auto scroll-smooth"
    >
      {statusCountsToShow.map((status) => (
        <div key={status.status} ref={(el) => onBoardRef(status.status, el)}>
          <KanbanBoard
            status={status}
            items={itemsGroupByStatus[status.status]}
            showFields={showFields}
            uiColumnMap={uiColumnMap}
            rawIdNameMap={rawIdNameMap}
            tableId={view.table_id}
            properties={view.properties}
            space={space}
            highlightedItemId={highlightedItemId}
          />
        </div>
      ))}

      {hasMore && (
        <div className="flex flex-col shrink-0 py-2">
          <button
            onClick={handleLoadMore}
            className="group flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800/50 transition-all duration-200"
          >
            <span className="font-medium">{remainingCount} more</span>
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      )}
    </KanbanProvider>
  )
}

export default KanbanView
