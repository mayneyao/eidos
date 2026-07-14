import {
  ArrowLeft,
  Bot,
  Cloud,
  DatabaseZap,
  FileText,
  Files,
  Folder,
  FolderOutput,
  GitBranch,
  Network,
  Info,
  Package,
  Paintbrush,
  Settings as SettingsIcon,
  LayoutTemplate,
  Table2,
  User,
  Globe,
  Key,
  Search,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { useState, type ComponentType, type CSSProperties } from "react"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { isMacDesktop } from "@/lib/web/helper"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { type SettingsSection } from "./settings-events"
import { resolveBackToAppTarget } from "./settings-navigation"

interface SettingsItem {
  id: SettingsSection
  title: string
  icon: ComponentType<{ className?: string }>
  disabled?: boolean
  isBeta?: boolean
  category: "space" | "global"
  availability?: "all" | "file" | "database"
}

interface SettingsSidebarProps {
  showSpaceSettings?: boolean
}

const FILE_SPACE_SECTIONS = new Set<SettingsSection>([
  "space-general",
  "space-files",
  "space-base",
  "space-versioning",
  "space-indexes",
])

export function SettingsSidebar({
  showSpaceSettings = true,
}: SettingsSidebarProps) {
  const { t } = useTranslation()
  const { navigate, location } = useRouterAdapter()
  const [query, setQuery] = useState("")

  // Parse section from URL: /settings/:section
  const pathParts = location.pathname.split("/").filter(Boolean)
  const requestedSection: SettingsSection =
    (pathParts[1] as SettingsSection) || "general"
  const { currentSpace: spaceInfo } = useCurrentSpace()
  const activeSection: SettingsSection =
    spaceInfo?.mode === "file" &&
    requestedSection.startsWith("space-") &&
    !FILE_SPACE_SECTIONS.has(requestedSection)
      ? "space-general"
      : requestedSection
  const tabs = useTabStore((state) => state.tabs)
  const panels = useTabStore((state) => state.panels)
  const activePanelId = useTabStore((state) => state.activePanelId)
  const activeTabId = useTabStore((state) => state.getActiveTabId())
  const history = useTabStore((state) => state.history)
  const setActiveTab = useTabStore((state) => state.setActiveTab)
  const goInTabHistory = useTabStore((state) => state.goInTabHistory)

  const handleSectionChange = (id: SettingsSection) => {
    navigate(`/settings/${id}`, { replace: true })
  }

  const settingsSections: SettingsItem[] = [
    // Space Settings
    {
      id: "space-general",
      title: t("space.settings.general"),
      icon: Info,
      category: "space",
    },
    {
      id: "space-files",
      title: t("space.settings.fileSpace.files.title", "Files & Obsidian"),
      icon: Files,
      category: "space",
      availability: "file",
    },
    {
      id: "space-base",
      title: t("space.settings.fileSpace.base.title", "Base"),
      icon: Table2,
      category: "space",
      availability: "file",
    },
    {
      id: "space-versioning",
      title: t("space.settings.fileSpace.versioning.title", "Versioning"),
      icon: GitBranch,
      category: "space",
      availability: "file",
    },
    {
      id: "space-indexes",
      title: t("space.settings.fileSpace.indexes.title", "Indexes"),
      icon: DatabaseZap,
      category: "space",
      availability: "file",
    },
    {
      id: "space-migration",
      title: t("space.settings.migration.title", "Migration"),
      icon: FolderOutput,
      category: "space",
      availability: "database",
      disabled: !isDesktopMode,
    },
    {
      id: "space-extensions",
      title: "Extensions",
      icon: Package,
      category: "space",
      availability: "database",
    },
    {
      id: "space-tabs",
      title: t("space.settings.tabs.title", "Tabs"),
      icon: LayoutTemplate,
      category: "space",
      availability: "database",
    },
    {
      id: "space-document",
      title: t("space.settings.document"),
      icon: FileText,
      category: "space",
      availability: "database",
    },
    {
      id: "space-mounts",
      title: t("space.settings.mounts"),
      icon: Folder,
      category: "space",
      availability: "database",
    },
    {
      id: "space-relay",
      title: t("space.settings.relay"),
      icon: Network,
      isBeta: true,
      category: "space",
      availability: "database",
    },
    {
      id: "space-theme",
      title: t("space.settings.theme", "Theme"),
      icon: Paintbrush,
      category: "space",
      availability: "database",
    },

    // Global Settings
    {
      id: "general",
      title: t("settings.general"),
      icon: SettingsIcon,
      category: "global",
    },
    {
      id: "account",
      title: t("settings.account.title", "Account"),
      icon: User,
      category: "global",
    },
    {
      id: "ai",
      title: t("settings.ai"),
      icon: Bot,
      category: "global",
    },
    {
      id: "sync",
      title: t("settings.sync"),
      icon: Cloud,
      disabled: !isDesktopMode,
      isBeta: true,
      category: "global",
    },
    {
      id: "browser",
      title: t("settings.browser", "Browser"),
      icon: Globe,
      isBeta: true,
      category: "global",
    },
    {
      id: "secrets",
      title: t("settings.secrets", "Secrets"),
      icon: Key,
      category: "global",
    },
  ]

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleSections = settingsSections.filter(
    (section) =>
      !normalizedQuery ||
      section.title.toLocaleLowerCase().includes(normalizedQuery)
  )
  const spaceSections = visibleSections.filter(
    (section) =>
      section.category === "space" &&
      (section.availability === undefined ||
        section.availability === "all" ||
        (spaceInfo?.mode === "file"
          ? section.availability === "file"
          : section.availability === "database"))
  )
  const globalSections = visibleSections.filter(
    (section) => section.category === "global"
  )

  const handleBackToApp = () => {
    const target = resolveBackToAppTarget({
      tabs,
      panels,
      activePanelId,
      activeTabId,
      history,
    })

    if (target.type === "history") {
      goInTabHistory(target.tabId, target.delta)
      return
    }
    if (target.type === "tab") {
      setActiveTab(target.tabId)
      return
    }
    navigate("/", { replace: true })
  }

  const renderSectionItem = (section: SettingsItem) => {
    const Icon = section.icon
    const isActive = activeSection === section.id

    return (
      <button
        key={section.id}
        type="button"
        onClick={() => !section.disabled && handleSectionChange(section.id)}
        disabled={section.disabled}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-hidden transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          section.disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <Icon className="h-4 w-4 shrink-0 stroke-[1.7]" />
        <span className="min-w-0 flex-1 truncate">{section.title}</span>
        {section.isBeta && (
          <span className="rounded-sm bg-sidebar-accent px-1 py-px text-[9px] font-medium uppercase tracking-wide text-sidebar-foreground/60">
            {t("common.badge.beta")}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      data-settings-sidebar="true"
      className="flex h-full min-h-0 flex-col bg-sidebar"
    >
      <header
        className={cn(
          "drag-region shrink-0 bg-sidebar",
          isMacDesktop() && "pt-[38px]"
        )}
      >
        <div className="flex h-11 items-center px-3">
          <button
            type="button"
            onClick={handleBackToApp}
            className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground/65 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            aria-label={t("settings.backToApp", "Back to app")}
          >
            <ArrowLeft className="h-4 w-4 shrink-0 stroke-[1.7]" />
            <span className="truncate">
              {t("settings.backToApp", "Back to app")}
            </span>
          </button>
        </div>
      </header>

      <div className="shrink-0 px-3 pb-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("settings.search", "Search settings…")}
            aria-label={t("settings.search", "Search settings")}
            className="h-9 w-full rounded-lg border border-sidebar-border bg-background/70 pl-8 pr-3 text-[13px] text-sidebar-foreground shadow-xs outline-hidden placeholder:text-sidebar-foreground/40 focus:border-sidebar-ring focus:ring-1 focus:ring-sidebar-ring"
          />
        </label>
      </div>

      <nav
        aria-label={t("settings.title")}
        className="min-h-0 flex-1 select-none overflow-y-auto px-3 pb-4"
      >
        <div className="space-y-4">
          {globalSections.length > 0 ? (
            <section aria-labelledby="global-settings-heading">
              <h2
                id="global-settings-heading"
                className="px-2.5 pb-1.5 text-[12px] font-medium text-sidebar-foreground/45"
              >
                {t("settings.app", "App")}
              </h2>
              <div className="space-y-px">
                {globalSections.map(renderSectionItem)}
              </div>
            </section>
          ) : null}

          {showSpaceSettings && spaceSections.length > 0 ? (
            <section aria-labelledby="space-settings-heading">
              <h2
                id="space-settings-heading"
                className="px-2.5 pb-1.5 text-[12px] font-medium text-sidebar-foreground/45"
              >
                {t("space.settings.title")}
              </h2>
              <div className="space-y-px">
                {spaceSections.map(renderSectionItem)}
              </div>
            </section>
          ) : null}
          {globalSections.length === 0 && spaceSections.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-xs text-sidebar-foreground/45">
              {t("settings.noResults", "No settings found")}
            </p>
          ) : null}
        </div>
      </nav>
    </div>
  )
}
