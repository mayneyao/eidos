import {
  Bot,
  Cable,
  ChevronRight,
  Cloud,
  Database,
  FileText,
  Info,
  KeyRound,
  Palette,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"

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

interface SettingsItem {
  id: SettingsSection
  title: string
  description: string
  icon: React.ReactNode
  disabled?: boolean
  isAlpha?: boolean
  category: "space" | "global"
}

interface SettingsSidebarProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  showSpaceSettings?: boolean
}

export function SettingsSidebar({
  activeSection,
  onSectionChange,
  showSpaceSettings = true,
}: SettingsSidebarProps) {
  const { t } = useTranslation()

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
      id: "space-document",
      title: t("space.settings.document"),
      description: t("space.settings.documentDescription"),
      icon: <FileText className="h-5 w-5" />,
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
      id: "ai",
      title: t("settings.ai"),
      description: t("settings.aiDescription"),
      icon: <Bot className="h-5 w-5" />,
      category: "global",
    },
    {
      id: "api",
      title: t("settings.api"),
      description: t("settings.apiDescription"),
      icon: <Cable className="h-5 w-5" />,
      isAlpha: true,
      category: "global",
    },
    {
      id: "key-store",
      title: t("settings.keyStore"),
      description: t("settings.keyStoreDescription"),
      icon: <KeyRound className="h-5 w-5" />,
      category: "global",
    },
    {
      id: "storage",
      title: t("settings.storage"),
      description: t("settings.storageDescription"),
      icon: <Database className="h-5 w-5" />,
      category: "global",
    },
    // {
    //   id: "sync",
    //   title: t("settings.sync"),
    //   description: t("settings.syncDescription"),
    //   icon: <Cloud className="h-5 w-5" />,
    //   disabled: !isDesktopMode,
    //   isAlpha: true,
    //   category: "global"
    // },
    {
      id: "security",
      title: t("settings.security"),
      description: t("settings.securityDescription"),
      icon: <Shield className="h-5 w-5" />,
      disabled: !isDesktopMode,
      category: "global",
    },
  ]

  const spaceSections = settingsSections.filter((s) => s.category === "space")
  const globalSections = settingsSections.filter((s) => s.category === "global")

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col">
      <div className="p-4 overflow-y-auto flex-1">
        <div className="space-y-6">
          {/* Global Settings Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.title")}
            </h3>
            <div className="space-y-1">
              {globalSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() =>
                    !section.disabled && onSectionChange(section.id)
                  }
                  disabled={section.disabled}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-md text-left transition-all duration-200 border ${
                    activeSection === section.id
                      ? "bg-background shadow-sm border-border"
                      : "border-transparent hover:bg-muted"
                  } ${
                    section.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                >
                  <div className="flex items-center space-x-3 min-h-[1rem]">
                    <div
                      className={`${
                        activeSection === section.id
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {section.icon}
                    </div>
                    <div className="flex-1 min-h-[1rem] flex flex-col justify-center">
                      <div className="font-medium text-sm leading-tight flex items-center gap-2">
                        {section.title}
                        {section.isAlpha && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                            {t("common.badge.alpha")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Space Settings Section */}
          {showSpaceSettings && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("space.settings.title")}
              </h3>
              <div className="space-y-1">
                {spaceSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => onSectionChange(section.id)}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-md text-left transition-all duration-200 border ${
                      activeSection === section.id
                        ? "bg-background shadow-sm border-border"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-h-[1rem]">
                      <div
                        className={`${
                          activeSection === section.id
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {section.icon}
                      </div>
                      <div className="flex-1 min-h-[1rem] flex flex-col justify-center">
                        <div className="font-medium text-sm leading-tight">
                          {section.title}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
