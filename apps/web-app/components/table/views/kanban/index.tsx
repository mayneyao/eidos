"use client"

import { useMemo } from "react"

import type { IView } from "@/packages/core/types/IView"
import { useUiColumns } from "@/apps/web-app/hooks/use-ui-columns"
import {
  KanbanProvider,
  type DragEndEvent,
} from "@/components/ui/kibo-ui/kanban"

import { useShowColumns } from "../../hooks"
import type { KanbanItem } from "./hooks"
import { useKanbanViewData } from "./hooks"
import { KanbanBoard } from "./kanban-board"

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      return
    }

    const newStatus = over.id as string
    updateItemStatus(active.id as string, newStatus)
  }

  if (loading) {
    return <div>Loading...</div>
  }
  const isBoardTooLong = statusCounts.length > 50
  const statusCountsToShow = isBoardTooLong
    ? statusCounts.slice(0, 50)
    : statusCounts
  if (!view.properties?.groupByField) {
    return (
      <div className="p-4 h-full flex w-full overflow-x-auto">
        <div>
          No group by field, please configure the view to group by a field.
        </div>
      </div>
    )
  }
  return (
    <KanbanProvider
      onDragEnd={handleDragEnd}
      className="p-4 h-full flex w-full overflow-x-auto"
    >
      {statusCountsToShow.map((status) => (
        <KanbanBoard
          key={status.status}
          status={status}
          items={itemsGroupByStatus[status.status]}
          showFields={showFields}
          uiColumnMap={uiColumnMap}
          rawIdNameMap={rawIdNameMap}
          tableId={view.table_id}
          properties={view.properties}
          space={space}
        />
      ))}
      {isBoardTooLong && (
        <div className="flex items-center justify-center">
          <p className="text-muted-foreground text-xs">
            {statusCounts.length - 50} more
          </p>
        </div>
      )}
    </KanbanProvider>
  )
}

export default KanbanView
