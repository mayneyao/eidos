import { useTranslation } from "react-i18next"

import { GlobalAISettings } from "./global/global-ai-settings"
import { GlobalAPISettings } from "./global/global-api-settings"
import { GlobalGeneralSettings } from "./global/global-general-settings"
import { GlobalSecuritySettings } from "./global/global-security-settings"
import { GlobalStorageSettings } from "./global/global-storage-settings"
import { GlobalSyncSettings } from "./global/global-sync-settings"
import { DocumentSettings } from "./space/document-settings"
import { ExtensionSettings } from "./space/extension-settings"
import { FileHandlersSettings } from "./space/file-handlers-settings"
import { GeneralSettings } from "./space/general-settings"
import { MountSettings } from "./space/mount-settings"
import { SpaceSyncSettings } from "./space/space-sync-settings"
import { NewTabSettings } from "./space/new-tab-settings"

type SettingsSection =
  | "space-general"
  | "space-document"
  | "space-mounts"
  | "space-file-handlers"
  | "space-extensions"
  | "space-newtab"
  | "space-sync"
  | "general"
  | "ai"
  | "api"
  | "storage"
  | "sync"
  | "security"

interface SettingsContentProps {
  activeSection: SettingsSection
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
  const { t } = useTranslation()

  const getSectionTitle = (section: SettingsSection) => {
    switch (section) {
      case "space-general":
        return t("space.settings.general")
      case "space-document":
        return t("space.settings.document")
      case "space-mounts":
        return t("space.settings.mounts")
      case "space-file-handlers":
        return "File Handlers"
      case "space-extensions":
        return "Extensions"
      case "space-newtab":
        return "New Tab"
      case "space-sync":
        return t("space.settings.sync")
      case "general":
        return t("settings.general")
      case "ai":
        return t("settings.ai")
      case "api":
        return t("settings.api")
      case "storage":
        return t("settings.storage")
      case "sync":
        return t("settings.sync")
      case "security":
        return t("settings.security")
      default:
        return t("space.settings.title")
    }
  }

  const renderContent = () => {
    switch (activeSection) {
      case "space-general":
        return <GeneralSettings />
      case "space-document":
        return <DocumentSettings />
      case "space-mounts":
        return <MountSettings />
      case "space-file-handlers":
        return <FileHandlersSettings />
      case "space-extensions":
        return <ExtensionSettings />
      case "space-newtab":
        return <NewTabSettings />
      case "space-sync":
        return <SpaceSyncSettings />
      case "general":
        return <GlobalGeneralSettings />
      case "ai":
        return <GlobalAISettings />
      case "api":
        return <GlobalAPISettings />
      case "storage":
        return <GlobalStorageSettings />
      case "sync":
        return <GlobalSyncSettings />
      case "security":
        return <GlobalSecuritySettings />
      default:
        return null
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 lg:p-6 overflow-y-auto flex-1">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl lg:text-2xl font-semibold mb-4 lg:mb-6">
            {getSectionTitle(activeSection)}
          </h2>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
