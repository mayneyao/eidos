import {
  Bot,
  Cable,
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  Info,
  KeyRound,
  Palette,
  Settings as SettingsIcon,
  Shield,
  FileType,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { SettingsExternalLinks } from "./settings-external-links"

type SettingsSection =
  | "space-general"
  | "space-document"
  | "space-mounts"
  | "space-file-handlers"
  | "general"
  | "ai"
  | "api"
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
    {
      id: "space-mounts",
      title: t("space.settings.mounts"),
      description: t("space.settings.mountsDescription"),
      icon: <Folder className="h-5 w-5" />,
      category: "space",
    },
    // {
    //   id: "space-file-handlers",
    //   title: "File Handlers",
    //   description: "Manage default applications for file types",
    //   icon: <FileType className="h-5 w-5" />,
    //   category: "space",
    // },
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
      disabled: !isDesktopMode,
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

  // Mobile top navigation component
  const MobileTopNav = () => (
    <div className="lg:hidden border-b bg-muted/30">
      <div className="p-4">
        <div className="space-y-4">
          {/* Global Settings Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.title")}
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {globalSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() =>
                    !section.disabled && onSectionChange(section.id)
                  }
                  disabled={section.disabled}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-all duration-200 border ${
                    activeSection === section.id
                      ? "bg-background shadow-sm border-border"
                      : "border-transparent hover:bg-muted"
                  } ${
                    section.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                >
                  <div
                    className={`${
                      activeSection === section.id
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {section.icon}
                  </div>
                  <span className="font-medium">
                    {section.title}
                    {section.isAlpha && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                        {t("common.badge.alpha")}
                      </span>
                    )}
                  </span>
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
              <div className="flex gap-2 overflow-x-auto pb-2">
                {spaceSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => onSectionChange(section.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-all duration-200 border ${
                      activeSection === section.id
                        ? "bg-background shadow-sm border-border"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <div
                      className={`${
                        activeSection === section.id
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {section.icon}
                    </div>
                    <span className="font-medium">{section.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <MobileTopNav />
      <div className="w-56 border-r bg-muted/30 hidden lg:flex lg:flex-col">
      <div className="p-3 overflow-y-auto flex-1">
        <div className="space-y-4">
          {/* Global Settings Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("settings.title")}
            </h3>
            <div className="space-y-0.5">
              {globalSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() =>
                    !section.disabled && onSectionChange(section.id)
                  }
                  disabled={section.disabled}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-all duration-200 border ${
                    activeSection === section.id
                      ? "bg-background shadow-sm border-border"
                      : "border-transparent hover:bg-muted"
                  } ${
                    section.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-h-[1rem]">
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
                      <div className="font-medium text-sm leading-tight flex items-center gap-1.5">
                        {section.title}
                        {section.isAlpha && (
                          <span className="px-1.5 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
                            {t("common.badge.alpha")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
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
              <div className="space-y-0.5">
                {spaceSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => onSectionChange(section.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-all duration-200 border ${
                      activeSection === section.id
                        ? "bg-background shadow-sm border-border"
                        : "border-transparent hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-h-[1rem]">
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
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* External Links */}
      <div className="p-3 border-t">
        <div className="flex justify-start">
          <SettingsExternalLinks />
        </div>
      </div>
    </div>
    </>
  )
}
