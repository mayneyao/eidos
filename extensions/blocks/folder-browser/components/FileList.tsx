import { FolderIcon, SearchIcon } from "lucide-react"
import { FileIconComponent } from "./FileIcon"
import { formatSize, formatDate } from "../utils"
import type { FileEntry, SortField, SortOrder } from "../types"
import { useEffect, useRef, useMemo, useState, useCallback } from "react"
import type { DataSpace } from "@eidos.space/core"

// Virtual list constants
const ITEM_HEIGHT = 40 // px - height of each row (h-10 = 40px)
const OVERSCAN = 5 // Number of items to render outside viewport

interface FileListProps {
  entries: FileEntry[]
  searchQuery: string
  selectedEntry: string | null
  sortField: SortField
  sortOrder: SortOrder
  onSelect: (path: string) => void
  onOpen: (entry: FileEntry) => void
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void
  onSort: (field: SortField) => void
}

// Column header component
interface ColumnHeaderProps {
  label: string
  field: SortField
  currentField: SortField
  order: SortOrder
  onSort: (field: SortField) => void
  width?: string
  align?: "left" | "right"
}

function ColumnHeader({
  label,
  field,
  currentField,
  order,
  onSort,
  width,
  align = "left",
}: ColumnHeaderProps) {
  const isActive = currentField === field

  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 font-medium hover:text-foreground transition-colors ${
        align === "right" ? "justify-end" : "justify-start"
      } ${width || "flex-1"} ${isActive ? "text-foreground" : ""}`}
    >
      <span>{label}</span>
      {isActive && (
        <span className="text-[10px]">{order === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  )
}

export function FileList({
  entries,
  searchQuery,
  selectedEntry,
  sortField,
  sortOrder,
  onSelect,
  onOpen,
  onContextMenu,
  onSort,
}: FileListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600) // Default height estimate

  // Measure container height
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(container)
    setContainerHeight(container.clientHeight)

    return () => resizeObserver.disconnect()
  }, [])

  // Calculate visible range
  const virtualItems = useMemo(() => {
    const totalHeight = entries.length * ITEM_HEIGHT
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN
    )
    // Ensure we always render at least 20 items even if container height is small
    const visibleCount = Math.max(
      20,
      Math.ceil(containerHeight / ITEM_HEIGHT) + OVERSCAN * 2
    )
    const endIndex = Math.min(entries.length, startIndex + visibleCount)

    return {
      totalHeight,
      startIndex,
      endIndex,
      visibleEntries: entries.slice(startIndex, endIndex),
      offsetY: startIndex * ITEM_HEIGHT,
    }
  }, [entries, scrollTop, containerHeight])

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // Scroll selected item into view only when selectedEntry actually changes
  const prevSelectedEntryRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      selectedEntry &&
      containerRef.current &&
      selectedEntry !== prevSelectedEntryRef.current
    ) {
      prevSelectedEntryRef.current = selectedEntry
      const index = entries.findIndex((e) => e.path === selectedEntry)
      if (index !== -1) {
        const itemTop = index * ITEM_HEIGHT
        const itemBottom = itemTop + ITEM_HEIGHT
        const viewportTop = containerRef.current.scrollTop
        const viewportBottom = viewportTop + containerHeight

        if (itemTop < viewportTop || itemBottom > viewportBottom) {
          containerRef.current.scrollTo({
            top: itemTop - containerHeight / 2 + ITEM_HEIGHT / 2,
            behavior: "smooth",
          })
        }
      }
    }
  }, [selectedEntry, entries, containerHeight])

  // Empty state
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        {searchQuery ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <SearchIcon className="h-7 w-7 opacity-40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No matches found</p>
              <p className="text-xs mt-1 opacity-60">
                Try adjusting your search
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <FolderIcon className="h-7 w-7 opacity-40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Folder is empty</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto relative"
    >
      {/* Column Headers */}
      <div className="flex items-center px-4 py-2 border-b bg-muted text-xs text-muted-foreground sticky top-0 z-10">
        <ColumnHeader
          label="Name"
          field="name"
          currentField={sortField}
          order={sortOrder}
          onSort={onSort}
          width="flex-1"
          align="left"
        />
        <ColumnHeader
          label="Size"
          field="size"
          currentField={sortField}
          order={sortOrder}
          onSort={onSort}
          width="w-20"
          align="right"
        />
        <ColumnHeader
          label="Modified"
          field="mtime"
          currentField={sortField}
          order={sortOrder}
          onSort={onSort}
          width="w-32 ml-6"
          align="right"
        />
      </div>

      {/* Virtual List */}
      <div style={{ height: virtualItems.totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${virtualItems.offsetY}px)` }}>
          {virtualItems.visibleEntries.map((entry, index) => {
            const actualIndex = virtualItems.startIndex + index
            const isSelected = selectedEntry === entry.path
            return (
              <div
                key={entry.path}
                data-path={entry.path}
                data-index={actualIndex}
                onClick={() => onSelect(entry.path)}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  onOpen(entry)
                }}
                onMouseDown={(e) => {
                  // Prevent text selection on double click
                  if (e.detail > 1) {
                    e.preventDefault()
                  }
                }}
                onContextMenu={(e) => onContextMenu(e, entry)}
                className={`flex items-center px-4 cursor-pointer transition-colors select-none border-b border-border/40 h-10 ${
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                }`}
              >
                {/* Name column */}
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <div className="shrink-0">
                    <FileIconComponent name={entry.name} kind={entry.kind} />
                  </div>
                  <span className="text-sm truncate">{entry.name}</span>
                </div>

                {/* Size column */}
                <div className="w-20 text-right text-xs shrink-0 tabular-nums text-muted-foreground">
                  {entry.kind === "file" ? formatSize(entry.size) : "—"}
                </div>

                {/* Modified column */}
                <div className="w-32 text-right ml-6 text-xs shrink-0 tabular-nums text-muted-foreground">
                  {formatDate(entry.mtimeMs)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
