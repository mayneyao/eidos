"use client"

import { useCallback, useRef, useEffect, memo } from "react"
import {
  Folder,
  FileText,
  Image,
  File,
  FileCode,
  FileJson,
  FileType,
  Music,
  Video,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FinderItem } from "./hooks/useFinder"
import { useVirtualList } from "./hooks/useVirtualList"

const ITEM_HEIGHT = 44
const OVERSCAN = 10

interface FinderContentProps {
  items: FinderItem[]
  selectedPaths: Set<string>
  currentPath: string
  isLoading: boolean
  isSearchMode: boolean
  selectMode: "file" | "directory"
  onSelect: (path: string, isShiftKey: boolean, isMetaKey: boolean) => void
  onDoubleClick: (item: FinderItem) => void
}

// File icon based on extension - memoized for performance
const FileIcon = memo(function FileIcon({
  name,
  kind,
}: {
  name: string
  kind: string
}) {
  const iconClass = "h-5 w-5 flex-shrink-0"

  if (kind === "directory") {
    return <Folder className={cn(iconClass, "text-blue-500")} />
  }

  const ext = name.split(".").pop()?.toLowerCase() || ""

  switch (ext) {
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
    case "svg":
    case "bmp":
    case "ico":
      return <Image className={cn(iconClass, "text-purple-500")} />
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "mjs":
      return <FileCode className={cn(iconClass, "text-yellow-500")} />
    case "py":
    case "rb":
    case "go":
    case "rs":
    case "java":
    case "cpp":
    case "c":
    case "h":
    case "swift":
    case "kt":
      return <FileCode className={cn(iconClass, "text-orange-500")} />
    case "json":
      return <FileJson className={cn(iconClass, "text-green-500")} />
    case "md":
    case "markdown":
      return <FileText className={cn(iconClass, "text-blue-400")} />
    case "txt":
    case "doc":
    case "docx":
    case "pdf":
      return <FileText className={cn(iconClass, "text-slate-500")} />
    case "mp3":
    case "wav":
    case "flac":
    case "aac":
    case "ogg":
      return <Music className={cn(iconClass, "text-pink-500")} />
    case "mp4":
    case "mov":
    case "avi":
    case "mkv":
    case "webm":
      return <Video className={cn(iconClass, "text-red-500")} />
    case "html":
    case "htm":
    case "css":
    case "scss":
    case "sass":
    case "less":
      return <FileCode className={cn(iconClass, "text-cyan-500")} />
    default:
      return <File className={cn(iconClass, "text-gray-400")} />
  }
})

// Format file size
function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes === 0) return "—"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

// Format date
function formatDate(timestamp?: number): string {
  if (!timestamp) return "—"
  const date = new Date(timestamp)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays === 0) {
    return "Today"
  } else if (diffDays === 1) {
    return "Yesterday"
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" })
  } else {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }
}

// Virtual list item component - memoized for performance
const VirtualItem = memo(function VirtualItem({
  item,
  index,
  isSelected,
  isSelectable,
  isSearchMode,
  onSelect,
  onDoubleClick,
}: {
  item: FinderItem
  index: number
  isSelected: boolean
  isSelectable: boolean
  isSearchMode: boolean
  onSelect: (path: string, shift: boolean, meta: boolean) => void
  onDoubleClick: (item: FinderItem) => void
}) {
  const itemRef = useRef<HTMLDivElement>(null)
  const isDirectory = item.kind === "directory"

  // Focus management
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.focus({ preventScroll: true })
    }
  }, [isSelected])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectable) return
      onSelect(item.path, e.shiftKey, e.metaKey || e.ctrlKey)
    },
    [isSelectable, item.path, onSelect]
  )

  const handleDoubleClick = useCallback(() => {
    onDoubleClick(item)
  }, [item, onDoubleClick])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        onDoubleClick(item)
      } else if (e.key === " " && isSelectable) {
        e.preventDefault()
        onSelect(item.path, false, true)
      }
    },
    [isSelectable, isDirectory, item.path, onSelect, onDoubleClick, item]
  )

  return (
    <div
      ref={itemRef}
      className={cn(
        "absolute left-0 right-0 px-4 flex items-center cursor-pointer select-none outline-none",
        "transition-colors duration-75",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/40 text-foreground",
        !isSelectable && !isDirectory && "opacity-50 cursor-not-allowed"
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isSelected ? 0 : -1}
      role="option"
      aria-selected={isSelected}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mr-3">
        <FileIcon name={item.name} kind={item.kind} />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "truncate text-sm font-medium select-none",
              isSelected ? "text-accent-foreground" : "text-foreground"
            )}
          >
            {item.name}
          </span>
          {isSearchMode && (
            <span className="text-xs text-muted-foreground truncate flex-shrink">
              in {item.parentPath}
            </span>
          )}
        </div>
      </div>

      {/* Size */}
      <div className="w-24 text-right text-xs text-muted-foreground/80 hidden sm:block tabular-nums">
        {formatFileSize(item.metadata?.size)}
      </div>

      {/* Modified */}
      <div className="w-28 text-right text-xs text-muted-foreground/80 hidden md:block ml-4 tabular-nums">
        {formatDate(item.metadata?.mtime)}
      </div>
    </div>
  )
})

