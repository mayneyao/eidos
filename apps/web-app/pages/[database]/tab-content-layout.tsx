import { useCallback, useMemo } from "react"
import { ExternalLink } from "lucide-react"
import { Navigate, useLocation, useRoutes } from "react-router-dom"

import { isDesktopMode } from "@/lib/env"
import { Webview } from "@/apps/web-app/components/webview"
import { useRegisterTabContextMenuItem } from "@/hooks/use-tab-context-menu-registry"
import { fileSpaceRoutes } from "@/apps/web-app/file-space-routes"
import { spaceRoutes } from "@/apps/web-app/routes"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"

// Component for tab-specific content (only the main content area)
export function TabContentLayout() {
  console.log("[TabContentLayout] Component rendering start")
  const { tabId } = useTabContext()
  console.log("[TabContentLayout] Got tabId:", tabId)
  const location = useLocation()
  console.log("[TabContentLayout] Got location:", location.pathname)
  const { currentSpace } = useCurrentSpace()
  const element = useRoutes(
    currentSpace?.mode === "file" ? fileSpaceRoutes : spaceRoutes
  )
  console.log("[TabContentLayout] Got element:", element)

  // Get the actual tab URL from store
  const tabUrl = useTabStore(
    (state) => state.tabs.find((t) => t.id === tabId)?.url
  )

  // Check if this is an external URL (http/https)
  // Note: tabUrl may be undefined for new tabs, treat those as internal
  const isExternalUrl = useMemo(() => {
    return !!tabUrl && /^https?:\/\//i.test(tabUrl)
  }, [tabUrl])

  const handleOpenInBrowser = useCallback(async () => {
    if (!tabUrl) return
    if (isDesktopMode && (window as any).eidos?.openUrl) {
      await (window as any).eidos.openUrl(tabUrl)
    } else {
      window.open(tabUrl, "_blank")
    }
  }, [tabUrl])

  useRegisterTabContextMenuItem("http", {
    id: "open-in-browser",
    label: "Open in Default Browser",
    Icon: ExternalLink,
    onClick: handleOpenInBrowser,
  })

  // Debug logging
  console.log(
    "[TabContentLayout] tabId:",
    tabId,
    "tabUrl:",
    tabUrl,
    "pathname:",
    location.pathname,
    "isExternalUrl:",
    isExternalUrl,
    "element:",
    element
  )

  // If it's an external URL, render webview directly
  // This avoids routing issues with MemoryRouter and external URLs
  if (isExternalUrl) {
    // If we're on the /external placeholder path, render the webview
    if (location.pathname === "/external") {
      return (
        <div className="flex flex-col h-full min-w-0">
          <div
            id="main-content"
            className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
          >
            <Webview url={tabUrl!} />
          </div>
        </div>
      )
    }

    // Otherwise redirect to /external placeholder path
    return (
      <div className="flex flex-col h-full min-w-0">
        <div
          id="main-content"
          className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
        >
          <Navigate to="/external" replace />
        </div>
      </div>
    )
  }

  // Handle case where element is null (no route matched)
  if (!element) {
    console.log("[TabContentLayout] No element to render, showing fallback")
    return (
      <div className="flex flex-col h-full min-w-0">
        <div
          id="main-content"
          className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0 items-center justify-center"
        >
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      <div
        id="main-content"
        className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
      >
        {element}
      </div>
    </div>
  )
}
