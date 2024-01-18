import { useEffect, useState } from "react"
import {
  backupSpace,
  getLastSyncStatus,
  pullSpaceFromBackup,
} from "@/worker/service-worker/backup"

import { useToast } from "@/components/ui/use-toast"

export const useBackup = () => {
  const [lastSyncStatus, setLastSyncStatus] = useState<Record<string, string>>(
    {}
  )
  const { toast } = useToast()

  const updateLastSyncStatus = async () => {
    const lastSyncStatus = await getLastSyncStatus()
    setLastSyncStatus(lastSyncStatus)
  }

  useEffect(() => {
    updateLastSyncStatus()
  }, [])

  const backup = async (space: string) => {
    await backupSpace(space)
    toast({
      title: "Backup successful",
      description: `Backup for ${space} was successful`,
    })
    await updateLastSyncStatus()
  }
  const pull = async (space: string) => {
    await pullSpaceFromBackup(space)
  }

  return {
    lastSyncStatus,
    backup,
    pull,
  }
}
