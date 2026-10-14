import { useEffect, useRef, useState, type ReactNode } from "react"
import { GripVertical, RotateCcw } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useEidosFileUI } from "./context"
import { cn } from "./lib/cn"
import { mergeMenuOrder, orderMenuItems } from "./menu-order"
import { SortableContainer } from "./ui/sortable"

export interface EidosFileCellAction {
  id: string
  title: string
  icon: ReactNode
  group: "record" | "extension" | "destructive"
  disabled?: boolean
  run(): void
}
const EMPTY_ORDER: readonly string[] = []

function ActionRow({
  item,
  editing,
  separator,
  sortableDisabled,
}: {
  item: EidosFileCellAction
  editing: boolean
  separator: boolean
  sortableDisabled: boolean
}) {
  const { translate: t } = useEidosFileUI()
  const sortable = useSortable({ id: item.id, disabled: sortableDisabled })
  return (
    <div
      ref={sortable.setNodeRef}
      data-menu-action={item.id}
      style={{
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0 } : null
        ),
        transition: sortable.transition,
      }}
      className={cn(
        "relative",
        sortable.isDragging && "z-10 rounded bg-accent shadow-sm"
      )}
    >
      {separator && <div className="my-1 h-px bg-border" role="separator" />}
      <div className="flex items-center">
        <button
          ref={sortable.setActivatorNodeRef}
          type="button"
          data-menu-drag-handle=""
          aria-label={t("Drag to reorder {action}", { action: item.title })}
          className={cn(
            "flex h-7 shrink-0 cursor-grab touch-none items-center justify-center overflow-hidden rounded text-muted-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing",
            editing ? "w-5" : "invisible w-0"
          )}
          disabled={sortableDisabled}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={item.disabled}
          aria-disabled={item.disabled || editing}
          title={item.title}
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[3px] px-2 text-left text-xs text-popover-foreground outline-hidden hover:bg-accent focus-visible:bg-accent disabled:opacity-45",
            item.group === "destructive" && "text-destructive"
          )}
          onClick={(event) => {
            if (!editing && !event.altKey) item.run()
          }}
        >
          <span
            aria-hidden="true"
            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
          >
            {item.icon}
          </span>
          <span className="truncate">{item.title}</span>
        </button>
      </div>
    </div>
  )
}

export function EidosFileCellActions({
  items,
  open,
  onBlur,
  onDragStateChange,
}: {
  items: EidosFileCellAction[]
  open: boolean
  onBlur(): void
  onDragStateChange?(dragging: boolean): void
}) {
  const {
    menuOrders,
    onMenuOrderChange,
    interactionMode,
    translate: t,
  } = useEidosFileUI()
  const order = menuOrders?.["grid.cell"] ?? EMPTY_ORDER
  const [alt, setAlt] = useState(false)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const latestBlur = useRef(onBlur)
  latestBlur.current = onBlur
  const customizable = !!onMenuOrderChange && interactionMode !== "mobile"
  const editing = customizable && (alt || dragging)
  useEffect(() => {
    if (!open || !customizable) return
    const down = (event: KeyboardEvent) => {
      if (event.key === "Alt" || event.altKey) setAlt(true)
      // Capture before the sortable sensor cancels and clears its drag state.
      // Radix must not dismiss the menu for the same Escape event.
      if (event.key === "Escape" && draggingRef.current) event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === "Alt" || !event.altKey) setAlt(false)
    }
    const move = (event: MouseEvent) => setAlt(event.altKey)
    const blur = () => {
      setAlt(false)
      setDragging(false)
      draggingRef.current = false
      latestBlur.current()
    }
    window.addEventListener("keydown", down, true)
    window.addEventListener("keyup", up)
    window.addEventListener("mousemove", move)
    window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("keydown", down, true)
      window.removeEventListener("keyup", up)
      window.removeEventListener("mousemove", move)
      window.removeEventListener("blur", blur)
    }
  }, [open, customizable])
  useEffect(() => {
    if (!open) {
      setAlt(false)
      setDragging(false)
      draggingRef.current = false
      setError("")
    }
  }, [open])
  const save = async (next: readonly string[]) => {
    if (!onMenuOrderChange) return
    setBusy(true)
    setError("")
    try {
      await onMenuOrderChange("grid.cell", next)
    } catch (cause) {
      setError(
        t("Could not save menu order: {error}", {
          error: cause instanceof Error ? cause.message : String(cause),
        })
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }
  const ordered = orderMenuItems(items, order)
  return (
    <div data-menu-reordering={editing ? "true" : "false"} aria-busy={busy}>
      <SortableContainer
        items={ordered}
        disabled={!editing || busy}
        onDragStateChange={(value) => {
          draggingRef.current = value
          setDragging(value)
          onDragStateChange?.(value)
        }}
        onReorder={(next) =>
          save(
            mergeMenuOrder(
              order,
              next.map((item) => item.id)
            )
          )
        }
        renderItem={(item, index) => (
          <ActionRow
            item={item}
            editing={editing}
            sortableDisabled={!editing || busy}
            separator={index > 0 && ordered[index - 1]?.group !== item.group}
          />
        )}
      />
      {editing && (
        <>
          <div className="my-1 h-px bg-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={busy || order.length === 0}
            className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs text-muted-foreground outline-hidden hover:bg-accent focus-visible:bg-accent disabled:opacity-45"
            onClick={() => {
              void save([]).catch(() => {})
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("Restore default order")}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
