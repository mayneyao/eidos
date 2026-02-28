import {
  AlertCircle,
  ArrowDownCircle,
  CheckCircle,
  Download,
  RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useUpdateStatus } from "@/apps/web-app/hooks/use-update-status"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function UpdateStatusComponent() {
  const { t } = useTranslation()
  const {
    updateStatus,
    updateInfo,
    updateProgress,
    checkForUpdates,
    quitAndInstall,
  } = useUpdateStatus()

  const handleCheckForUpdates = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    checkForUpdates()
  }

  const handleQuitAndInstall = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    quitAndInstall()
  }

  if (!isDesktopMode) {
    return null
  }

  return (
    <>
      {updateStatus === "available" && (
        <DropdownMenuItem disabled className="flex items-center">
          <ArrowDownCircle className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="whitespace-nowrap">
            {t("nav.status.updateAvailable", { version: updateInfo?.version })}
          </span>
        </DropdownMenuItem>
      )}
      {updateStatus === "progress" && (
        <DropdownMenuItem disabled className="relative overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-primary/20"
            style={{ width: `${Math.round(updateProgress?.percent || 0)}%` }}
          />
          <div className="flex items-center relative z-10">
            <Download className="mr-2 h-4 w-4 flex-shrink-0" />
            <span className="whitespace-nowrap">
              {t("nav.status.downloading")}
            </span>
          </div>
        </DropdownMenuItem>
      )}
      {updateStatus === "downloaded" && (
        <DropdownMenuItem
          onSelect={handleQuitAndInstall}
          className="flex items-center"
        >
          <CheckCircle className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="whitespace-nowrap">
            {t("nav.status.restartToInstall")}
          </span>
        </DropdownMenuItem>
      )}
      {updateStatus === "checking" && (
        <DropdownMenuItem disabled className="flex items-center">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin flex-shrink-0" />
          <span className="whitespace-nowrap">
            {t("nav.status.checkingForUpdates")}
          </span>
        </DropdownMenuItem>
      )}
      {updateStatus === "not-available" && (
        <DropdownMenuItem disabled className="flex items-center">
          <span className="whitespace-nowrap">
            {t("nav.status.noUpdatesAvailable")}
          </span>
        </DropdownMenuItem>
      )}
      {updateStatus === "error" && (
        <DropdownMenuItem disabled className="flex items-center">
          <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="whitespace-nowrap">
            {t("nav.status.updateError")}
          </span>
        </DropdownMenuItem>
      )}
      {updateStatus !== "checking" &&
        updateStatus !== "progress" &&
        updateStatus !== "downloaded" &&
        updateStatus !== "available" && (
          <DropdownMenuItem
            onSelect={handleCheckForUpdates}
            className="flex items-center"
          >
            <RefreshCw className="mr-2 h-4 w-4 flex-shrink-0" />
            <span className="whitespace-nowrap">
              {t("nav.status.checkForUpdates")}
            </span>
          </DropdownMenuItem>
        )}
    </>
  )
}
