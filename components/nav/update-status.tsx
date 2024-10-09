import { useEffect } from "react"
import { Download, RefreshCw } from "lucide-react"

import { useUpdateStatus } from "@/hooks/use-updater"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export function UpdateStatusComponent() {
  const { updateStatus, updateInfo, checkForUpdates, quitAndInstall } =
    useUpdateStatus()

  useEffect(() => {
    checkForUpdates()
  }, [])

  const handleCheckForUpdates = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    checkForUpdates()
  }

  return (
    <>
      <DropdownMenuSeparator />
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
