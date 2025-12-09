import { useEffect, useRef } from "react"
import { BlocksIcon, ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import type { ISearchNodes } from "@/components/cmdk/hooks"
import type { ISearchExtensions } from "@/apps/web-app/hooks/use-query-extension"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { ExtNodeBadge } from "../../ext-node-badge"
import { IconRenderer } from "../../ui/icon-picker"
import { ItemIcon } from "./index"

interface SearchResultsProps {
  type: "nodes" | "extensions"
  searchResults: ISearchNodes[] | ISearchExtensions[]
  searchTerm: string
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  isItemsExpanded: boolean
  setIsItemsExpanded: (expanded: boolean) => void
  isContentExpanded: boolean
  setIsContentExpanded: (expanded: boolean) => void
}

export const SearchResults = ({
  type,
  searchResults,
  searchTerm,
  selectedIndex,
  setSelectedIndex,
  isItemsExpanded,
  setIsItemsExpanded,
  isContentExpanded,
  setIsContentExpanded,
}: SearchResultsProps) => {
  const { navigate } = useRouterAdapter()
  const selectedRef = useRef<HTMLButtonElement>(null)

  const handleNavigate = (id: string) => {
    if (type === "extensions") {
      navigate(`/extensions/${id}`)
    } else {
      // nodes
      if (id.length === 10) {
        navigate(`/journals/${id}`)
      } else {
        navigate(`/${id}`)
      }
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

  // Filter and separate item matches (node/extension name) and FTS results
  const itemMode = type === "nodes" ? "node" : "extension"
  const itemMatches = searchResults.filter((item) => item.mode === itemMode)
  const ftsResults = searchResults.filter((item) => item.mode === "fts")

  // Calculate visible items for keyboard navigation
  const visibleItems = [
    ...(isItemsExpanded ? itemMatches : []),
    ...(isContentExpanded ? ftsResults : []),
  ]

  // Get section title based on type
  const itemsTitle = type === "nodes" ? "Nodes" : "Extensions"

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
      <div className="space-y-2 pb-4">
        {/* Item name matches (Nodes or Extensions) */}
        {itemMatches.length > 0 && (
          <div className="space-y-1">
            <div
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5 flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setIsItemsExpanded(!isItemsExpanded)}
            >
              {isItemsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span className="select-none">
                {itemsTitle} ({itemMatches.length})
              </span>
            </div>
            {isItemsExpanded && (
              <div className="space-y-0.5 px-2">
                {itemMatches.map((item, idx) => {
                  // Nodes are always at the beginning of visible list when expanded
                  const currentIndex = idx
                  const isSelected = selectedIndex === currentIndex
                  return (
                    <button
                      type="button"
                      key={item.id}
                      ref={isSelected ? selectedRef : null}
                      onClick={() => handleNavigate(item.id)}
                      onFocus={() => setSelectedIndex(currentIndex)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleNavigate(item.id)
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left",
                        isSelected
                          ? "border-primary/70 bg-primary/10"
                          : "bg-muted/30 hover:bg-accent/40 hover:border-border transition-colors duration-100"
                      )}
                    >
                      {type === "nodes" ? (
                        <>
                          <ItemIcon
                            type={(item as ISearchNodes).type}
                            className="h-4 w-4 flex-shrink-0 opacity-70"
                          />
                          <span className="flex-1 truncate text-sm min-w-0">
                            {item.name}
                          </span>
                          <ExtNodeBadge type={(item as ISearchNodes).type} />
                        </>
                      ) : (
                        <>
                          {(item as ISearchExtensions).icon ? (
                            (item as ISearchExtensions).icon!.startsWith(
                              "data:image"
                            ) ? (
                              <img
                                src={(item as ISearchExtensions).icon}
                                alt="extension icon"
                                className="h-4 w-4 rounded object-cover flex-shrink-0"
                              />
                            ) : (
                              <IconRenderer
                                name={(item as ISearchExtensions).icon as any}
                                className="h-4 w-4 flex-shrink-0 opacity-70"
                              />
                            )
                          ) : (
                            <BlocksIcon className="h-4 w-4 flex-shrink-0 opacity-70" />
                          )}
                          <span className="flex-1 truncate text-sm min-w-0">
                            {(item as ISearchExtensions).slug}
                          </span>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Separator between sections */}
        {itemMatches.length > 0 && ftsResults.length > 0 && (
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
              <span className="select-none">
                Content Matches ({ftsResults.length})
              </span>
            </div>
            {isContentExpanded && (
              <div className="space-y-2 px-2">
                {ftsResults.map((item, idx) => {
                  // Content matches start after items (if items are expanded)
                  const currentIndex =
                    (isItemsExpanded ? itemMatches.length : 0) + idx
                  const isSelected = selectedIndex === currentIndex
                  const displayName =
                    type === "nodes"
                      ? (item as ISearchNodes).name
                      : (item as ISearchExtensions).slug
                  return (
                    <button
                      type="button"
                      key={item.id}
                      ref={isSelected ? selectedRef : null}
                      onClick={() => handleNavigate(item.id)}
                      onFocus={() => setSelectedIndex(currentIndex)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleNavigate(item.id)
                        }
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left",
                        isSelected
                          ? "border-primary/70 bg-primary/10"
                          : "bg-muted/30 hover:bg-accent/40 hover-border-border transition-colors duration-100"
                      )}
                    >
                      <div className="text-sm font-medium truncate min-w-0">
                        {displayName}
                      </div>
                      {item.result && (
                        <div
                          className={cn(
                            "fts-result mt-1 text-xs leading-relaxed text-muted-foreground",
                            "overflow-hidden break-words line-clamp-3 min-h-[36px]",
                            "[&_b]:text-destructive [&_b]:font-semibold"
                          )}
                          style={{
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                          }}
                          dangerouslySetInnerHTML={{
                            __html: item.result,
                          }}
                        />
                      )}
                    </button>
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
