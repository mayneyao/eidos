import { ExternalLink, FileCode2, PanelLeftOpen } from "lucide-react"

import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { Button } from "@/components/ui/button"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"

import { useExtensionSidebarStore } from "./stores/sidebar-store"

export const ExtensionsEmptyState = () => {
  const { space } = useCurrentPathInfo()
  const { isSidebarOpen, toggleSidebar } = useExtensionSidebarStore()
  const storeURL = `${EIDOS_SPACE_BASE_URL}/extensions`

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
          <FileCode2 className="w-12 h-12 text-muted-foreground" />
        </div>

        <h2 className="text-2xl font-semibold mb-3">Select an Extension</h2>

        <p className="text-muted-foreground max-w-md mb-6">
          Choose an extension from the sidebar to view and edit its code,
          preview its functionality, or configure its settings.
        </p>

        <div className="text-sm text-muted-foreground mb-8">
          {isSidebarOpen
            ? "👈 Click on any extension in the sidebar to get started"
            : "Click the button below to open the sidebar and browse extensions"}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {!isSidebarOpen && (
          <Button onClick={toggleSidebar} className="flex items-center gap-2">
            <PanelLeftOpen className="w-4 h-4" />
            Open Sidebar
          </Button>
        )}

        <Button
          variant="outline"
          onClick={() => window.open(storeURL, "_blank")}
          className="flex items-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Browse Extension Store
        </Button>
      </div>
    </div>
  )
}
