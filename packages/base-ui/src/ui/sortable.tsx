import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

export interface SortableValue {
  id: string
}

export function SortableContainer<T extends SortableValue>({
  items,
  onReorder,
  renderItem,
  className,
  disabled = false,
}: {
  items: T[]
  onReorder: (items: T[]) => void
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  disabled?: boolean
}) {
  const [localItems, setLocalItems] = useState(items)
  useEffect(() => setLocalItems(items), [items])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!event.over || event.active.id === event.over.id || disabled) return
      const from = localItems.findIndex((item) => item.id === event.active.id)
      const to = localItems.findIndex((item) => item.id === event.over?.id)
      if (from < 0 || to < 0) return
      const next = arrayMove(localItems, from, to)
      setLocalItems(next)
      onReorder(next)
    },
    [disabled, localItems, onReorder]
  )
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={localItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>
          {localItems.map((item, index) => (
            <div key={item.id}>{renderItem(item, index)}</div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
