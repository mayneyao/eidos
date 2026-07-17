export interface EidosFileCsvOperationProgress {
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

export interface EidosFileCsvOperationProgressBarProps {
  label: string
  detail: string | null
  percent: number
  size?: "compact" | "default"
}

export function EidosFileCsvOperationProgressBar({
  label,
  detail,
  percent,
  size = "default",
}: EidosFileCsvOperationProgressBarProps) {
  const safePercent = Math.min(100, Math.max(0, percent))
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
        aria-valuenow={safePercent}
        className={`${size === "compact" ? "h-1" : "h-1.5"} overflow-hidden rounded-full bg-muted`}
      >
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-150 motion-reduce:transition-none"
          style={{ transform: `scaleX(${safePercent / 100})` }}
        />
      </div>
    </div>
  )
}
