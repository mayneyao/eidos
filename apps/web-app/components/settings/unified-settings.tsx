import { SettingsContent } from "./settings-content"
import { SettingsSidebar } from "./settings-sidebar"

interface UnifiedSettingsProps {
  showSpaceSettings?: boolean
}

export function UnifiedSettings({
  showSpaceSettings = true,
}: UnifiedSettingsProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
      <aside className="w-full shrink-0 border-b border-sidebar-border bg-sidebar lg:h-full lg:w-60 lg:border-b-0 lg:border-r">
        <SettingsSidebar showSpaceSettings={showSpaceSettings} />
      </aside>
      <SettingsContent />
    </div>
  )
}
