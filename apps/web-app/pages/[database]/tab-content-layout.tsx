import { useRoutes } from "react-router-dom"

import { spaceRoutes } from "@/apps/web-app/routes"

// Component for tab-specific content (only the main content area)
export function TabContentLayout() {
  const element = useRoutes(spaceRoutes)

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
