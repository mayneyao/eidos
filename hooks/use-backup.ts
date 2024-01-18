import { useEffect, useState } from "react"
import { getLastSyncStatus } from "@/worker/service-worker/backup"

import { useToast } from "@/components/ui/use-toast"

import { useCurrentPathInfo } from "./use-current-pathinfo"

interface SyncManager {
  getTags(): Promise<string[]>
  register(tag: string): Promise<void>
}

declare global {
  interface ServiceWorkerRegistration {
    readonly sync: SyncManager
  }

  interface SyncEvent extends ExtendableEvent {
    readonly lastChance: boolean
    readonly tag: string
  }

  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent
  }
}

async function triggerSync(tagName: string) {
  await fetch(`/${tagName}`)
  // if (!("Notification" in window)) {
  // } else if (Notification.permission === "granted") {
  //   await fetch(`/${tagName}`)
  // } else if (Notification.permission !== "denied") {
  //   const permission = await Notification.requestPermission()
  //   // If the user accepts, let's create a notification
  //   if (permission === "granted") {
  //     await fetch(`/${tagName}`)
  //   }
  // }
}

export const useBackup = () => {
  const [lastSyncStatus, setLastSyncStatus] = useState<Record<string, string>>(
    {}
  )
  const { toast } = useToast()
  const { space: currentSpace } = useCurrentPathInfo()

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      // backup-result
      const { type, data } = event.data
      if (type === "backup-result") {
        await updateLastSyncStatus()
        const { space, type } = data
        if (type === "push-done") {
          toast({
            title: `Backup ${space} to Github done`,
          })
        } else if (type === "pull-done") {
          if (space === currentSpace) {
            toast({
              title: `Pull ${space} from Github done`,
            })
            window.location.reload()
          }
        }
      }
    }

    navigator.serviceWorker.addEventListener("message", handler)
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler)
    }
  }, [currentSpace, toast])

  const updateLastSyncStatus = async () => {
    const lastSyncStatus = await getLastSyncStatus()
    setLastSyncStatus(lastSyncStatus)
  }

  useEffect(() => {
    updateLastSyncStatus()
  }, [])

  const push = async (space: string) => {
    await triggerSync("backup-push")
  }

  const pull = async (space: string) => {
    await triggerSync("backup-pull")
  }

  return {
    lastSyncStatus,
    push,
    pull,
  }
}
