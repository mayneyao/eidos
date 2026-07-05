import {
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

import { cloneElement, useEffect, useState } from "react"

import { isDesktopMode } from "@/lib/env"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useCurrentSpace } from "@/hooks/use-current-space"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { type SettingsSection } from "./settings-events"

interface SettingsItem {
  id: SettingsSection
  title: string
  description: string
  icon: React.ReactNode
  disabled?: boolean
  isAlpha?: boolean
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
  const activeSection: SettingsSection =
    (pathParts[1] as SettingsSection) || "general"
  const { currentSpace: spaceInfo } = useCurrentSpace()
  const [hasSyncCredentials, setHasSyncCredentials] = useState(false)

  useEffect(() => {
    async function checkCredentials() {
      if (!isDesktopMode || !window.eidos?.credentials) {
        setHasSyncCredentials(false)
        return
      }
      try {
        const eidosCreds =
          await window.eidos.credentials.hasSyncCredentials("eidos.space")
        if (eidosCreds) {
          setHasSyncCredentials(true)
          return
        }

        if (window.eidos?.config) {
          const syncConfig = await window.eidos.config.get("sync")
          const providerIds = Object.keys(syncConfig?.providers || {})

          for (const id of providerIds) {
            const hasCreds =
              await window.eidos.credentials.hasSyncCredentials(id)
            if (hasCreds) {
              setHasSyncCredentials(true)
              return
            }
          }
        }
        setHasSyncCredentials(false)
      } catch (error) {
        console.error("Failed to check sync credentials:", error)
        setHasSyncCredentials(false)
      }
    }
    checkCredentials()
  }, [])

  const handleSectionChange = (id: SettingsSection) => {
    navigate(`/settings/${id}`, { replace: true })
  }

  const settingsSections: SettingsItem[] = [
    // Space Settings
    {
      id: "space-general",
      title: t("space.settings.general"),
      description: t("space.settings.spaceDescription"),
      icon: <Info className="h-5 w-5" />,
      category: "space",
    },
    {
      id: "space-extensions",
      title: "Extensions",
      description: "Manage installed extensions for this space",
      icon: <Package className="h-5 w-5" />,
      category: "space",
    },
    {
      id: "space-tabs",
      title: t("space.settings.tabs.title", "Tabs"),
      description: t("space.settings.tabs.description"),
      icon: <LayoutTemplate className="h-5 w-5" />,
      category: "space",
    },
    {
      id: "space-document",
      title: t("space.settings.document"),
      description: t("space.settings.documentDescription"),
      icon: <FileText className="h-5 w-5" />,
      category: "space",
    },
    {
      id: "space-mounts",
      title: t("space.settings.mounts"),
      description: t("space.settings.mountsDescription"),
      icon: <Folder className="h-5 w-5" />,
      category: "space",
    },
    {
      id: "space-relay",
      title: t("space.settings.relay"),
      description: t("space.settings.relayDescription"),
      icon: <Network className="h-5 w-5" />,
      isBeta: true,
      category: "space",
    },
    {
      id: "space-theme",
      title: t("space.settings.theme", "Theme"),
      description: t(
        "space.settings.themeDescription",
        "Customize the appearance of your space"
      ),
      icon: <Paintbrush className="h-5 w-5" />,
      category: "space",
    },
    {
      id: "space-sync",
      title: t("space.settings.sync", "Sync"),
      description: t("space.settings.syncDescription"),
      icon: <Cloud className="h-5 w-5" />,
      disabled: !isDesktopMode,
      isBeta: true,
      category: "space",
    },

    // Global Settings
    {
      id: "general",
      title: t("settings.general"),
      description: t("settings.manageAppSettings"),
      icon: <SettingsIcon className="h-5 w-5" />,
      category: "global",
    },
    {
      id: "account",
      title: t("settings.account.title", "Account"),
      description: t(
        "settings.account.description",
        "Manage your account and sync provider"
      ),
      icon: <User className="h-5 w-5" />,
      category: "global",
    },
    {
      id: "ai",
      title: t("settings.ai"),
      description: t("settings.aiDescription"),
      icon: <Bot className="h-5 w-5" />,
      category: "global",
    },
    {
      id: "sync",
      title: t("settings.sync"),
      description: t(
        "settings.syncDescription",
        "Configure sync provider and credentials"
      ),
      icon: <Cloud className="h-5 w-5" />,
      disabled: !isDesktopMode,
      isBeta: true,
      category: "global",
    },
    {
      id: "browser",
      title: t("settings.browser", "Browser"),
      description: t(
        "settings.browserDescription",
        "Configure search engine and link handling preferences"
      ),
      icon: <Globe className="h-5 w-5" />,
      isBeta: true,
      category: "global",
    },
    {
      id: "secrets",
      title: t("settings.secrets", "Secrets"),
      description: t(
        "settings.secrets.description",
        "Manage encrypted sensitive keys and environment variables"
      ),
      icon: <Key className="h-5 w-5" />,
      category: "global",
    },
  ]

  const spaceSections = settingsSections.filter((s) => s.category === "space")
  const globalSections = settingsSections.filter((s) => s.category === "global")
  const goto = useGoto()

  const handleBackToApp = () => {
    goto("")
  }

  const renderSectionItem = (section: SettingsItem) => (
    <button
      key={section.id}
      onClick={() => !section.disabled && handleSectionChange(section.id)}
      disabled={section.disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-all duration-150 group ${
        activeSection === section.id
          ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-foreground font-medium"
          : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/40 hover:text-foreground"
      } ${section.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div
        className={`flex-shrink-0 flex items-center justify-center transition-colors ${
          activeSection === section.id
            ? "text-foreground"
            : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {section.icon &&
          cloneElement(section.icon as React.ReactElement, {
            className: "h-4.5 w-4.5 flex-shrink-0",
          })}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-[15px] leading-none">{section.title}</span>
        {section.isAlpha && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 font-medium">
            {t("common.badge.alpha")}
          </span>
        )}
        {section.isBeta && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 font-medium">
            {t("common.badge.beta")}
          </span>
        )}
      </div>
    </button>
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-3 overflow-y-auto flex-1 select-none">
        <div className="space-y-4">
          {/* Global Settings Section */}
          <div className="space-y-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2.5 pt-2 pb-1">
              {t("settings.title")}
            </h3>
            <div className="space-y-0.5">
              {globalSections.map(renderSectionItem)}
            </div>
          </div>

          {/* Space Settings Section */}
          {showSpaceSettings && (
            <div className="space-y-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-2.5 pt-2 pb-1">
                {t("space.settings.title")}
              </h3>
              <div className="space-y-0.5">
                {spaceSections.map(renderSectionItem)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
