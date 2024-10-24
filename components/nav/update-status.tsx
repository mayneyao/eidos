import { useEffect } from "react"
import { Download, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useUpdateStatus } from "@/hooks/use-update-status"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function UpdateStatusComponent() {
  const { t } = useTranslation()
  const { updateStatus, updateInfo, checkForUpdates, quitAndInstall } =
    useUpdateStatus()

  useEffect(() => {
    if (isDesktopMode) {
      checkForUpdates()
    }
  }, [])

  const handleCheckForUpdates = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    checkForUpdates()
  }

  if (!isDesktopMode) {
    return null
  }

  return (
    <>
      {updateStatus === "available" && (
        <DropdownMenuItem onSelect={quitAndInstall}>
          <Download className="mr-2 h-4 w-4" />
          <span>{t('nav.status.updateAvailable', { version: updateInfo?.version })}</span>
        </DropdownMenuItem>
      )}
      {updateStatus === "not-available" && (
        <DropdownMenuItem disabled>
          <span>{t('nav.status.noUpdatesAvailable')}</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={handleCheckForUpdates}>
        <RefreshCw className="mr-2 h-4 w-4" />
        <span>{t('nav.status.checkForUpdates')}</span>
      </DropdownMenuItem>
    </>
  )
}
