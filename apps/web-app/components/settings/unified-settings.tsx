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

  return (
    <div className="flex flex-col lg:flex-row h-[85vh]">
      <SettingsSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        showSpaceSettings={showSpaceSettings}
      />
      <SettingsContent activeSection={activeSection} />
    </div>
  )
}
