"use client"

import React, { useState, type ReactNode } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

import { cn } from "@/lib/utils"

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
  role?: React.AriaRole
  "aria-label"?: string
}

export const KanbanBoard = ({
  id,
  children,
  className,
  style,
  role,
  "aria-label": ariaLabel,
}: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      className={cn(
        "flex h-full min-h-40 flex-col gap-3 rounded-xl p-2 text-xs transition-[box-shadow,background-color] motion-reduce:transition-none",
        isOver && "ring-1 ring-primary/30",
        className
      )}
      style={style}
      role={role}
      aria-label={ariaLabel}
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
  disabled?: boolean
}

const INTERACTIVE_DRAG_TARGET =
  'button, a, input, select, textarea, [role="button"], [role="menuitem"], [contenteditable="true"]'

function isNestedInteractiveTarget(
  target: EventTarget | null,
  currentTarget: HTMLElement
): boolean {
  if (!(target instanceof Element)) return false
  const interactive = target.closest(INTERACTIVE_DRAG_TARGET)
  return interactive !== null && interactive !== currentTarget
}

export const KanbanCard = ({
  id,
  name,
  index,
  parent,
  children,
  className,
  disabled = false,
}: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { index, name, parent },
    disabled,
  })
  const { lastMovedId } = React.useContext(KanbanContext)
  const isRecentlyMoved = lastMovedId === id

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xs",
        "transition-[box-shadow,opacity] duration-150 ease-out hover:shadow-sm motion-reduce:transition-none",
        disabled
          ? "cursor-default opacity-60"
          : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-45",
        isRecentlyMoved && "ring-1 ring-ring/30",
        className
      )}
      data-draggable-id={id}
      onPointerDownCapture={(event) => {
        if (isNestedInteractiveTarget(event.target, event.currentTarget)) {
          event.stopPropagation()
        }
      }}
      onKeyDownCapture={(event) => {
        if (isNestedInteractiveTarget(event.target, event.currentTarget)) {
          event.stopPropagation()
        }
      }}
      {...listeners}
      {...attributes}
      ref={setNodeRef}
    >
      {children ?? <p className="m-0 font-medium text-sm p-3">{name}</p>}
    </div>
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
  onDragStart?: (event: DragStartEvent) => void
  onDragCancel?: (event: DragCancelEvent) => void
  className?: string
}

export const KanbanProvider = ({
  children,
  onDragEnd,
  onDragStart,
  onDragCancel,
  className,
}: KanbanProviderProps) => {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [lastMovedId, setLastMovedId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

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
      sensors={sensors}
      onDragEnd={(event) => {
        setActiveLabel(null)
        const sourceParent = event.active.data.current?.parent
        const targetParent = event.over?.id.toString()
        setLastMovedId(
          targetParent !== undefined && targetParent !== sourceParent
            ? event.active.id.toString()
            : null
        )
        onDragEnd(event)
      }}
      onDragCancel={(event) => {
        setActiveLabel(null)
        onDragCancel?.(event)
      }}
      onDragStart={(event) => {
        const label = event.active.data.current?.name
        setActiveLabel(
          typeof label === "string" ? label : event.active.id.toString()
        )
        onDragStart?.(event)
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
        {activeLabel ? (
          <div
            className="max-w-80 cursor-grabbing overflow-hidden rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground shadow-lg"
            aria-hidden="true"
          >
            <span className="block truncate">{activeLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// Add context for tracking last moved card
const KanbanContext = React.createContext<{ lastMovedId: string | null }>({
  lastMovedId: null,
})
