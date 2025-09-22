import { useCallback, useEffect, useState } from "react"
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

export interface SortableItem {
  id: string
  [key: string]: any
}

export interface SortableContainerProps<T extends SortableItem> {
  items: T[]
  onReorder: (newItems: T[]) => void
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  itemClassName?: string
  disabled?: boolean
  activationDistance?: number
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function SortableContainer<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  className = "",
  itemClassName = "",
  disabled = false,
  activationDistance = 8,
  onDragStart,
  onDragEnd,
}: SortableContainerProps<T>) {
  const [localItems, setLocalItems] = useState(items)

  // Update local state when external items change
  useEffect(() => {
    setLocalItems(items)
  }, [items])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: activationDistance,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = useCallback(() => {
    onDragStart?.()
  }, [onDragStart])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id || disabled) return

      const oldIndex = localItems.findIndex((item) => item.id === active.id)
      const newIndex = localItems.findIndex((item) => item.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        setLocalItems((prevItems) => {
          const newItems = arrayMove(prevItems, oldIndex, newIndex)
          onReorder(newItems)
          return newItems
        })
      }
      
      onDragEnd?.()
    },
    [localItems, onReorder, disabled, onDragEnd]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={localItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className}>
          {localItems.map((item, index) => (
            <div key={item.id} className={itemClassName}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
