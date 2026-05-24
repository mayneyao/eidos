import { useEffect, useState } from "react"

import { SettingsContent } from "./settings-content"
import { SettingsSidebar } from "./settings-sidebar"

import { type SettingsSection } from "./settings-events"

interface UnifiedSettingsProps {
  initialSection?: SettingsSection
  showSpaceSettings?: boolean
}

export function UnifiedSettings({
  initialSection = "general",
  showSpaceSettings = true,
}: UnifiedSettingsProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(initialSection)

  // Update active section when initialSection changes
  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  // Listen for navigation events from child components
  useEffect(() => {
    const handleNavigate = (event: CustomEvent<SettingsSection>) => {
      setActiveSection(event.detail)
    }

    window.addEventListener(
      "settings-navigate",
      handleNavigate as EventListener
    )
    return () => {
      window.removeEventListener(
        "settings-navigate",
        handleNavigate as EventListener
      )
    }
  }, [])

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        showSpaceSettings={showSpaceSettings}
      />
      <SettingsContent activeSection={activeSection} />
    </div>
  )
}
