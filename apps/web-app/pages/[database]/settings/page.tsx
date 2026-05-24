import { useKeyPress } from "ahooks"

import { SettingsContent } from "@/apps/web-app/components/settings/settings-content"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useTabTitle } from "@/hooks/use-tab-title"

export default function SettingsPage() {
  const goto = useGoto()

  useTabTitle("Settings")

  useKeyPress("esc", (e) => {
    e.preventDefault()
    goto("")
  })

  return (
    <div className="h-full">
      <SettingsContent />
    </div>
  )
}
