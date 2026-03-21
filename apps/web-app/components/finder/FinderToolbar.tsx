"use client"

import { useRef, useCallback, useState } from "react"
import {
  Search,
  X,
  Loader2,
  ChevronRight,
  Home,
  LayoutGrid,
  List,
  Globe,
  FolderOpen,
  MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SearchScope } from "./hooks/useFinder"

interface FinderToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  isSearching: boolean
  // Breadcrumb props
  path: string
  locations: Array<{ name: string; path: string }>
  onNavigate: (path: string) => void
  // Search availability
  canSearch?: boolean
  // View mode
  viewMode: "list" | "gallery"
  onViewModeChange: (mode: "list" | "gallery") => void
  // Search scope
  searchScope: SearchScope
  onSearchScopeChange: (scope: SearchScope) => void
  isSearchMode: boolean
}

// Parse path into breadcrumb segments
function parsePath(
  path: string,
  locations: Array<{ name: string; path: string }>
): Array<{ name: string; path: string }> {
  const segments: Array<{ name: string; path: string }> = []

  // Find matching location
  const location = locations.find((loc) => path.startsWith(loc.path))

  if (!location) {
    return [{ name: "Space", path: "~/" }]
  }

  // Add location as first segment
  segments.push({ name: location.name, path: location.path })

  // If path is exactly the location path, we're done
  if (path === location.path) {
    return segments
  }

  // Parse remaining path segments
  const remainingPath = path.slice(location.path.length)
  const parts = remainingPath.split("/").filter(Boolean)

  let currentPath = location.path
  for (const part of parts) {
    currentPath = currentPath.endsWith("/")
      ? currentPath + part
      : `${currentPath}/${part}`
    segments.push({ name: part, path: currentPath })
  }

  return segments
}

export function FinderToolbar({
  searchQuery,
  onSearchChange,
  isSearching,
  path,
  locations,
  onNavigate,
  canSearch = true,
  viewMode,
  onViewModeChange,
  searchScope,
  onSearchScopeChange,
  isSearchMode,
}: FinderToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd/Ctrl + F to focus search
  const handleKeyDown = useCallback((e: Event) => {
    const keyboardEvent = e as unknown as KeyboardEvent
    if (
      (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
      keyboardEvent.key === "f"
    ) {
      keyboardEvent.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [])

  // Add keyboard listener when mounted
  const containerRef = useRef<HTMLDivElement>(null)

  const clearSearch = useCallback(() => {
    onSearchChange("")
    inputRef.current?.focus()
  }, [onSearchChange])

  const segments = parsePath(path, locations)

  // Collapsible breadcrumb logic
  // Show first, last, and at most 2 middle segments
  const MAX_VISIBLE = 4
  const shouldCollapse = segments.length > MAX_VISIBLE
  const visibleSegments = shouldCollapse
    ? [
        segments[0], // First
        { id: "ellipsis", path: "", name: "...", isEllipsis: true }, // Ellipsis
        ...segments.slice(-2), // Last 2
      ]
    : segments

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background/95 h-[49px] flex-shrink-0 overflow-x-hidden"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }
      }}
    >
      {/* Breadcrumb - takes remaining space, no scrollbar */}
      {!isSearchMode && (
        <nav
          className="flex-1 flex items-center gap-0.5 text-sm min-w-0 overflow-hidden"
          aria-label="Breadcrumb"
        >
          {visibleSegments.map((segment: any, index) => {
            const isLast = index === visibleSegments.length - 1
            const isFirst = index === 0
            const isEllipsis = segment.isEllipsis

            return (
              <div
                key={isEllipsis ? "ellipsis" : segment.path}
                className="flex items-center flex-shrink-0"
              >
                {!isFirst && (
                  <ChevronRight className="h-3.5 w-3.5 mx-0.5 text-muted-foreground/40 flex-shrink-0" />
                )}
                {isEllipsis ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-150"
                        title="Show all folders"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-w-[200px]"
                    >
                      {segments.slice(1, -2).map((s: any) => (
                        <DropdownMenuItem
                          key={s.path}
                          onClick={() => onNavigate(s.path)}
                          className="text-xs cursor-pointer"
                        >
                          <span className="truncate">{s.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <button
                    onClick={() => onNavigate(segment.path)}
                    disabled={isLast}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded transition-all duration-150 truncate",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      isLast
                        ? "font-medium text-foreground cursor-default"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )}
                    title={segment.name}
                  >
                    {isFirst && <Home className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span className="truncate max-w-[120px]">
                      {segment.name}
                    </span>
                  </button>
                )}
              </div>
            )
          })}
        </nav>
      )}

      {/* In search mode, show search scope and "Search results" text */}
      {isSearchMode && (
        <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground truncate">
          <span>Search results</span>
          <span className="text-muted-foreground/50">•</span>
          <span className="text-xs">
            {searchScope === "global" ? "Global" : "Current folder"}
          </span>
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center gap-1 border-l border-border/50 pl-3">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            viewMode === "list" && "bg-accent text-accent-foreground"
          )}
          onClick={() => onViewModeChange("list")}
          title="List view"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            viewMode === "gallery" && "bg-accent text-accent-foreground"
          )}
          onClick={() => onViewModeChange("gallery")}
          title="Gallery view"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>

      {/* Search - hidden in directory selection mode */}
      {canSearch && (
        <div className="relative flex items-center gap-2">
          {/* Search scope toggle */}
          <div className="flex items-center border border-border/50 rounded-md overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-none",
                searchScope === "current" && "bg-accent text-accent-foreground"
              )}
              onClick={() => onSearchScopeChange("current")}
              title="Search in current folder"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-none",
                searchScope === "global" && "bg-accent text-accent-foreground"
              )}
              onClick={() => onSearchScopeChange("global")}
              title="Search entire space"
            >
              <Globe className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Search input */}
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={cn(
                "pl-8 pr-7 h-8 text-sm bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-ring",
                searchQuery && "pr-12"
              )}
            />
            {isSearching && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              </div>
            )}
            {!isSearching && searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
