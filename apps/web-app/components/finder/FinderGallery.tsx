"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FileIcon,
  ImageIcon,
  Music,
  Video,
  FileText,
  FileCode,
  FileJson,
} from "lucide-react"

import { getFileType } from "@/lib/mime/mime"
import { cn } from "@/lib/utils"
import type { FinderItem } from "./hooks/useFinder"

// Grid item configuration
const ITEM_SIZE = 100
const GAP = 12
const OVERSCAN = 1

interface FinderGalleryProps {
  items: FinderItem[]
  selectedPaths: Set<string>
  selectMode: "file" | "directory"
  onSelect: (path: string, isShiftKey: boolean, isMetaKey: boolean) => void
  onDoubleClick: (item: FinderItem) => void
}

// Get file icon based on type
const FileTypeIcon = ({
  name,
  className,
}: {
  name: string
  className?: string
}) => {
  const ext = name.split(".").pop()?.toLowerCase() || ""

  // Image extensions
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
  ) {
    return <ImageIcon className={cn("h-10 w-10 text-purple-500", className)} />
  }
  // Audio
  if (["mp3", "wav", "flac", "aac", "ogg"].includes(ext)) {
    return <Music className={cn("h-10 w-10 text-pink-500", className)} />
  }
  // Video
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return <Video className={cn("h-10 w-10 text-red-500", className)} />
  }
  // Code
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "cpp",
      "c",
      "swift",
      "kt",
    ].includes(ext)
  ) {
    return <FileCode className={cn("h-10 w-10 text-yellow-500", className)} />
  }
  // JSON
  if (ext === "json") {
    return <FileJson className={cn("h-10 w-10 text-green-500", className)} />
  }
  // Text/Markdown
  if (["md", "txt", "doc", "docx", "pdf"].includes(ext)) {
    return <FileText className={cn("h-10 w-10 text-blue-400", className)} />
  }

  return (
    <FileIcon className={cn("h-10 w-10 text-muted-foreground", className)} />
  )
}

// Individual gallery item
const GalleryItem = ({
  item,
  isSelected,
  isSelectable,
  onClick,
  onDoubleClick,
}: {
  item: FinderItem
  isSelected: boolean
  isSelectable: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
}) => {
  const isDirectory = item.kind === "directory"
  const ext = item.name.split(".").pop()?.toLowerCase() || ""
  const isImage = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico",
  ].includes(ext)

  // For images, try to get thumbnail from path
  const imageUrl = isImage ? item.path : null

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group relative flex flex-col items-center gap-2 p-3 rounded-lg cursor-pointer",
        "transition-all duration-150",
        isSelected ? "bg-accent ring-2 ring-primary/50" : "hover:bg-accent/40",
        !isSelectable && !isDirectory && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Thumbnail or Icon */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        {isImage && !isDirectory ? (
          <img
            src={imageUrl || ""}
            alt=""
            className="w-full h-full object-cover rounded-md"
            loading="lazy"
            decoding="async"
          />
        ) : isDirectory ? (
          <div className="w-14 h-14 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-blue-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
        ) : (
          <FileTypeIcon name={item.name} />
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <svg
              className="w-3 h-3 text-primary-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
      </div>

      {/* Filename */}
      <span
        className={cn(
          "text-xs text-center truncate w-full max-w-[80px] select-none",
          isSelected ? "text-accent-foreground font-medium" : "text-foreground"
        )}
        title={item.name}
      >
        {item.name}
      </span>
    </div>
  )
}

export function FinderGallery({
  items,
  selectedPaths,
  selectMode,
  onSelect,
  onDoubleClick,
}: FinderGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)

  // Calculate columns based on container width
  const columns = useMemo(() => {
    const minColWidth = ITEM_SIZE + GAP
    return Math.max(3, Math.floor(containerWidth / minColWidth))
  }, [containerWidth])

  const columnWidth = useMemo(() => {
    return (containerWidth - (columns - 1) * GAP) / columns
  }, [containerWidth, columns])

  const rows = useMemo(() => {
    return Math.ceil(items.length / columns)
  }, [items.length, columns])

  const totalHeight = useMemo(() => {
    return rows * (ITEM_SIZE + GAP)
  }, [rows])

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startRow = Math.max(
      0,
      Math.floor(scrollTop / (ITEM_SIZE + GAP)) - OVERSCAN
    )
    const visibleRows = Math.ceil(
      (containerRef.current?.clientHeight || 0) / (ITEM_SIZE + GAP)
    )
    const endRow = Math.min(rows, startRow + visibleRows + OVERSCAN * 2)

    return { startRow, endRow }
  }, [scrollTop, rows])

  // Get items for a specific row
  const getRowItems = useCallback(
    (rowIndex: number) => {
      const startIndex = rowIndex * columns
      return items.slice(startIndex, startIndex + columns).map((item, i) => ({
        item,
        index: startIndex + i,
        colIndex: i,
      }))
    },
    [items, columns]
  )

  // Handle scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      setScrollTop(container.scrollTop)
    }

    // Initial width
    setContainerWidth(container.clientWidth)

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(container)
    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      container.removeEventListener("scroll", handleScroll)
      resizeObserver.disconnect()
    }
  }, [])

  const handleItemClick = useCallback(
    (item: FinderItem, e: React.MouseEvent) => {
      onSelect(item.path, e.shiftKey, e.metaKey || e.ctrlKey)
    },
    [onSelect]
  )

  const handleItemDoubleClick = useCallback(
    (item: FinderItem) => {
      onDoubleClick(item)
    },
    [onDoubleClick]
  )

  const { startRow, endRow } = visibleRange

  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
            <FileIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium">This folder is empty</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden outline-none"
      tabIndex={0}
      role="listbox"
      aria-multiselectable={true}
      aria-label="File gallery"
    >
      <div style={{ height: totalHeight, position: "relative", width: "100%" }}>
        {Array.from({ length: endRow - startRow }, (_, i) => startRow + i).map(
          (rowIndex) => (
            <div
              key={rowIndex}
              style={{
                position: "absolute",
                top: rowIndex * (ITEM_SIZE + GAP),
                left: GAP / 2,
                right: GAP / 2,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, ${columnWidth}px)`,
                gap: GAP,
              }}
            >
              {getRowItems(rowIndex).map(({ item, index }) => {
                const isSelected = selectedPaths.has(item.path)
                const isDirectory = item.kind === "directory"
                const isSelectable =
                  (selectMode === "directory" && isDirectory) ||
                  (selectMode === "file" && !isDirectory)

                return (
                  <div
                    key={item.path}
                    style={{ width: columnWidth, height: ITEM_SIZE }}
                  >
                    <GalleryItem
                      item={item}
                      isSelected={isSelected}
                      isSelectable={isSelectable}
                      onClick={(e) => handleItemClick(item, e)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    />
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
