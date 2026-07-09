"use client"

import {
  AlertCircle,
  ArrowDownCircle,
  CheckCircle,
  Download,
  RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { useUpdateStatus } from "@/apps/web-app/hooks/use-update-status"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export const SidebarUpdateStatus = () => {
  const { t } = useTranslation()
  const {
    updateStatus,
    updateInfo,
    updateProgress,
    checkForUpdates,
    quitAndInstall,
  } = useUpdateStatus()

  if (!isDesktopMode) {
    return null
  }

  const progressPercent = Math.round(updateProgress?.percent || 0)
  const updateAvailableLabel = updateInfo?.version
    ? t("nav.status.updateAvailable", { version: updateInfo.version })
    : t("settings.general.updateAvailable")

  const statusConfig = (() => {
    switch (updateStatus) {
      case "checking":
        return {
          label: t("nav.status.checkingForUpdates"),
          icon: <RefreshCw className="h-4 w-4 animate-spin" />,
          className: "text-muted-foreground",
          onClick: undefined,
        }
      case "available":
        return {
          label: updateAvailableLabel,
          icon: <ArrowDownCircle className="h-4 w-4" />,
          className: "text-primary hover:text-primary",
          onClick: undefined,
        }
      case "progress":
        return {
          label: `${t("nav.status.downloading")} ${progressPercent}%`,
          icon: <Download className="h-4 w-4" />,
          className: "text-primary hover:text-primary",
          onClick: undefined,
        }
      case "downloaded":
        return {
          label: t("nav.status.restartToInstall"),
          icon: <CheckCircle className="h-4 w-4" />,
          className: "text-primary hover:text-primary",
          onClick: quitAndInstall,
        }
      case "error":
        return {
          label: t("nav.status.updateError"),
          icon: <AlertCircle className="h-4 w-4" />,
          className: "text-destructive hover:text-destructive",
          onClick: checkForUpdates,
        }
      default:
        return null
    }
  })()

  if (!statusConfig) {
    return null
  }

  const isActionable = Boolean(statusConfig.onClick)

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            aria-disabled={!isActionable}
            aria-label={statusConfig.label}
            title={statusConfig.label}
            onClick={statusConfig.onClick}
            className={cn(
              "h-8 w-8 p-0 relative overflow-hidden",
              isActionable ? "cursor-pointer" : "cursor-default",
              statusConfig.className
            )}
          >
            {statusConfig.icon}
            {updateStatus === "progress" && (
              <span
                className="absolute inset-x-0 bottom-0 h-[2px] bg-primary/30"
                aria-hidden="true"
              >
                <span
                  className="block h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{statusConfig.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
