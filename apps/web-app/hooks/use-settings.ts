import { useCallback } from "react"
import {
  openSettings,
  closeSettings,
  type SettingsSection,
} from "@/components/settings/settings-events"

export const useSettings = () => {
  const openSettingsModal = useCallback(
    (section?: SettingsSection, showSpaceSettings = true) => {
      openSettings({ section, showSpaceSettings })
    },
    []
  )

  const closeSettingsModal = useCallback(() => {
    closeSettings()
  }, [])

  return {
    openSettingsModal,
    closeSettingsModal,
  }
}
