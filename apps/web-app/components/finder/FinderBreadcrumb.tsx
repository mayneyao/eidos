"use client"

import { ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface FinderBreadcrumbProps {
  path: string
  locations: Array<{ name: string; path: string }>
  onNavigate: (path: string) => void
}

export function FinderBreadcrumb({
  path,
  locations,
  onNavigate,
}: FinderBreadcrumbProps) {
  // Parse path into breadcrumb segments
  const segments = parsePath(path, locations)

  return (
    <nav
      className="flex items-center gap-0.5 px-3 py-1.5 text-sm bg-muted/20 border-b border-border/50 overflow-x-auto scrollbar-hide h-[33px] flex-shrink-0"
      aria-label="Breadcrumb"
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const isFirst = index === 0

        return (
          <div key={segment.path} className="flex items-center flex-shrink-0">
            {!isFirst && (
              <ChevronRight className="h-3.5 w-3.5 mx-1 text-muted-foreground/40" />
            )}
            <button
              onClick={() => onNavigate(segment.path)}
              disabled={isLast}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded transition-all duration-150",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                isLast
                  ? "font-medium text-foreground cursor-default"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
            >
              {isFirst && <Home className="h-3.5 w-3.5" />}
              <span className="truncate max-w-[100px] sm:max-w-[140px] md:max-w-[180px]">
                {segment.name}
              </span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}

interface PathSegment {
  name: string
  path: string
}

function parsePath(
  path: string,
  locations: Array<{ name: string; path: string }>
): PathSegment[] {
  const segments: PathSegment[] = []

  // Find matching location
  const location = locations.find((loc) => path.startsWith(loc.path))

  if (!location) {
    // Fallback: just show the path as-is
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
    // Ensure path ends with / before adding next segment
    currentPath = currentPath.endsWith("/")
      ? currentPath + part
      : `${currentPath}/${part}`
    segments.push({ name: part, path: currentPath })
  }

  return segments
}
