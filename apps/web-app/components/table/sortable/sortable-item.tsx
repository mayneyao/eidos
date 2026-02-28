import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { ReactNode } from "react"

export interface SortableItemProps {
  id: string
  children: ReactNode
  className?: string
  dragHandleClassName?: string
  disabled?: boolean
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function SortableItem({
  id,
  children,
  className = "",
  dragHandleClassName = "",
  disabled = false,
  isDragging: externalIsDragging = false,
  onDragStart,
  onDragEnd,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  }

  const handleDragStart = () => {
    onDragStart?.()
  }

  const handleDragEnd = () => {
    onDragEnd?.()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div {...attributes} {...listeners} className={dragHandleClassName}>
        {children}
      </div>
    </div>
  )
}