export function FinderContent({
  items,
  selectedPaths,
  currentPath,
  isLoading,
  isSearchMode,
  selectMode,
  onSelect,
  onDoubleClick,
}: FinderContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastSelectedIndex = useRef<number>(-1)

  // Update last selected index - reset when items change (search/ navigation)
  useEffect(() => {
    if (selectedPaths.size === 1) {
      const path = Array.from(selectedPaths)[0]
      const index = items.findIndex((item) => item.path === path)
      lastSelectedIndex.current = index
    } else if (selectedPaths.size === 0) {
      lastSelectedIndex.current = -1
    }
  }, [selectedPaths])

  // Reset last selected index when items change (search mode switch or navigation)
  useEffect(() => {
    lastSelectedIndex.current = -1
  }, [items])

  // Setup virtual list
  const {
    virtualItems,
    totalHeight,
    containerRef: virtualContainerRef,
    isScrolling,
  } = useVirtualList(items, {
    itemHeight: ITEM_HEIGHT,
    overscan: OVERSCAN,
  })

  // Merge refs
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      ;(
        virtualContainerRef as React.MutableRefObject<HTMLDivElement | null>
      ).current = node
      ;(containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node
    },
    [virtualContainerRef]
  )

  // Global keyboard navigation
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when container is focused or contains focus
      if (!container.contains(document.activeElement)) return

      const currentIndex = lastSelectedIndex.current
      const maxIndex = items.length - 1

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          if (currentIndex < maxIndex) {
            const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1
            const nextItem = items[nextIndex]
            onSelect(nextItem.path, e.shiftKey, false)
            lastSelectedIndex.current = nextIndex
          }
          break
        case "ArrowUp":
          e.preventDefault()
          if (currentIndex > 0) {
            const prevIndex = currentIndex - 1
            const prevItem = items[prevIndex]
            onSelect(prevItem.path, e.shiftKey, false)
            lastSelectedIndex.current = prevIndex
          }
          break
        case "Home":
          e.preventDefault()
          if (items.length > 0) {
            onSelect(items[0].path, e.shiftKey, false)
            lastSelectedIndex.current = 0
          }
          break
        case "End":
          e.preventDefault()
          if (items.length > 0) {
            onSelect(items[maxIndex].path, e.shiftKey, false)
            lastSelectedIndex.current = maxIndex
          }
          break
        case "a":
          if ((e.metaKey || e.ctrlKey) && selectMode !== "directory") {
            e.preventDefault()
            // Select all would be handled by parent
          }
          break
      }
    }

    container.addEventListener("keydown", handleKeyDown)
    return () => container.removeEventListener("keydown", handleKeyDown)
  }, [items, onSelect, selectMode])

  const isEmpty = !isLoading && items.length === 0

  return (
    <div className="flex flex-col bg-background h-full w-full">
      {/* Header - fixed height */}
      <div className="flex items-center px-4 py-2.5 text-xs font-medium text-muted-foreground/80 border-b border-border/50 bg-muted/20 h-[41px] flex-shrink-0">
        <div className="flex-1 min-w-0 pl-8">Name</div>
        <div className="w-24 text-right hidden sm:block">Size</div>
        <div className="w-28 text-right hidden md:block ml-4">Modified</div>
      </div>

      {/* Content - fixed height container */}
      <div
        ref={setContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden outline-none relative min-h-0"
        tabIndex={0}
        role="listbox"
        aria-multiselectable={true}
        aria-label="File list"
      >
        {/* Empty state - absolute overlay instead of replacing content */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center px-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Folder className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">
                {isSearchMode
                  ? "No files found matching your search"
                  : "This folder is empty"}
              </p>
              {isSearchMode && (
                <p className="text-muted-foreground/60 text-xs mt-1">
                  Try adjusting your search terms
                </p>
              )}
            </div>
          </div>
        )}

        {/* Virtual list content */}
        <div className="relative" style={{ height: totalHeight }}>
          {virtualItems.map(({ data: item, index, style }) => {
            const isSelected = selectedPaths.has(item.path)
            const isDirectory = item.kind === "directory"
            // Strict selection mode:
            // - "file": only files can be selected (directories are for navigation only)
            // - "directory": only directories can be selected
            const isSelectable =
              (selectMode === "directory" && isDirectory) ||
              (selectMode === "file" && !isDirectory)

            return (
              <div key={item.path} style={style}>
                <VirtualItem
                  item={item}
                  index={index}
                  isSelected={isSelected}
                  isSelectable={isSelectable}
                  isSearchMode={isSearchMode}
                  onSelect={onSelect}
                  onDoubleClick={onDoubleClick}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
