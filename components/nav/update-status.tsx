import { useEffect } from "react"
import { Download, RefreshCw } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { useUpdateStatus } from "@/hooks/use-update-status"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function UpdateStatusComponent() {
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
          <span>Update to v{updateInfo?.version}</span>
        </DropdownMenuItem>
      )}
      {updateStatus === "not-available" && (
        <DropdownMenuItem disabled>
          <span>No updates available</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={handleCheckForUpdates}>
        <RefreshCw className="mr-2 h-4 w-4" />
        <span>Check for updates</span>
      </DropdownMenuItem>
    </>
  )
}
