"use client"

import React, { useState, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

export type { DragEndEvent } from "@dnd-kit/core"

export type Status = {
  id: string
  name: string
  color: string
}

export type KanbanBoardProps = {
  id: Status["id"]
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export const KanbanBoard = ({
  id,
  children,
  className,
  style,
}: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      className={cn(
        "flex h-full min-h-40 flex-col gap-2 rounded-md border bg-secondary p-2 text-xs shadow-xs outline outline-2 transition-all",
        isOver ? "outline-primary" : "outline-transparent",
        className
      )}
      style={style}
      ref={setNodeRef}
    >
      {children}
    </div>
  )
}

export type KanbanCardProps = {
  id: string
  name: string
  index: number
  parent: string
  children?: ReactNode
  className?: string
}

export const KanbanCard = ({
  id,
  name,
  index,
  parent,
  children,
  className,
}: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { index, parent },
  })
  const { lastMovedId } = React.useContext(KanbanContext)
  const isRecentlyMoved = lastMovedId === id

  return (
    <Card
      className={cn(
        "rounded-md p-3 shadow-xs transition-colors duration-300",
        isDragging && "opacity-50",
        isRecentlyMoved && "bg-primary/10",
        className
      )}
      data-draggable-id={id}
      {...listeners}
      {...attributes}
      ref={setNodeRef}
    >
      {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
    </Card>
  )
}

export type KanbanCardsProps = {
  children: ReactNode
  className?: string
  ref?: React.RefObject<HTMLDivElement>
}

// support ref
export const KanbanCards = React.forwardRef<HTMLDivElement, KanbanCardsProps>(
  ({ children, className }, ref) => (
    <div className={cn("flex flex-1 flex-col gap-[16px]", className)} ref={ref}>
      {children}
    </div>
  )
)

export type KanbanHeaderProps =
  | {
      children: ReactNode
    }
  | {
      name: Status["name"]
      color: Status["color"]
      className?: string
    }

export const KanbanHeader = (props: KanbanHeaderProps) =>
  "children" in props ? (
    props.children
  ) : (
    <div className={cn("flex shrink-0 items-center gap-2", props.className)}>
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: props.color }}
      />
      <p className="m-0 font-semibold text-sm">{props.name}</p>
    </div>
  )

export type KanbanProviderProps = {
  children: ReactNode
  onDragEnd: (event: DragEndEvent) => void
  className?: string
}

export const KanbanProvider = ({
  children,
  onDragEnd,
  className,
}: KanbanProviderProps) => {
  const [activeNode, setActiveNode] = useState<React.ReactNode | null>(null)
  const [lastMovedId, setLastMovedId] = useState<string | null>(null)

  // Clear the highlight effect after a delay
  React.useEffect(() => {
    if (lastMovedId) {
      const timer = setTimeout(() => {
        setLastMovedId(null)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [lastMovedId])

  return (
    <DndContext
      collisionDetection={rectIntersection}
      onDragEnd={(event) => {
        setActiveNode(null)
        setLastMovedId(event.active.id.toString())
        onDragEnd(event)
      }}
      onDragStart={(event) => {
        const draggedElement = document.querySelector(
          `[data-draggable-id="${event.active.id}"]`
        )
        if (draggedElement) {
          setActiveNode(draggedElement.innerHTML)
        }
      }}
    >
      <KanbanContext.Provider value={{ lastMovedId }}>
        <div
          className={cn(
            "grid w-full auto-cols-fr grid-flow-col gap-4",
            className
          )}
        >
          {children}
        </div>
      </KanbanContext.Provider>
      <DragOverlay dropAnimation={null}>
        {activeNode ? (
          <Card className="rounded-md p-3 shadow-xs cursor-grabbing">
            <div dangerouslySetInnerHTML={{ __html: activeNode as string }} />
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// Add context for tracking last moved card
const KanbanContext = React.createContext<{ lastMovedId: string | null }>({
  lastMovedId: null,
})
