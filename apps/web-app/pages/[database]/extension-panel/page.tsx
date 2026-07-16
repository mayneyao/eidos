import { useLocation } from "react-router-dom"

import { ExtensionPanelSurface } from "@/apps/web-app/components/file-extensions/extension-panel-surface"

export function SpaceExtensionPanelPage() {
  const location = useLocation()
  const sessionId = new URLSearchParams(location.search).get("session")
  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No extension panel session was selected.
      </div>
    )
  }
  return <ExtensionPanelSurface sessionId={sessionId} />
}
