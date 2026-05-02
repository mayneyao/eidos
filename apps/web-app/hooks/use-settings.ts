import { useCallback } from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { type SettingsSection } from "@/components/settings/settings-events"

export const useSettings = () => {
  const { navigate } = useRouterAdapter()

  const openSettingsModal = useCallback(
    (section?: SettingsSection, _showSpaceSettings = true) => {
      const path = section ? `/settings/${section}` : "/settings"
      navigate(path, { target: "_blank" })
    },
    [navigate]
  )

  const closeSettingsModal = useCallback(() => {
    navigate(-1)
  }, [navigate])

  return {
    openSettingsModal,
    closeSettingsModal,
  }
}
