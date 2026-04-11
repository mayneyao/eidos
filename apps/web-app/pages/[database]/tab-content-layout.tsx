import { useEffect, useMemo } from "react"
import { Navigate, useLocation, useRoutes } from "react-router-dom"

import { spaceRoutes } from "@/apps/web-app/routes"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useTabStore } from "@/apps/web-app/store/tabs"

// Component for tab-specific content (only the main content area)
export function TabContentLayout() {
  const { tabId } = useTabContext()
  const location = useLocation()
  const element = useRoutes(spaceRoutes)

  // Get the actual tab URL from store
  const tabUrl = useTabStore(
    (state) => state.tabs.find((t) => t.id === tabId)?.url
  )

  // Check if this is an external URL (http/https)
  const isExternalUrl = useMemo(() => {
    return tabUrl && /^https?:\/\//i.test(tabUrl)
  }, [tabUrl])

  // If it's an external URL, render webview via the webview route
  // This keeps the tab URL as https://... but renders using the webview component
  if (isExternalUrl && location.pathname !== "/webview") {
    return (
      <div className="flex flex-col h-full min-w-0">
        <div
          id="main-content"
          className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
        >
          <Navigate
            to={`/webview?url=${encodeURIComponent(tabUrl!)}`}
            replace
          />
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
