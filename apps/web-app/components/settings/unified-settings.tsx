import { SettingsContent } from "./settings-content"
import { SettingsSidebar } from "./settings-sidebar"

interface UnifiedSettingsProps {
  showSpaceSettings?: boolean
}

export function UnifiedSettings({
  showSpaceSettings = true,
}: UnifiedSettingsProps) {
  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar">
        <SettingsSidebar showSpaceSettings={showSpaceSettings} />
      </aside>
      <SettingsContent />
    </div>
  )
}
