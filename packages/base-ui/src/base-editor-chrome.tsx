import {
  forwardRef,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import type { BaseTableInfo, BaseViewInfo } from "@eidos.space/base"
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Puzzle,
  SquareKanban,
  Table2,
} from "lucide-react"

import { cn } from "./lib/cn"
import { Button } from "./ui/primitives"
import { useBaseTabStrip } from "./use-base-tab-strip"

export const BaseEditorRoot = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex h-full min-h-0 flex-col bg-background",
      className
    )}
    {...props}
  />
))
BaseEditorRoot.displayName = "BaseEditorRoot"

export const BaseEditorWorkbar = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-base-workbar
    className={cn(
      "base-workbar eidos-shell-workbar flex shrink-0 items-end border-b bg-muted/15 px-2",
      className
    )}
    {...props}
  />
))
BaseEditorWorkbar.displayName = "BaseEditorWorkbar"

export const BaseEditorContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative min-h-0 flex-1", className)}
    {...props}
  />
))
BaseEditorContent.displayName = "BaseEditorContent"

export function BaseViewTypeIcon({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  if (type === "gallery") return <LayoutGrid className={className} />
  if (type === "kanban") return <SquareKanban className={className} />
  if (!type || type === "grid") return <Table2 className={className} />
  return <Puzzle className={className} />
}

export function BaseViewTabStrip({
  views,
  activeViewId,
  disabled,
  afterTabs,
  onSelect,
}: {
  views: BaseViewInfo[]
  activeViewId?: string | null
  disabled?: boolean
  afterTabs?: ReactNode
  onSelect: (viewId: string) => void
}) {
  const {
    activeTabRef,
    canScrollBackward,
    canScrollForward,
    navigateTabs,
    scrollTabs,
    tabStopId,
    updateScrollState,
    viewportRef,
  } = useBaseTabStrip({ items: views, activeId: activeViewId, onSelect })

  return (
    <div className="flex min-w-0 flex-1 items-end">
      {canScrollBackward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mb-1 h-7 w-6 shrink-0 text-muted-foreground"
          aria-label="Scroll Base views backward"
          disabled={disabled}
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div
        ref={viewportRef}
        role="tablist"
        aria-label="Base views"
        aria-orientation="horizontal"
        className="flex min-w-0 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        {views.map((view, index) => (
          <button
            ref={view.id === activeViewId ? activeTabRef : undefined}
            key={view.id}
            type="button"
            role="tab"
            data-base-view-id={view.id}
            aria-selected={view.id === activeViewId}
            tabIndex={view.id === tabStopId ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(view.id)}
            onKeyDown={(event) => navigateTabs(event, index)}
            className={cn(
              "relative flex h-9 max-w-48 shrink-0 items-center gap-1.5 px-3 text-[13px] text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
              view.id === activeViewId && "text-foreground"
            )}
          >
            <BaseViewTypeIcon
              type={view.type}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span className="truncate">{view.name}</span>
            {view.id === activeViewId ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 bg-foreground/75" />
            ) : null}
          </button>
        ))}
      </div>
      {canScrollForward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mb-1 h-7 w-6 shrink-0 text-muted-foreground"
          aria-label="Scroll Base views forward"
          disabled={disabled}
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {afterTabs}
    </div>
  )
}

export function BaseSheetTabStrip({
  tables,
  activeTableId,
  disabled,
  status,
  createAction,
  onSelect,
  renderTab,
}: {
  tables: BaseTableInfo[]
  activeTableId: string | null
  disabled?: boolean
  status?: ReactNode
  createAction?: ReactNode
  onSelect: (tableId: string) => void
  renderTab?: (table: BaseTableInfo, tab: ReactNode) => ReactNode
}) {
  const createActionRef = useRef<HTMLDivElement>(null)
  const lastTableId = tables.at(-1)?.id
  const {
    activeTabRef,
    canScrollBackward,
    canScrollForward,
    navigateTabs,
    scrollTabs,
    tabStopId,
    updateScrollState,
    viewportRef,
  } = useBaseTabStrip({ items: tables, activeId: activeTableId, onSelect })

  useEffect(() => {
    if (activeTableId !== lastTableId) return
    createActionRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    })
  }, [activeTableId, lastTableId, tables.length])

  return (
    <footer
      data-base-sheet-tabs
      className="eidos-shell-statusbar flex shrink-0 items-stretch border-t bg-muted/20"
    >
      {canScrollBackward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-6 shrink-0 rounded-none border-r text-muted-foreground"
          aria-label="Scroll Base tables backward"
          disabled={disabled}
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div
        ref={viewportRef}
        data-base-sheet-tabs-viewport
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        <div
          role="tablist"
          aria-label="Base tables"
          aria-orientation="horizontal"
          aria-keyshortcuts="Control+PageUp Control+PageDown"
          className="flex shrink-0 items-stretch"
        >
          {tables.map((table, index) => {
            const tab = (
              <button
                ref={table.id === activeTableId ? activeTabRef : undefined}
                key={table.id}
                type="button"
                role="tab"
                data-base-table-id={table.id}
                aria-selected={table.id === activeTableId}
                tabIndex={table.id === tabStopId ? 0 : -1}
                disabled={disabled}
                onClick={() => onSelect(table.id)}
                onKeyDown={(event) => navigateTabs(event, index)}
                className={cn(
                  "relative flex h-full max-w-48 shrink-0 items-center gap-1.5 border-r px-3 text-xs text-muted-foreground outline-hidden hover:bg-background/70 hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
                  table.id === activeTableId &&
                    "bg-background font-medium text-foreground"
                )}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{table.name}</span>
                {table.id === activeTableId ? (
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-foreground/65" />
                ) : null}
              </button>
            )
            return renderTab ? (
              <div key={table.id} className="contents">
                {renderTab(table, tab)}
              </div>
            ) : (
              tab
            )
          })}
        </div>
        {createAction ? (
          <div
            ref={createActionRef}
            data-base-sheet-create-action
            className="flex shrink-0 items-stretch"
          >
            {createAction}
          </div>
        ) : null}
      </div>
      {canScrollForward ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-6 shrink-0 rounded-none border-l text-muted-foreground"
          aria-label="Scroll Base tables forward"
          disabled={disabled}
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {status ? (
        <div className="flex shrink-0 items-center border-l px-2.5 text-[11px] text-muted-foreground">
          {status}
        </div>
      ) : null}
    </footer>
  )
}
