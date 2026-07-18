import { useCallback, useEffect, useState } from "react"

import { PwaUpdatePrompt } from "../components/pwa-update-prompt"
import { useRegisterSW } from "./pwa-register"

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000

export function PwaUpdateController() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    needRefresh: [updateAvailable, setUpdateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_scriptUrl, nextRegistration) => {
      setRegistration(nextRegistration ?? null)
    },
    onRegisterError: (reason) => {
      console.warn(
        "Unable to register the SQLite Viewer service worker",
        reason
      )
    },
  })

  useEffect(() => {
    if (!registration) return

    let checking = false
    const checkForUpdate = async () => {
      if (checking || !navigator.onLine) return
      checking = true
      try {
        await registration.update()
      } catch (reason) {
        console.warn("Unable to check for a SQLite Viewer update", reason)
      } finally {
        checking = false
      }
    }
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }
    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL)
    window.addEventListener("focus", checkForUpdate)
    window.addEventListener("online", checkForUpdate)
    document.addEventListener("visibilitychange", checkWhenVisible)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", checkForUpdate)
      window.removeEventListener("online", checkForUpdate)
      document.removeEventListener("visibilitychange", checkWhenVisible)
    }
  }, [registration])

  const applyUpdate = useCallback(async () => {
    setUpdating(true)
    setError(null)
    try {
      await updateServiceWorker(true)
    } catch (reason) {
      console.warn("Unable to activate the SQLite Viewer update", reason)
      setError(
        "The update could not start. Check your connection and try again."
      )
      setUpdating(false)
    }
  }, [updateServiceWorker])

  return (
    <PwaUpdatePrompt
      error={error}
      open={updateAvailable}
      updating={updating}
      onDismiss={() => {
        setUpdateAvailable(false)
        setError(null)
      }}
      onUpdate={() => void applyUpdate()}
    />
  )
}
