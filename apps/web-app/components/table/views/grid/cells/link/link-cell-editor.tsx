import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Link2, Plus, Search, Unlink, X } from "lucide-react"

import type { LinkCellData } from "@/packages/core/fields/link"
import { cn } from "@/lib/utils"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

interface IGridProps {
  tableName: string
  databaseName: string
  value: LinkCellData[]
  onChange: (data: LinkCellData[]) => void
  onFinishedEditing?: () => void
  onCancelEditing?: () => void
}

export function LinkCellEditor(props: IGridProps) {
  const { tableName, onFinishedEditing, onCancelEditing } = props
  const [search, setSearch] = useState("")
  const [data, setData] = useState<any[]>([])
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!sqlite) return
    if (search.length) {
      sqlite
        .sql4mainThread(
          `SELECT * FROM ${tableName} WHERE title LIKE '%' || ? || '%' LIMIT 200`,
          [search],
          "object"
        )
        .then((res) => {
          setData(res)
          setFocusedIndex(-1)
        })
    } else {
      sqlite
        .sql4mainThread(`SELECT * FROM ${tableName} LIMIT 50`, [], "object")
        .then((res) => {
          setData(res)
          setFocusedIndex(-1)
        })
    }
  }, [tableName, search, sqlite])

  // Combine selected and unselected items for keyboard navigation
  const allItems = useMemo(() => {
    const selected = props.value.map((v) => ({
      ...v,
      _id: v.id,
      isSelected: true,
    }))
    const unselected = data
      .filter((item) => !props.value.find((v) => v.id === item._id))
      .map((item) => ({ ...item, isSelected: false }))
    return [...selected, ...unselected]
  }, [props.value, data])

  const selectedItems = props.value
  const unSelectedItems = useMemo(() => {
    return data.filter((item) => !props.value.find((v) => v.id === item._id))
  }, [props.value, data])

  const selectItem = (item: { _id: string; title: string }) => {
    if (props.value.find((v) => v.id === item._id)) {
      props.onChange(props.value.filter((v) => v.id !== item._id))
    } else {
      props.onChange([
        ...props.value,
        {
          id: item._id,
          title: item.title,
        },
      ])
    }
  }

  const handleClearAll = () => {
    props.onChange([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape to cancel editing (revert to initial value)
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      onCancelEditing?.()
      return
    }

    // Enter to finish editing
    if (e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      onFinishedEditing?.()
      return
    }

    // Arrow down
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusedIndex((prev) => {
        const next = prev + 1
        if (next >= allItems.length) return 0
        return next
      })
      return
    }

    // Arrow up
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusedIndex((prev) => {
        const next = prev - 1
        if (next < 0) return allItems.length - 1
        return next
      })
      return
    }

    // Space to toggle selection
    if (e.key === " " && focusedIndex >= 0 && allItems[focusedIndex]) {
      e.preventDefault()
      e.stopPropagation()
      const item = allItems[focusedIndex]
      selectItem({ _id: item._id, title: item.title })
      return
    }
  }

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const element = listRef.current.querySelector(
        `[data-index="${focusedIndex}"]`
      )
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" })
      }
    }
  }, [focusedIndex])

  const hasResults = selectedItems.length > 0 || unSelectedItems.length > 0

  return (
    <div
      className="min-w-[320px] max-w-[400px] bg-popover rounded-lg border shadow-lg overflow-hidden flex flex-col max-h-[480px] click-outside-ignore"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10">
            <Link2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-medium">Link Records</span>
        </div>
        {selectedItems.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-destructive/10"
          >
            <Unlink className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Search Input */}
      <div className="border-b px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search records..."
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full pl-9 pr-4 text-sm bg-muted/50 rounded-md border-0 outline-none focus:bg-background focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto max-h-[320px] min-h-[100px]"
      >
        {/* Empty State */}
        {!hasResults && (
          <div className="py-8 text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Search className="h-8 w-8 opacity-30" />
              <p className="text-sm">No records found</p>
              <p className="text-xs opacity-60">Try adjusting your search</p>
            </div>
          </div>
        )}

        {/* Selected Items */}
        {selectedItems.length > 0 && (
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Selected
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {selectedItems.length}
              </span>
            </div>
            {selectedItems.map((item, idx) => {
              const globalIndex = idx
              const isFocused = focusedIndex === globalIndex
              return (
                <div
                  key={item.id}
                  data-index={globalIndex}
                  onClick={() =>
                    selectItem({ _id: item.id, title: item.title })
                  }
                  onMouseEnter={() => setFocusedIndex(globalIndex)}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer",
                    isFocused && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded border border-current opacity-100 bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>
                  <span className="flex-1 truncate text-sm font-medium">
                    {item.title || "Untitled"}
                  </span>
                  <X className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
                </div>
              )
            })}
          </div>
        )}

        {/* Divider */}
        {selectedItems.length > 0 && unSelectedItems.length > 0 && (
          <div className="h-px bg-border mx-2 my-1" />
        )}

        {/* Available Items */}
        {unSelectedItems.length > 0 && (
          <div className="px-2 py-1.5">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Available
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                {unSelectedItems.length}
              </span>
            </div>
            {unSelectedItems.map((item, idx) => {
              const globalIndex = selectedItems.length + idx
              const isFocused = focusedIndex === globalIndex
              return (
                <div
                  key={item._id}
                  data-index={globalIndex}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setFocusedIndex(globalIndex)}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer",
                    isFocused && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded border border-muted-foreground/30 opacity-50 group-hover:opacity-100 group-hover:border-primary/50 transition-all" />
                  <span className="flex-1 truncate text-sm">
                    {item.title || "Untitled"}
                  </span>
                  <Plus className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground shrink-0">
        <span>
          {selectedItems.length > 0
            ? `${selectedItems.length} record${selectedItems.length === 1 ? "" : "s"} linked`
            : "No records linked"}
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
            Space
          </kbd>
          <span>toggle</span>
          <span className="mx-0.5">·</span>
          <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
            ↵
          </kbd>
          <span>save</span>
          <span className="mx-0.5">·</span>
          <kbd className="px-1 rounded bg-muted border text-[9px] font-sans">
            Esc
          </kbd>
          <span>cancel</span>
        </span>
      </div>
    </div>
  )
}
