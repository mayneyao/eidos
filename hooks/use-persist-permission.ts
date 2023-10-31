import { useEffect, useState } from "react"

export const usePersistPermission = () => {
  const [isPersisted, setIsPersisted] = useState(false)
  useEffect(() => {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((isPersisted) => {
        setIsPersisted(isPersisted)
      })
    }
  }, [])

  const requestPersist = async () => {
    // https://web.dev/articles/persistent-storage#request_persistent_storage
    let permission
    if (Notification.permission === "granted") {
      permission = "granted"
    } else {
      permission = await Notification.requestPermission()
    }
    // If the user accepts, let's create a notification
    if (permission === "granted") {
      const persistent = await navigator.storage.persist()
      if (persistent) {
        new Notification("Persistent storage granted!")
        return true
      } else {
        return false
      }
    }
    return false
  }

  return {
    isPersisted,
    requestPersist,
  }
}
