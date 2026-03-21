"use client"

import { useRef, useCallback } from "react"
import { ArrowUp, Search, X, Loader2, ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface FinderToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  canGoUp: boolean
  isSearching: boolean
  onUp: () => void
  // Breadcrumb props
  path: string
  locations: Array<{ name: string; path: string }>
  onNavigate: (path: string) => void
  // Search availability
  canSearch?: boolean
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
  canGoUp,
  isSearching,
  onUp,
  path,
  locations,
  onNavigate,
  canSearch = true,
}: FinderToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: Cmd/Ctrl + F to focus search
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault()
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

  const isSearchMode = !!searchQuery
  const segments = parsePath(path, locations)

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-3 px-3 py-2 border-b border-border bg-background/95 h-[49px] flex-shrink-0"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }
      }}
    >
      {/* Up button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 flex-shrink-0 rounded-md",
          !canGoUp && "opacity-40 cursor-not-allowed"
        )}
        onClick={onUp}
        disabled={!canGoUp}
        title="Go to parent folder"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>

      {/* Breadcrumb - takes remaining space, no scrollbar */}
      {!isSearchMode && (
        <nav
          className="flex-1 flex items-center gap-0.5 text-sm min-w-0 overflow-hidden"
          aria-label="Breadcrumb"
        >
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1
            const isFirst = index === 0

            return (
              <div
                key={segment.path}
                className="flex items-center flex-shrink-0"
              >
                {!isFirst && (
                  <ChevronRight className="h-3.5 w-3.5 mx-0.5 text-muted-foreground/40 flex-shrink-0" />
                )}
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
                  <span className="truncate max-w-[120px]">{segment.name}</span>
                </button>
              </div>
            )
          })}
        </nav>
      )}

      {/* In search mode, show "Search results" text */}
      {isSearchMode && (
        <div className="flex-1 text-sm text-muted-foreground truncate">
          Search results
        </div>
      )}

      {/* Search - hidden in directory selection mode */}
      {canSearch && (
        <div className="relative w-48 flex-shrink-0">
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
      )}
    </div>
  )
}
