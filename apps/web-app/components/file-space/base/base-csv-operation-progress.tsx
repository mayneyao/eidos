export interface BaseCsvOperationProgress {
  operationId: string
  kind: "plan" | "import" | "export"
  status: "running" | "canceling" | "completed" | "canceled" | "failed"
  phase: "analyzing" | "importing" | "exporting" | "finalizing"
  processedBytes: number
  totalBytes: number
  processedRows: number
  totalRows: number | null
  message?: string
  updatedAt: number
}

interface BaseCsvOperationProgressBarProps {
  label: string
  detail: string | null
  percent: number
  size?: "compact" | "default"
}

export function BaseCsvOperationProgressBar({
  label,
  detail,
  percent,
  size = "default",
}: BaseCsvOperationProgressBarProps) {
  return (
    <div className="space-y-1">
      <div
        className={
          size === "compact"
            ? "flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
            : "flex items-center justify-between gap-3 text-xs text-muted-foreground"
        }
      >
        <span>{label}</span>
        {detail ? <span className="truncate">{detail}</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={`${size === "compact" ? "h-1" : "h-1.5"} overflow-hidden rounded-full bg-muted`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
