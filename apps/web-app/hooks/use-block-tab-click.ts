import { useCallback } from "react"
import { detectDirective } from "@eidos.space/v3"

import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

/**
 * Custom hook for handling block tab clicks with unified logic
 * Checks for 'use sidebar' directive and handles navigation accordingly
 */
export const useBlockTabClick = (blocks: Record<string, any>) => {
  const { setCurrentApp } = useSidebarStore()

  return useCallback(
    (tabId: string, target?: "_blank" | "_self") => {
      const block = blocks[tabId]
      const hasUseSidebar =
        block && block.code && detectDirective(block.code, "use sidebar")

      // Always set current app for proper tab activation state
      setCurrentApp(tabId)

      if (!hasUseSidebar) {
        // If block does not contain 'use sidebar' directive, navigate to block page
        const href = `/blocks/${tabId}`
        const { tabs, openTab, setActiveTab } = useTabStore.getState()

        if (target === "_blank") {
          openTab(href, undefined, { forceNewTab: true })
          return
        }

        // Check if tab with same block already exists
        const existingTab = tabs.find((t) => t.url === href)
        if (existingTab) {
          // If it exists, just activate it
          setActiveTab(existingTab.id)
        } else {
          // Otherwise open a new tab
          openTab(href)
        }
      }
      // If block has 'use sidebar' directive, it will render in sidebar automatically
    },
    [blocks, setCurrentApp]
  )
}
