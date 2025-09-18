import { useTranslation } from "react-i18next"

import { DocumentSettings } from "./document-settings"
import { GeneralSettings } from "./general-settings"

type SettingsSection = "general" | "document"

interface SettingsContentProps {
  activeSection: SettingsSection
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
  const { t } = useTranslation()

  const getSectionTitle = (section: SettingsSection) => {
    switch (section) {
      case "general":
        return t("space.settings.general")
      case "document":
        return t("space.settings.document")
      default:
        return t("space.settings.title")
    }
  }

  const renderContent = () => {
    switch (activeSection) {
      case "general":
        return <GeneralSettings />

      case "document":
        return <DocumentSettings />

      default:
        return null
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 overflow-y-auto flex-1">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold">
            {getSectionTitle(activeSection)}
          </h2>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
