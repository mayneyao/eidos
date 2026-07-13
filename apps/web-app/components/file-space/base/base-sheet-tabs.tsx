import type { ReactNode } from "react"
import type { BaseTableInfo } from "@eidos.space/base"
import { ChevronLeft, ChevronRight, Plus, Table2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import { useBaseTabStrip } from "./use-base-tab-strip"

export function BaseSheetTabs({
  tables,
  activeTableId,
  disabled,
  status,
  onSelect,
  onCreate,
}: {
  tables: BaseTableInfo[]
  activeTableId: string | null
  disabled?: boolean
  status?: ReactNode
  onSelect: (tableId: string) => void
  onCreate: () => void
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
  } = useBaseTabStrip({ items: tables, activeId: activeTableId, onSelect })

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
        role="tablist"
        aria-label="Base tables"
        aria-orientation="horizontal"
        aria-keyshortcuts="Control+PageUp Control+PageDown"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        {tables.map((table, index) => (
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
        ))}
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
      <button
        type="button"
        className="flex h-full w-8 shrink-0 items-center justify-center border-l text-muted-foreground outline-hidden hover:bg-background/70 hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
        aria-label="Add Base table"
        title="New table"
        disabled={disabled}
        onClick={onCreate}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {status ? (
        <div className="flex shrink-0 items-center border-l px-2.5 text-[11px] text-muted-foreground">
          {status}
        </div>
      ) : null}
    </footer>
  )
}
