import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"

export interface SortableValue {
  id: string
}

function restrictToHorizontalTrack(
  {
    transform,
    draggingNodeRect,
    scrollableAncestorRects,
    containerNodeRect,
  }: Parameters<Modifier>[0],
  track: HTMLElement | null
) {
  const next = { ...transform, y: 0 }
  const boundary =
    track?.getBoundingClientRect() ??
    scrollableAncestorRects[0] ??
    containerNodeRect
  if (!draggingNodeRect || !boundary) return next
  const minimumX = boundary.left - draggingNodeRect.left
  const maximumX = boundary.right - draggingNodeRect.right
  return {
    ...next,
    x: Math.min(maximumX, Math.max(minimumX, next.x)),
  }
}

function sameOrder(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((candidate, index) => candidate === right[index])
  )
}

function sameMembers(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false
  const members = new Set(left)
  return right.every((candidate) => members.has(candidate))
}

export function SortableContainer<T extends SortableValue>({
  items,
  onReorder,
  renderItem,
  className,
  disabled = false,
  orientation = "vertical",
  optimistic = true,
  containerProps,
}: {
  items: T[]
  onReorder: (items: T[]) => Promise<void> | void
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  disabled?: boolean
  orientation?: "horizontal" | "vertical"
  optimistic?: boolean
  containerProps?: Omit<
    HTMLAttributes<HTMLDivElement>,
    "children" | "className"
  >
}) {
  const [localItems, setLocalItems] = useState(items)
  const containerRef = useRef<HTMLDivElement>(null)
  const latestItemsRef = useRef(items)
  const pendingOrderRef = useRef<string[] | null>(null)
  const reorderRequestRef = useRef(0)
  useEffect(() => {
    latestItemsRef.current = items
    const incomingOrder = items.map((item) => item.id)
    const pendingOrder = pendingOrderRef.current
    if (!optimistic || !pendingOrder) {
      setLocalItems(items)
      return
    }
    if (sameOrder(incomingOrder, pendingOrder)) {
      pendingOrderRef.current = null
      setLocalItems(items)
      return
    }
    if (!sameMembers(incomingOrder, pendingOrder)) {
      pendingOrderRef.current = null
      setLocalItems(items)
      return
    }
    const incomingById = new Map(items.map((item) => [item.id, item]))
    setLocalItems((current) =>
      current.map((item) => incomingById.get(item.id) ?? item)
    )
  }, [items, optimistic])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const horizontalModifiers = useMemo<Modifier[]>(
    () => [
      (arguments_) =>
        restrictToHorizontalTrack(
          arguments_,
          containerRef.current?.parentElement ?? null
        ),
    ],
    []
  )
  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!event.over || event.active.id === event.over.id || disabled) return
      const from = localItems.findIndex((item) => item.id === event.active.id)
      const to = localItems.findIndex((item) => item.id === event.over?.id)
      if (from < 0 || to < 0) return
      const next = arrayMove(localItems, from, to)
      const request = reorderRequestRef.current + 1
      reorderRequestRef.current = request
      if (optimistic) {
        pendingOrderRef.current = next.map((item) => item.id)
        setLocalItems(next)
      }
      try {
        await onReorder(next)
      } catch {
        if (optimistic && reorderRequestRef.current === request) {
          pendingOrderRef.current = null
          setLocalItems(latestItemsRef.current)
        }
      }
    },
    [disabled, localItems, onReorder, optimistic]
  )
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={orientation === "horizontal" ? horizontalModifiers : undefined}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={localItems.map((item) => item.id)}
        strategy={
          orientation === "horizontal"
            ? horizontalListSortingStrategy
            : verticalListSortingStrategy
        }
      >
        <div
          ref={containerRef}
          {...containerProps}
          className={className}
          data-eidos-file-sortable-orientation={orientation}
        >
          {localItems.map((item, index) => (
            <Fragment key={item.id}>{renderItem(item, index)}</Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
