import { BookOpenText } from "lucide-react"
import { useTranslation } from "react-i18next"

import { GlobalAccountSettings } from "./global/global-account-settings"
import { GlobalAISettings } from "./global/global-ai-settings"
import { GlobalAPISettings } from "./global/global-api-settings"
import { GlobalGeneralSettings } from "./global/global-general-settings"
import { GlobalSecuritySettings } from "./global/global-security-settings"
import { GlobalStorageSettings } from "./global/global-storage-settings"
import { GlobalSyncSettings } from "./global/global-sync-settings"
import { DocumentSettings } from "./space/document-settings"
import { ExtensionSettings } from "./space/extension-settings"

import { GeneralSettings } from "./space/general-settings"
import { MountSettings } from "./space/mount-settings"

import { NewTabSettings } from "./space/new-tab-settings"
import { RelaySettings } from "./space/relay-settings"
import { ThemeSettings } from "./space/theme-settings"

type SettingsSection =
  | "space-general"
  | "space-document"
  | "space-mounts"
  | "space-extensions"
  | "space-newtab"
  | "space-relay"
  | "space-theme"
  | "general"
  | "account"
  | "ai"
  | "api"
  | "storage"
  | "sync"
  | "security"

interface SettingsContentProps {
  activeSection: SettingsSection
}

export function SettingsContent({ activeSection }: SettingsContentProps) {
  const { t, i18n } = useTranslation()

  const getDocsUrl = (path: string) => {
    const baseUrl = "https://docs.eidos.space"
    const isChinese = i18n.language.startsWith("zh")
    return isChinese ? `${baseUrl}/zh-cn${path}` : `${baseUrl}${path}`
  }

  const getSectionTitle = (section: SettingsSection) => {
    switch (section) {
      case "space-general":
        return t("space.settings.general")
      case "space-document":
        return t("space.settings.document")
      case "space-mounts":
        return t("space.settings.mounts")

      case "space-extensions":
        return "Extensions"
      case "space-newtab":
        return "New Tab"

      case "space-relay":
        return t("space.settings.relay")
      case "space-theme":
        return t("space.settings.theme", "Theme")
      case "general":
        return t("settings.general")
      case "account":
        return t("settings.account.title", "Account")
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

      case "space-extensions":
        return <ExtensionSettings />
      case "space-newtab":
        return <NewTabSettings />

      case "space-relay":
        return <RelaySettings />
      case "space-theme":
        return <ThemeSettings />
      case "general":
        return <GlobalGeneralSettings />
      case "account":
        return <GlobalAccountSettings />
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
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="p-4 lg:p-6 overflow-y-auto flex-1">
        <div className="max-w-2xl mx-auto w-full">
          <h2 className="text-xl lg:text-2xl font-semibold mb-4 lg:mb-6 flex items-center gap-2">
            {getSectionTitle(activeSection)}
            {activeSection === "space-relay" && (
              <a
                href={getDocsUrl("/services/relay/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.relay.docsLink")}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpenText className="h-5 w-5" />
              </a>
            )}
            {activeSection === "sync" && (
              <a
                href={getDocsUrl("/services/sync/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("settings.sync.docsLink")}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpenText className="h-5 w-5" />
              </a>
            )}
            {activeSection === "space-extensions" && (
              <a
                href={getDocsUrl("/extensions/eject/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.extensions.docsLink")}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpenText className="h-5 w-5" />
              </a>
            )}
            {activeSection === "space-newtab" && (
              <a
                href={getDocsUrl("/how-to/customize-new-tab/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.newtab.docsLink")}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpenText className="h-5 w-5" />
              </a>
            )}
            {activeSection === "space-mounts" && (
              <a
                href={getDocsUrl("/concepts/file/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.mounts.docsLink")}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpenText className="h-5 w-5" />
              </a>
            )}
            {activeSection === "space-theme" && (
              <a
                href={getDocsUrl("/how-to/customize-theme/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t(
                  "space.settings.theme.docsLink",
                  "Theme documentation"
                )}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpenText className="h-5 w-5" />
              </a>
            )}
          </h2>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
