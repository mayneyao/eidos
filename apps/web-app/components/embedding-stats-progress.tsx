import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmbeddingStatsProgressProps {
  className?: string
  stats?: {
    total: number
    vectorized: number
    outdated: number
    upToDate: number
    vectorizedPercentage: number
    outdatedPercentage: number
    upToDatePercentage: number
  }
}

export function EmbeddingStatsProgress({
  className,
  stats,
}: EmbeddingStatsProgressProps) {
  if (!stats?.total) return null

  const upToDatePercentage = (stats.upToDate / stats.total) * 100
  const outdatedPercentage = (stats.outdated / stats.total) * 100
  const remainingPercentage = 100 - upToDatePercentage - outdatedPercentage

  return (
    <div className={cn("w-full space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Embedding Stats</span>
        <span className="text-muted-foreground">
          {stats.total.toLocaleString()} items
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
        <div
          className="h-full bg-green-400"
          style={{ width: `${upToDatePercentage}%` }}
        />
        <div
          className="h-full bg-yellow-400"
          style={{ width: `${outdatedPercentage}%` }}
        />
        <div
          className="h-full bg-muted-foreground/30"
          style={{ width: `${remainingPercentage}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-400" />
          <span>Up to date</span>
          <span className="text-muted-foreground">({stats.upToDate})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-yellow-400" />
          <span>Outdated</span>
          <span className="text-muted-foreground">({stats.outdated})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span>Not vectorized</span>
          <span className="text-muted-foreground">
            ({stats.total - stats.vectorized})
          </span>
        </div>
      </div>

      {/* Warning for low up-to-date percentage */}
      {upToDatePercentage < 80 && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md border p-1.5 text-[10px]",
            "border-yellow-300 bg-yellow-50 text-yellow-700",
            "dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
          )}
        >
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            Low up-to-date rate ({upToDatePercentage.toFixed(0)}%). Click
            process to update.
          </span>
        </div>
      )}
    </div>
  )
}
