import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

import { useTreeSidebarStore } from "./tree-sidebar-store"
import { ExtNodeBadge } from "../../ext-node-badge"
import { ItemIcon } from "./index"

export const SearchResults = () => {
  const { 
    searchResults, 
    searchTerm, 
    selectedIndex,
    isNodesExpanded,
    setIsNodesExpanded,
    isContentExpanded,
    setIsContentExpanded,
  } = useTreeSidebarStore()
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
        behavior: "auto",
      })
    }
  }, [selectedIndex])

  // Filter and separate node matches and FTS results
  const nodeMatches = searchResults.filter((node) => node.mode === "node")
  const ftsResults = searchResults.filter((node) => node.mode === "fts")
  
  // Calculate visible nodes for keyboard navigation
  const visibleNodes = [
    ...(isNodesExpanded ? nodeMatches : []),
    ...(isContentExpanded ? ftsResults : [])
  ]

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
    <div className="h-full w-full overflow-x-hidden overflow-y-auto">
      <div className="space-y-4 pb-4">
        {/* Node name matches */}
        {nodeMatches.length > 0 && (
          <div className="space-y-1">
            <div 
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5 flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setIsNodesExpanded(!isNodesExpanded)}
            >
              {isNodesExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Nodes ({nodeMatches.length})</span>
            </div>
            {isNodesExpanded && (
              <div className="space-y-0.5 px-2">
              {nodeMatches.map((node, idx) => {
                const visibleIndex = visibleNodes.findIndex(n => n.id === node.id)
                const isSelected = selectedIndex === visibleIndex
                return (
                  <div
                    key={node.id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => handleNavigate(node.id)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer min-w-0",
                      "hover:bg-accent/50 active:bg-accent",
                      "transition-all duration-150",
                      isSelected && "bg-accent ring-2 ring-primary/20"
                    )}
                  >
                    <ItemIcon type={node.type} className="h-4 w-4 flex-shrink-0 opacity-70" />
                    <span className="flex-1 truncate text-sm min-w-0">{node.name}</span>
                    <ExtNodeBadge type={node.type} />
                  </div>
                )
              })}
              </div>
            )}
          </div>
        )}

        {/* Separator between sections */}
        {nodeMatches.length > 0 && ftsResults.length > 0 && (
          <Separator className="mx-2" />
        )}

        {/* Full-text search results */}
        {ftsResults.length > 0 && (
          <div className="space-y-1">
            <div 
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5 flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setIsContentExpanded(!isContentExpanded)}
            >
              {isContentExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Content Matches ({ftsResults.length})</span>
            </div>
            {isContentExpanded && (
              <div className="space-y-2 px-2">
              {ftsResults.map((node, idx) => {
                const visibleIndex = visibleNodes.findIndex(n => n.id === node.id)
                const isSelected = selectedIndex === visibleIndex
                return (
                  <div
                    key={node.id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => handleNavigate(node.id)}
                    className={cn(
                      "flex flex-col gap-1.5 px-3 py-2 rounded-md cursor-pointer min-w-0",
                      "hover:bg-accent/50 active:bg-accent",
                      "transition-all duration-150",
                      "border border-transparent hover:border-border/50",
                      isSelected && "bg-accent ring-2 ring-primary/20 border-primary/30"
                    )}
                  >
                    <div className="text-sm font-medium truncate min-w-0">
                      {node.name}
                    </div>
                    {node.result && (
                      <div
                        className={cn(
                          "fts-result text-[11px] leading-relaxed text-muted-foreground/90",
                          "overflow-hidden break-words line-clamp-4"
                        )}
                        style={{ 
                          wordBreak: "break-word", 
                          overflowWrap: "anywhere"
                        }}
                        dangerouslySetInnerHTML={{
                          __html: node.result,
                        }}
                      />
                    )}
                  </div>
                )
              })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
