import { formatSize } from "../utils"
import type { FileStats } from "../types"

interface StatusBarProps {
  stats: FileStats
  totalEntries: number
  filteredCount: number
  searchQuery: string
}

export function StatusBar({
  stats,
  totalEntries,
  filteredCount,
  searchQuery,
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        {stats.folders > 0 && (
          <span>
            {stats.folders} {stats.folders === 1 ? "folder" : "folders"}
          </span>
        )}
        {stats.folders > 0 && stats.files > 0 && (
          <span className="text-muted-foreground/40">·</span>
        )}
        {stats.files > 0 && (
          <span>
            {stats.files} {stats.files === 1 ? "file" : "files"}
          </span>
        )}
        {stats.folders === 0 && stats.files === 0 && "No items"}
        {searchQuery && totalEntries !== filteredCount && (
          <span className="text-muted-foreground/60">
            ({totalEntries} total)
          </span>
        )}
      </div>
      {stats.totalSize > 0 && (
        <span className="tabular-nums">{formatSize(stats.totalSize)}</span>
      )}
    </div>
  )
}
