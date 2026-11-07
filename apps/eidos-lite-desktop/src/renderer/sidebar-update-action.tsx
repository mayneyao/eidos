import { Download, LoaderCircle, RotateCcw } from "lucide-react"

import type { EidosLiteUpdateStatus } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

interface SidebarUpdateActionProps {
  status: EidosLiteUpdateStatus & {
    state: "available" | "downloading" | "downloaded"
  }
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
  onDownload,
  onRestart,
}: SidebarUpdateActionProps) {
  const { t } = useEidosLiteI18n()
  const downloading = status.state === "downloading"
  const downloaded = status.state === "downloaded"
  const progress =
    typeof status.progressPercent === "number" &&
    Number.isFinite(status.progressPercent)
      ? Math.round(Math.max(0, Math.min(100, status.progressPercent)))
      : undefined
  const label = downloading
    ? progress === undefined
      ? t("Downloading…")
      : t("Downloading {percent}%", { percent: progress })
    : downloaded
      ? t("Restart to update")
      : t("Download update")
  const description = downloading
    ? progress === undefined
      ? t("Downloading update…")
      : t("Downloading update… {percent}%", { percent: progress })
    : downloaded
      ? t("Version {version} is ready to install.", {
          version: status.version ?? "",
        })
      : t("Update {version} is available.", {
          version: status.version ?? "",
        })

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
          aria-valuenow={progress}
          title={description}
        >
          {progress !== undefined && progress > 0 ? (
            <span
              className="sidebar-update-progress-fill"
              style={{ width: `${progress}%` }}
              aria-hidden="true"
            />
          ) : null}
          <span className="sidebar-update-content">
            <LoaderCircle className="spin" aria-hidden="true" />
            {progress === undefined ? (
              <span>{label}</span>
            ) : (
              <span className="sidebar-update-label">
                <span className="sidebar-update-label-text">
                  {t("Downloading")}
                </span>{" "}
                <span className="sidebar-update-percent">{progress}%</span>
              </span>
            )}
          </span>
        </span>
      ) : (
        <button
          type="button"
          className="sidebar-update-pill"
          onClick={downloaded ? onRestart : onDownload}
          aria-label={`${label}. ${description}`}
          title={description}
        >
          <span className="sidebar-update-content">
            {downloaded ? (
              <RotateCcw aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
            <span>{label}</span>
          </span>
        </button>
      )}
    </div>
  )
}
