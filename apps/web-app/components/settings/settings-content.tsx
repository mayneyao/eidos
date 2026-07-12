import { BookOpenText } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { type SettingsSection } from "./settings-events"
import { GlobalAccountSettings } from "./global/global-account-settings"
import { GlobalAISettings } from "./global/global-ai-settings"
import { GlobalBrowserSettings } from "./global/global-browser-settings"
import { GlobalGeneralSettings } from "./global/global-general-settings"
import { GlobalSecuritySettings } from "./global/global-security-settings"
import { GlobalStorageSettings } from "./global/global-storage-settings"
import { GlobalSyncSettings } from "./global/global-sync-settings"
import { DocumentSettings } from "./space/document-settings"
import { ExtensionSettings } from "./space/extension-settings"
import { FileSpaceFilesSettings } from "./space/file-space-files-settings"
import { FileSpaceIndexesSettings } from "./space/file-space-indexes-settings"
import { FileSpaceVersioningSettings } from "./space/file-space-versioning-settings"
import { LegacySpaceMigrationSettings } from "./space/legacy-space-migration-settings"
import { GlobalSecretsSettings } from "./global/global-secrets-settings"

import { GeneralSettings } from "./space/general-settings"
import { MountSettings } from "./space/mount-settings"

import { TabsSettings } from "./space/tab-settings"
import { RelaySettings } from "./space/relay-settings"
import { ThemeSettings } from "./space/theme-settings"

const FILE_SPACE_SECTIONS = new Set<SettingsSection>([
  "space-general",
  "space-files",
  "space-versioning",
  "space-indexes",
])

export function SettingsContent() {
  const { section } = useParams<{ section?: string }>()
  const requestedSection: SettingsSection =
    (section as SettingsSection) || "general"
  const { currentSpace } = useCurrentSpace()
  const activeSection: SettingsSection =
    currentSpace?.mode === "file" &&
    requestedSection.startsWith("space-") &&
    !FILE_SPACE_SECTIONS.has(requestedSection)
      ? "space-general"
      : requestedSection
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
      case "space-files":
        return t("space.settings.fileSpace.files.title", "Files & Obsidian")
      case "space-versioning":
        return t("space.settings.fileSpace.versioning.title", "Versioning")
      case "space-indexes":
        return t("space.settings.fileSpace.indexes.title", "Indexes")
      case "space-migration":
        return t("space.settings.migration.title", "Migration")
      case "space-document":
        return t("space.settings.document")
      case "space-mounts":
        return t("space.settings.mounts")

      case "space-extensions":
        return "Extensions"
      case "space-tabs":
        return t("space.settings.tabs.title", "Tabs")

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
      case "storage":
        return t("settings.storage")
      case "sync":
        return t("settings.sync")
      case "security":
        return t("settings.security")
      case "browser":
        return t("settings.browser", "Browser")
      case "secrets":
        return t("settings.secrets.title", "Secrets Store")
      default:
        return t("space.settings.title")
    }
  }

  const renderContent = () => {
    switch (activeSection) {
      case "space-general":
        return <GeneralSettings />
      case "space-files":
        return <FileSpaceFilesSettings />
      case "space-versioning":
        return <FileSpaceVersioningSettings />
      case "space-indexes":
        return <FileSpaceIndexesSettings />
      case "space-migration":
        return <LegacySpaceMigrationSettings />
      case "space-document":
        return <DocumentSettings />
      case "space-mounts":
        return <MountSettings />

      case "space-extensions":
        return <ExtensionSettings />
      case "space-tabs":
        return <TabsSettings />

      case "space-relay":
        return <RelaySettings onCloseSettings={() => window.history.back()} />
      case "space-theme":
        return <ThemeSettings />
      case "general":
        return <GlobalGeneralSettings />
      case "account":
        return <GlobalAccountSettings />
      case "ai":
        return <GlobalAISettings />
      case "storage":
        return <GlobalStorageSettings />
      case "sync":
        return <GlobalSyncSettings />
      case "security":
        return <GlobalSecuritySettings />
      case "browser":
        return <GlobalBrowserSettings />
      case "secrets":
        return <GlobalSecretsSettings />
      default:
        return null
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-14">
          <h1 className="mb-10 flex items-center gap-2 text-[28px] font-semibold tracking-[-0.025em] text-foreground">
            {getSectionTitle(activeSection)}
            {activeSection === "space-relay" && (
              <a
                href={getDocsUrl("/services/relay/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.relay.docsLink")}
                className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <BookOpenText className="h-4 w-4" />
              </a>
            )}
            {activeSection === "sync" && (
              <a
                href={getDocsUrl("/services/sync/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("settings.sync.docsLink")}
                className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <BookOpenText className="h-4 w-4" />
              </a>
            )}
            {activeSection === "space-extensions" && (
              <a
                href={getDocsUrl("/extensions/eject/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.extensions.docsLink")}
                className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <BookOpenText className="h-4 w-4" />
              </a>
            )}
            {activeSection === "space-tabs" && (
              <a
                href={getDocsUrl("/how-to/customize-new-tab/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.tabs.newtab.docsLink")}
                className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <BookOpenText className="h-4 w-4" />
              </a>
            )}
            {activeSection === "space-mounts" && (
              <a
                href={getDocsUrl("/concepts/file/")}
                target="_blank"
                rel="noopener noreferrer"
                title={t("space.settings.mounts.docsLink")}
                className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <BookOpenText className="h-4 w-4" />
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
                className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <BookOpenText className="h-4 w-4" />
              </a>
            )}
          </h1>
          <div
            data-settings-content-body="true"
            className="[&>div>div:has(>h3)]:pb-2 [&>div>div:has(>h3)]:pt-5 [&>div>div:has(>h3):first-child]:pt-0 [&>div>div:has(>h3)_h3]:text-[15px] [&>div>div:has(>h3)_h3]:font-medium [&>div>hr]:hidden [&>div>hr+div]:mb-7 [&>div>hr+div]:rounded-xl [&>div>hr+div]:border [&>div>hr+div]:border-border/80 [&>div>hr+div]:bg-card/30 [&>div>hr+div]:px-5 [&>div>hr+div]:!py-4 [&>div[data-settings-row-groups]>hr+div]:!py-0"
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </main>
  )
}
