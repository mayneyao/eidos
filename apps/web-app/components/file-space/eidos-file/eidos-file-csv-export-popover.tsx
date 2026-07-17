import { useEffect, useRef, useState } from "react"
import type { EidosFileCsvExportResult } from "@eidos.space/eidos-file"
import { Check, FileDown, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

import {
  EidosFileCsvOperationProgressBar,
  type EidosFileCsvOperationProgress,
} from "./eidos-file-csv-operation-progress"

type CsvExportSelection =
  | { canceled: true; fileName: null; result: null }
  | { canceled: false; fileName: string; result: EidosFileCsvExportResult }

function newOperationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `csv-export-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function progressPercent(
  progress: EidosFileCsvOperationProgress | null
): number {
  if (!progress || !progress.totalRows || progress.totalRows <= 0) return 0
  return Math.max(
    0,
    Math.min(
      100,
      Math.round((progress.processedRows / progress.totalRows) * 100)
    )
  )
}

export function EidosFileCsvExportPopover({
  disabled = false,
  triggerVariant = "workbar",
  viewName,
  onExport,
  onProgress,
  onCancel,
}: {
  disabled?: boolean
  triggerVariant?: "workbar" | "view-action"
  viewName: string
  onExport: (operationId: string) => Promise<CsvExportSelection>
  onProgress: (
    operationId: string
  ) => Promise<EidosFileCsvOperationProgress | null>
  onCancel: (operationId: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [progress, setProgress] =
    useState<EidosFileCsvOperationProgress | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeOperation = useRef<string | null>(null)

  useEffect(() => {
    if (!operationId) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const next = await onProgress(operationId)
        if (!disposed && next) setProgress(next)
      } catch {
        // The export promise owns the user-facing error state.
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), 120)
    }
    void poll()
    return () => {
      disposed = true
      if (timer) window.clearTimeout(timer)
    }
  }, [onProgress, operationId])

  useEffect(
    () => () => {
      if (activeOperation.current) void onCancel(activeOperation.current)
    },
    [onCancel]
  )

  const startExport = async () => {
    if (disabled || exporting) {
      if (exporting) setOpen(true)
      return
    }
    const nextOperationId = newOperationId()
    activeOperation.current = nextOperationId
    setOperationId(nextOperationId)
    setProgress(null)
    setError(null)
    setNotice("Choose where to save the current view.")
    setCanceling(false)
    setExporting(true)
    setOpen(true)
    try {
      const selection = await onExport(nextOperationId)
      if (selection.canceled) {
        setOpen(false)
        setNotice(null)
        return
      }
      setNotice(
        `Exported ${selection.result.exportedRowCount.toLocaleString()} rows to ${selection.fileName}.`
      )
    } catch (exportError) {
      const message =
        exportError instanceof Error
          ? exportError.message
          : "Unable to export CSV"
      if (message.toLowerCase().includes("cancel")) {
        setNotice("Export canceled. No partial CSV was kept.")
      } else {
        setError(message)
      }
    } finally {
      if (activeOperation.current === nextOperationId) {
        activeOperation.current = null
        setOperationId(null)
      }
      setExporting(false)
      setCanceling(false)
    }
  }

  const cancelExport = async () => {
    const current = activeOperation.current
    if (!current || canceling) return
    setCanceling(true)
    const canceled = await onCancel(current).catch(() => false)
    if (!canceled) {
      setCanceling(false)
      setError("Unable to cancel CSV export")
    }
  }

  const percent = progressPercent(progress)
  const label = canceling
    ? "Canceling export…"
    : progress?.phase === "finalizing"
      ? "Finalizing CSV…"
      : progress
        ? `Exporting rows… ${percent}%`
        : "Waiting for destination…"
  const detail = progress
    ? progress.totalRows === null
      ? `${progress.processedRows.toLocaleString()} rows`
      : `${progress.processedRows.toLocaleString()} of ${progress.totalRows.toLocaleString()} rows`
    : null

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (exporting && !nextOpen) return
        setOpen(nextOpen)
      }}
    >
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-xs",
            triggerVariant === "view-action"
              ? "h-8 w-full justify-start px-2 font-normal"
              : "eidos-file-workbar-action h-7 px-2"
          )}
          aria-label="Export current Eidos File view as CSV"
          title="Export current view"
          disabled={disabled && !exporting}
          onClick={() => void startExport()}
        >
          {exporting ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          <span
            className={cn(
              triggerVariant === "workbar" && "eidos-file-workbar-action-label"
            )}
          >
            {triggerVariant === "view-action"
              ? "Export current view as CSV"
              : "Export CSV"}
          </span>
        </Button>
      </PopoverAnchor>
      <PopoverContent align="end" sideOffset={5} className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Export current view</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {viewName} · visible fields, filters, and sorting
          </p>
        </div>
        <div className="space-y-3 px-4 py-4">
          {exporting ? (
            <EidosFileCsvOperationProgressBar
              label={label}
              detail={detail}
              percent={percent}
            />
          ) : (
            <p
              className={cn(
                "flex items-start gap-2 text-xs text-muted-foreground",
                error && "text-destructive"
              )}
            >
              {!error && notice ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : null}
              <span>{error || notice || "Ready to export."}</span>
            </p>
          )}
          <div className="flex justify-end gap-2">
            {exporting ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={canceling || !progress}
                onClick={() => void cancelExport()}
              >
                {canceling ? "Canceling…" : "Cancel export"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void startExport()}
                >
                  Export again
                </Button>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
