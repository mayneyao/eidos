import {
  ArrowLeft,
  Bot,
  Cloud,
  FileText,
  Folder,
  Network,
  Info,
  Package,
  Paintbrush,
  Settings as SettingsIcon,
  LayoutTemplate,
  User,
  Globe,
  Key,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ComponentType, CSSProperties } from "react"

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
}

interface SettingsSidebarProps {
  showSpaceSettings?: boolean
}

export function SettingsSidebar({
  showSpaceSettings = true,
}: SettingsSidebarProps) {
  const { t } = useTranslation()
  const { navigate, location } = useRouterAdapter()

  // Parse section from URL: /settings/:section
  const pathParts = location.pathname.split("/").filter(Boolean)
  const requestedSection: SettingsSection =
    (pathParts[1] as SettingsSection) || "general"
  const { currentSpace: spaceInfo } = useCurrentSpace()
  const activeSection: SettingsSection =
    spaceInfo?.mode === "file" &&
    requestedSection.startsWith("space-") &&
    requestedSection !== "space-general"
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
      id: "space-extensions",
      title: "Extensions",
      icon: Package,
      category: "space",
    },
    {
      id: "space-tabs",
      title: t("space.settings.tabs.title", "Tabs"),
      icon: LayoutTemplate,
      category: "space",
    },
    {
      id: "space-document",
      title: t("space.settings.document"),
      icon: FileText,
      category: "space",
    },
    {
      id: "space-mounts",
      title: t("space.settings.mounts"),
      icon: Folder,
      category: "space",
    },
    {
      id: "space-relay",
      title: t("space.settings.relay"),
      icon: Network,
      isBeta: true,
      category: "space",
    },
    {
      id: "space-theme",
      title: t("space.settings.theme", "Theme"),
      icon: Paintbrush,
      category: "space",
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

  const spaceSections = settingsSections.filter(
    (section) =>
      section.category === "space" &&
      (spaceInfo?.mode !== "file" || section.id === "space-general")
  )
  const globalSections = settingsSections.filter((s) => s.category === "global")

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
          "group flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] outline-hidden transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          section.disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
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
          "drag-region flex h-[38px] shrink-0 items-center border-b border-sidebar-border/60 bg-muted/60 px-1",
          isMacDesktop() && "pl-[72px]"
        )}
      >
        <button
          type="button"
          onClick={handleBackToApp}
          className="flex h-7 min-w-0 items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium text-sidebar-foreground/75 outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-sidebar-ring"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          aria-label={t("settings.backToApp", "Back to app")}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {t("settings.backToApp", "Back to app")}
          </span>
        </button>
      </header>

      <nav
        aria-label={t("settings.title")}
        className="min-h-0 flex-1 select-none overflow-y-auto px-2 py-2"
      >
        <div className="space-y-3">
          <section aria-labelledby="global-settings-heading">
            <h2
              id="global-settings-heading"
              className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50"
            >
              {t("settings.title")}
            </h2>
            <div className="space-y-px">
              {globalSections.map(renderSectionItem)}
            </div>
          </section>

          {showSpaceSettings && (
            <section aria-labelledby="space-settings-heading">
              <h2
                id="space-settings-heading"
                className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50"
              >
                {t("space.settings.title")}
              </h2>
              <div className="space-y-px">
                {spaceSections.map(renderSectionItem)}
              </div>
            </section>
          )}
        </div>
      </nav>
    </div>
  )
}
