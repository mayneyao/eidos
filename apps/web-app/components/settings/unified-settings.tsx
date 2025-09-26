import { useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingsContent } from "./settings-content"
import { SettingsSidebar } from "./settings-sidebar"

type SettingsSection =
  | "space-general"
  | "space-document"
  | "general"
  | "ai"
  | "api"
  | "key-store"
  | "storage"
  | "sync"
  | "security"

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
