import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

import { ItemIcon } from "./index"
import { useTreeSidebarStore } from "./tree-sidebar-store"
import { ExtNodeBadge } from "../../ext-node-badge"

export const SearchResults = () => {
  const { searchResults, searchTerm, selectedIndex } = useTreeSidebarStore()
  const navigate = useNavigate()
  const selectedRef = useRef<HTMLDivElement>(null)

  const handleNavigate = (id: string) => {
    if (id.length === 10) {
      navigate(`/journals/${id}`)
    } else {
      navigate(`/${id}`)
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      })
    }
  }, [selectedIndex])

  // Filter and separate node matches and FTS results
  const nodeMatches = searchResults.filter((node) => node.mode === "node")
  const ftsResults = searchResults.filter((node) => node.mode === "fts")

  if (searchResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="text-muted-foreground text-sm">
          {searchTerm ? `No results found for "${searchTerm}"` : "No results"}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-1 space-y-3">
        {/* Node name matches */}
        {nodeMatches.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2">
              Nodes ({nodeMatches.length})
            </div>
            <div className="space-y-0.5">
              {nodeMatches.map((node, idx) => {
                const globalIndex = idx
                const isSelected = selectedIndex === globalIndex
                return (
                  <div
                    key={node.id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => handleNavigate(node.id)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer",
                      "hover:bg-accent/50 active:bg-accent",
                      "transition-all duration-150",
                      isSelected && "bg-accent ring-2 ring-primary/20"
                    )}
                  >
                    <ItemIcon type={node.type} className="h-4 w-4 flex-shrink-0 opacity-70" />
                    <span className="flex-1 truncate text-sm">{node.name}</span>
                    <ExtNodeBadge type={node.type} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Separator between sections */}
        {nodeMatches.length > 0 && ftsResults.length > 0 && (
          <Separator className="my-2" />
        )}

        {/* Full-text search results */}
        {ftsResults.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-2">
              Content Matches ({ftsResults.length})
            </div>
            <div className="space-y-1">
              {ftsResults.map((node, idx) => {
                const globalIndex = nodeMatches.length + idx
                const isSelected = selectedIndex === globalIndex
                return (
                  <div
                    key={node.id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => handleNavigate(node.id)}
                    className={cn(
                      "flex flex-col gap-2 px-2 py-2.5 rounded-md cursor-pointer",
                      "hover:bg-accent/50 active:bg-accent",
                      "transition-all duration-150",
                      "border border-transparent hover:border-border/50",
                      isSelected && "bg-accent ring-2 ring-primary/20 border-primary/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ItemIcon type={node.type} className="h-4 w-4 flex-shrink-0 opacity-70" />
                      <span className="flex-1 truncate text-sm font-medium">
                        {node.name}
                      </span>
                    </div>
                    {node.result && (
                      <div
                        className={cn(
                          "fts-result text-[11px] leading-relaxed text-muted-foreground/90",
                          "overflow-hidden break-words",
                          "max-h-32 overflow-y-auto",
                          "px-2 py-1 ml-4 rounded bg-muted/30"
                        )}
                        dangerouslySetInnerHTML={{
                          __html: node.result,
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
