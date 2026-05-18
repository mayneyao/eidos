import { useCallback, useEffect, useState } from "react"
import { isDesktopMode } from "@/lib/env"

export function useSecrets() {
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const loadSecrets = useCallback(async () => {
    setLoading(true)
    try {
      if (isDesktopMode && window.eidos?.credentials?.listSecrets) {
        const data = await window.eidos.credentials.listSecrets()
        setSecrets(data || {})
      } else {
        const localData = localStorage.getItem("eidos_secrets")
        if (localData) {
          setSecrets(JSON.parse(localData))
        } else {
          setSecrets({})
        }
      }
    } catch (e) {
      console.error("Failed to load secrets", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const setSecret = useCallback(
    async (key: string, value: string) => {
      try {
        if (isDesktopMode && window.eidos?.credentials?.setSecret) {
          await window.eidos.credentials.setSecret(key, value)
        } else {
          const localData = localStorage.getItem("eidos_secrets")
          const currentSecrets = localData ? JSON.parse(localData) : {}
          if (value) {
            currentSecrets[key] = value
          } else {
            delete currentSecrets[key]
          }
          localStorage.setItem("eidos_secrets", JSON.stringify(currentSecrets))
        }
        await loadSecrets()
      } catch (e) {
        console.error("Failed to set secret", e)
        throw e
      }
    },
    [loadSecrets]
  )

  const deleteSecret = useCallback(
    async (key: string) => {
      try {
        if (isDesktopMode && window.eidos?.credentials?.deleteSecret) {
          await window.eidos.credentials.deleteSecret(key)
        } else {
          const localData = localStorage.getItem("eidos_secrets")
          const currentSecrets = localData ? JSON.parse(localData) : {}
          delete currentSecrets[key]
          localStorage.setItem("eidos_secrets", JSON.stringify(currentSecrets))
        }
        await loadSecrets()
      } catch (e) {
        console.error("Failed to delete secret", e)
        throw e
      }
    },
    [loadSecrets]
  )

  useEffect(() => {
    loadSecrets()
  }, [loadSecrets])

  return {
    secrets,
    loading,
    setSecret,
    deleteSecret,
    refresh: loadSecrets,
  }
}
