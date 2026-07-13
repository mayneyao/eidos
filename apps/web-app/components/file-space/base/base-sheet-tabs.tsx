import type { ReactNode } from "react"
import type { BaseTableInfo } from "@eidos.space/base"
import { Plus, Table2 } from "lucide-react"

import { cn } from "@/lib/utils"

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
  return (
    <footer
      data-base-sheet-tabs
      className="flex h-8 shrink-0 items-stretch border-t bg-muted/20"
    >
      <div
        role="tablist"
        aria-label="Base tables"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
        {tables.map((table) => (
          <button
            key={table.id}
            type="button"
            role="tab"
            aria-selected={table.id === activeTableId}
            disabled={disabled}
            onClick={() => onSelect(table.id)}
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
        <button
          type="button"
          className="flex h-full w-8 shrink-0 items-center justify-center text-muted-foreground outline-hidden hover:bg-background/70 hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
          aria-label="Add Base table"
          title="New table"
          disabled={disabled}
          onClick={onCreate}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {status ? (
        <div className="flex shrink-0 items-center border-l px-2.5 text-[11px] text-muted-foreground">
          {status}
        </div>
      ) : null}
    </footer>
  )
}
