import { ChevronRight, FileText, Info } from "lucide-react"
import { useTranslation } from "react-i18next"

type SettingsSection = "general" | "document"

interface SettingsItem {
  id: SettingsSection
  title: string
  description: string
  icon: React.ReactNode
}

interface SettingsSidebarProps {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

export function SettingsSidebar({
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  const { t } = useTranslation()

  const settingsSections: SettingsItem[] = [
    {
      id: "general",
      title: t("space.settings.general"),
      description: t("space.settings.spaceDescription"),
      icon: <Info className="h-5 w-5" />,
    },
    {
      id: "document",
      title: t("space.settings.document"),
      description: t("space.settings.documentDescription"),
      icon: <FileText className="h-5 w-5" />,
    },
  ]

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col">
      <div className="p-4 overflow-y-auto flex-1">
        <div className="space-y-1">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-md text-left transition-all duration-200 border ${
                activeSection === section.id
                  ? "bg-background shadow-sm border-border"
                  : "border-transparent hover:bg-muted"
              }`}
            >
              <div className="flex items-center space-x-3 min-h-[2.5rem]">
                <div
                  className={`${
                    activeSection === section.id
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {section.icon}
                </div>
                <div className="flex-1 min-h-[2.5rem] flex flex-col justify-center">
                  <div className="font-medium text-sm leading-tight">
                    {section.title}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1 leading-tight">
                    {section.description}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
