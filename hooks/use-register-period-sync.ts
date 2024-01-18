import { useEffect } from "react"
import { getConfigFromOpfs } from "@/worker/service-worker/backup"

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
        const r = await registration.periodicSync.register("backup", {
          minInterval: config.autoSaveGap * 1000,
        })
        console.log("Periodic background sync registered!", r)
        return "registered"
      } catch (error) {
        // Periodic background sync cannot be used.
      }
    }
  } else {
    // Periodic background sync cannot be used.
  }
}

export const useRegisterPeriodicSync = () => {
  useEffect(() => {
    registerPeriodicSync()
  }, [])
}
