import { useEffect, useRef, useMemo } from "react"
import { useVirtualList, useClickAway } from "ahooks"
import { cn } from "@/lib/utils"
import { usePopoverPosition } from "./hooks"

export interface ContextItem {
  id: string
  name: string
  description?: string
  icon?: React.ReactNode
  data: any
}

interface ContextPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ContextItem[]
  onSelect: (item: ContextItem) => void
  filterQuery: string
  anchorRef: React.RefObject<HTMLElement | null>
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  title?: string
  emptyText?: string
}

export function ContextPopover({
  open,
  onOpenChange,
  items,
  onSelect,
  filterQuery,
  anchorRef,
  activeIndex,
  onActiveIndexChange,
  title = "Options",
  emptyText = "No items found.",
}: ContextPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const lastScrollIndex = useRef<number>(-1)

  const { position } = usePopoverPosition(anchorRef, open)

  // Close on click outside
  useClickAway(() => {
    if (open) onOpenChange(false)
  }, [menuRef, anchorRef])

  const filtered = useMemo(() => {
    const q = (filterQuery || "").toLowerCase()
    return items.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
    )
  }, [items, filterQuery])

  const [virtualList, scrollTo] = useVirtualList(filtered, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 36,
    overscan: 10,
  })

  // Synchronize scroll with activeIndex
  useEffect(() => {
    if (open && activeIndex >= 0 && activeIndex !== lastScrollIndex.current) {
      scrollTo(activeIndex)
      lastScrollIndex.current = activeIndex
    }
  }, [activeIndex, open, scrollTo])

  if (!open || position.width === 0) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-md border bg-popover shadow-md overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        transform: "translateY(-100%)",
      }}
    >
      <div
        ref={containerRef as any}
        className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1 scrollbar-hide"
      >
        {filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {title}
          </div>
        )}

        <div ref={wrapperRef as any}>
          {virtualList.map((item) => (
            <div
              key={item.data.id}
              onClick={() => onSelect(item.data)}
              onMouseMove={() => {
                if (activeIndex !== item.index) {
                  lastScrollIndex.current = item.index
                  onActiveIndexChange(item.index)
                }
              }}
              className={cn(
                "flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                item.index === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              style={{
                height: "36px",
              }}
            >
              {item.data.icon && (
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {item.data.icon}
                </div>
              )}
              <span className="font-medium truncate max-w-[40%]">
                {item.data.name}
              </span>
              {item.data.description && (
                <span className="text-muted-foreground text-xs truncate flex-1">
                  {item.data.description}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
