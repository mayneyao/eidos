import { useKeyPress } from "ahooks"
import { useParams } from "react-router-dom"

import { UnifiedSettings } from "@/apps/web-app/components/settings/unified-settings"
import { type SettingsSection } from "@/apps/web-app/components/settings/settings-events"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useTabTitle } from "@/hooks/use-tab-title"

export default function SettingsPage() {
  const { section } = useParams<{ section?: string }>()
  const goto = useGoto()

  useTabTitle("Settings")

  useKeyPress("esc", (e) => {
    e.preventDefault()
    goto("")
  })

  const initialSection: SettingsSection =
    (section as SettingsSection) || "general"

  return (
    <div className="h-full">
      <UnifiedSettings
        initialSection={initialSection}
        showSpaceSettings={true}
      />
    </div>
  )
}
