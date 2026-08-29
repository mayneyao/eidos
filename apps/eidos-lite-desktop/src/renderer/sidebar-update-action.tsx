import { Download, LoaderCircle, RotateCcw } from "lucide-react"

import type { EidosLiteUpdateStatus } from "../shared/contracts"

interface SidebarUpdateActionProps {
  status: EidosLiteUpdateStatus & {
    state: "available" | "downloading" | "downloaded"
  }
  label: string
  description: string
  onDownload(): void
  onRestart(): void
}

export function isSidebarUpdateVisible(
  status: EidosLiteUpdateStatus | null
): status is EidosLiteUpdateStatus & {
  state: "available" | "downloading" | "downloaded"
} {
  return (
    status?.state === "available" ||
    status?.state === "downloading" ||
    status?.state === "downloaded"
  )
}

export function SidebarUpdateAction({
  status,
  label,
  description,
  onDownload,
  onRestart,
}: SidebarUpdateActionProps) {
  const downloading = status.state === "downloading"
  const downloaded = status.state === "downloaded"

  return (
    <div
      className="sidebar-update-action"
      data-sidebar-update-state={status.state}
      aria-live="polite"
    >
      {downloading ? (
        <span
          className="sidebar-update-pill"
          role="progressbar"
          aria-label={description}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(status.progressPercent ?? 0)}
          title={description}
        >
          <LoaderCircle className="spin" aria-hidden="true" />
          <span>{label}</span>
        </span>
      ) : (
        <button
          type="button"
          className="sidebar-update-pill"
          onClick={downloaded ? onRestart : onDownload}
          aria-label={`${label}. ${description}`}
          title={description}
        >
          {downloaded ? (
            <RotateCcw aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          <span>{label}</span>
        </button>
      )}
    </div>
  )
}
