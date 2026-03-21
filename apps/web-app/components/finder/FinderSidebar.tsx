"use client"

import { Database, FolderOpen, ChevronRight, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FinderLocation } from "./hooks/useFinder"

interface FinderSidebarProps {
  locations: FinderLocation[]
  currentPath: string
  onNavigate: (path: string) => void
  isLoading?: boolean
}

const iconMap: Record<string, React.ReactNode> = {
  Database: <Database className="h-4 w-4" />,
  FolderOpen: <FolderOpen className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
}

export function FinderSidebar({
  locations,
  currentPath,
  onNavigate,
  isLoading,
}: FinderSidebarProps) {
  // Group locations by type
  const spaceLocations = locations.filter((loc) => loc.type === "space")
  const mountLocations = locations.filter((loc) => loc.type === "mount")
  const shortcutLocations = locations.filter((loc) => loc.type === "shortcut")

  return (
    <div className="w-44 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
        Locations
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Space Section */}
        <div className="px-2 pb-1">
          {spaceLocations.map((location) => {
            const isActive =
              currentPath.startsWith(location.path) &&
              !currentPath.startsWith("~/.eidos/files")
            const icon = iconMap[location.icon || ""] || (
              <Database className="h-4 w-4" />
            )

            return (
              <button
                key={location.id}
                onClick={() => onNavigate(location.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <span
                  className={cn(
                    "text-sidebar-foreground/50 transition-colors",
                    isActive
                      ? "text-sidebar-accent-foreground"
                      : "group-hover:text-sidebar-accent-foreground"
                  )}
                >
                  {icon}
                </span>
                <span className="truncate">{location.name}</span>
                {isActive && (
                  <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-70" />
                )}
              </button>
            )
          })}

          {/* Shortcut locations - indented */}
          {shortcutLocations.map((location) => {
            const isActive = currentPath.startsWith(location.path)
            const icon = iconMap[location.icon || ""] || (
              <FileText className="h-4 w-4" />
            )

            return (
              <button
                key={location.id}
                onClick={() => onNavigate(location.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 pl-7 pr-2 py-1.5 rounded-md text-sm transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <span
                  className={cn(
                    "text-sidebar-foreground/40 transition-colors",
                    isActive && "text-sidebar-accent-foreground"
                  )}
                >
                  {icon}
                </span>
                <span className="truncate">{location.name}</span>
                {isActive && (
                  <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-70" />
                )}
              </button>
            )
          })}
        </div>

        {/* Mounts Section */}
        {mountLocations.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[11px] font-semibold text-sidebar-foreground/50 uppercase tracking-wider border-t border-sidebar-border/50">
              Mounts
            </div>
            <div className="px-2 py-1 space-y-0.5">
              {mountLocations.map((location) => {
                const isActive = currentPath.startsWith(location.path)
                const icon = iconMap[location.icon || ""] || (
                  <FolderOpen className="h-4 w-4" />
                )

                return (
                  <button
                    key={location.id}
                    onClick={() => onNavigate(location.path)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-all duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sidebar-foreground/50 transition-colors",
                        isActive && "text-sidebar-accent-foreground"
                      )}
                    >
                      {icon}
                    </span>
                    <span className="truncate">{location.name}</span>
                    {isActive && (
                      <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-70" />
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="px-3 py-2 border-t border-sidebar-border/50">
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/50">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sidebar-border border-t-sidebar-foreground/50" />
            <span>Loading...</span>
          </div>
        </div>
      )}
    </div>
  )
}
