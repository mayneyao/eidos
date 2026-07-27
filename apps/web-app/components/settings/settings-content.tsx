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
import { FileSpaceBaseSettings } from "./space/file-space-eidos-file-settings"
import { FileSpaceIndexesSettings } from "./space/file-space-indexes-settings"
import { FileSpaceVersioningSettings } from "./space/file-space-versioning-settings"
import { LegacySpaceMigrationSettings } from "./space/legacy-space-migration-settings"
import { GlobalSecretsSettings } from "./global/global-secrets-settings"

import { GeneralSettings } from "./space/general-settings"
import { MountSettings } from "./space/mount-settings"

import { TabsSettings } from "./space/tab-settings"
import { RelaySettings } from "./space/relay-settings"
import { ThemeSettings } from "./space/theme-settings"
import { SETTINGS_CONTENT_BODY_CLASS_NAME } from "./settings-surface"

const FILE_SPACE_SECTIONS = new Set<SettingsSection>([
  "space-general",
  "space-files",
  "space-eidos-file",
  "space-versioning",
  "space-indexes",
  "space-extensions",
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

  const docsBySection: Partial<
    Record<SettingsSection, { path: string; title: string }>
  > = {
    "space-relay": {
      path: "/services/relay/",
      title: t("space.settings.relay.docsLink"),
    },
    sync: {
      path: "/services/sync/",
      title: t("settings.sync.docsLink"),
    },
    "space-extensions": {
      path: "/extensions/eject/",
      title: t("space.settings.extensions.docsLink"),
    },
    "space-tabs": {
      path: "/how-to/customize-new-tab/",
      title: t("space.settings.tabs.newtab.docsLink"),
    },
    "space-mounts": {
      path: "/concepts/file/",
      title: t("space.settings.mounts.docsLink"),
    },
    "space-theme": {
      path: "/how-to/customize-theme/",
      title: t("space.settings.theme.docsLink", "Theme documentation"),
    },
  }
  const sectionDocs = docsBySection[activeSection]

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
      case "space-eidos-file":
        return t("space.settings.fileSpace.eidosFile.title", "Eidos File")
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
        return t("settings.extensions.title", "Extensions")
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
      case "space-eidos-file":
        return <FileSpaceBaseSettings />
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
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-7 sm:px-7 sm:pt-9 lg:px-10 lg:pb-20 lg:pt-12">
          <header className="mb-8 flex min-h-12 items-start border-b border-border/70 pb-5 sm:items-center">
            <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <span className="truncate">{getSectionTitle(activeSection)}</span>
              {sectionDocs ? (
                <a
                  href={getDocsUrl(sectionDocs.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={sectionDocs.title}
                  aria-label={sectionDocs.title}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <BookOpenText className="size-4" />
                </a>
              ) : null}
            </h1>
          </header>
          <div
            data-settings-content-body="true"
            className={SETTINGS_CONTENT_BODY_CLASS_NAME}
          >
            {renderContent()}
          </div>
        </div>
      </div>
    </main>
  )
}
