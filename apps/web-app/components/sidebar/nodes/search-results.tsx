import { useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

import { ItemIcon } from "./index"
import { useTreeSidebarStore } from "./tree-sidebar-store"
import { ExtNodeBadge } from "../../ext-node-badge"

export const SearchResults = () => {
  const { searchResults, searchTerm } = useTreeSidebarStore()
  const navigate = useNavigate()

  const handleNavigate = (id: string) => {
    if (id.length === 10) {
      navigate(`/journals/${id}`)
    } else {
      navigate(`/${id}`)
    }
  }

  // Filter and separate node matches and FTS results
  const nodeMatches = searchResults.filter((node) => node.mode === "node")
  const ftsResults = searchResults.filter((node) => node.mode === "fts")

  if (searchResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
        <div className="text-muted-foreground text-xs mb-2">
          {searchTerm ? `No results found for "${searchTerm}"` : "No results"}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-2 space-y-4">
        {/* Node name matches */}
        {nodeMatches.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
              Nodes ({nodeMatches.length})
            </div>
            {nodeMatches.map((node) => (
              <div
                key={node.id}
                onClick={() => handleNavigate(node.id)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground",
                  "transition-colors"
                )}
              >
                <ItemIcon type={node.type} className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate text-sm">{node.name}</span>
                <ExtNodeBadge type={node.type} />
              </div>
            ))}
          </div>
        )}

        {/* Full-text search results */}
        {ftsResults.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
              Content Matches ({ftsResults.length})
            </div>
            {ftsResults.map((node) => (
              <div
                key={node.id}
                onClick={() => handleNavigate(node.id)}
                className={cn(
                  "flex flex-col gap-1 px-2 py-1.5 rounded-sm cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground",
                  "transition-colors"
                )}
              >
                <div className="flex items-center gap-2">
                  <ItemIcon type={node.type} className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium">
                    {node.name}
                  </span>
                </div>
                {node.result && (
                  <div
                    className="fts-result ml-6 text-xs text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: node.result,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
