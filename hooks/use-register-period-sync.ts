import { useEffect } from "react"
import {
  backupAllSpaceData,
  getConfigFromOpfs,
} from "@/worker/service-worker/backup"

import { FileSystemType } from "@/lib/storage/eidos-file-system"
import { getIndexedDBValue } from "@/lib/storage/indexeddb"

export const registerPeriodicSync = async () => {
  const status = await navigator.permissions.query({
    name: "periodic-background-sync",
  } as any)
  const config = await getConfigFromOpfs()
  if (status.state === "granted") {
    const registration = (await navigator.serviceWorker.ready) as any
    if ("periodicSync" in registration) {
      try {
        if (config.autoSaveGap == 0) {
          await registration.periodicSync.unregister("backup")
          console.log("Periodic background sync unregistered!", "[backup]")
          return "unregistered"
        }
        await registration.periodicSync.register("backup", {
          minInterval: config.autoSaveGap * 60 * 1000,
        })
        console.log("Periodic background sync registered!", "[backup]")
        return "registered"
      } catch (error) {
        // Periodic background sync cannot be used.
      }
    }
  } else {
    // Periodic background sync cannot be used.
  }
}

export const registerSpaceDatabaseSync = async () => {
  const status = await navigator.permissions.query({
    name: "periodic-background-sync",
  } as any)
  if (status.state === "granted") {
    const registration = (await navigator.serviceWorker.ready) as any
    if ("periodicSync" in registration) {
      try {
        const fsType = await getIndexedDBValue<FileSystemType>("kv", "fs")
        const autoBackupGap = await getIndexedDBValue<number>(
          "kv",
          "autoBackupGap"
        )
        if (fsType === FileSystemType.OPFS || autoBackupGap == 0) {
          await registration.periodicSync.unregister("backup-db")
          console.log("Periodic background sync unregistered!", "[backup-db]")
          return "unregistered"
        }
        await registration.periodicSync.register("backup-db", {
          minInterval: autoBackupGap * 1000 * 60,
        })
        console.log("Periodic background sync registered!", "[backup-db]")
        return "registered"
      } catch (error) {
        // Periodic background sync cannot be used.
      }
    }
  } else {
    // Periodic background sync cannot be used.
  }
}

export const _registerSpaceDatabaseSync = async () => {
  const fsType = await getIndexedDBValue<FileSystemType>("kv", "fs")
  const autoBackupGap = await getIndexedDBValue<number>("kv", "autoBackupGap")
  if (
    !fsType ||
    !autoBackupGap ||
    fsType === FileSystemType.OPFS ||
    autoBackupGap == 0
  ) {
    return
  }
  console.log("register auto backup")
  return setInterval(async () => {
    await backupAllSpaceData()
  }, autoBackupGap * 1000 * 60)
}

export const useRegisterPeriodicSync = () => {
  useEffect(() => {
    // registerPeriodicSync()
    // registerSpaceDatabaseSync()
    // use setInterval instead of periodic background sync for now, it's more reliable to keep the data safe
    let timer: NodeJS.Timeout | null = null
    ;(async () => {
      const _timer = await _registerSpaceDatabaseSync()
      if (_timer) {
        timer = _timer
      }
    })()
    return () => {
      if (timer) {
        clearInterval(timer)
        console.log("unregister auto backup")
      }
    }
  }, [])
}
