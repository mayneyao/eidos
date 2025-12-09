import { useCallback } from "react"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { detectDirective } from "@eidos.space/v3"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

/**
 * Custom hook for handling block tab clicks with unified logic
 * Checks for 'use sidebar' directive and handles navigation accordingly
 */
export const useBlockTabClick = (blocks: Record<string, any>) => {
  const { setCurrentApp } = useSidebarStore()
  const { navigate } = useRouterAdapter()

  return useCallback((tabId: string, target?: "_blank" | "_self") => {
    const block = blocks[tabId]
    const hasUseSidebar = block && block.code && detectDirective(block.code, "use sidebar")

    // Always set current app for proper tab activation state
    setCurrentApp(tabId)

    if (!hasUseSidebar) {
      // If block does not contain 'use sidebar' directive, navigate to block page
      navigate(`/blocks/${tabId}`, { target })
    }
    // If block has 'use sidebar' directive, it will render in sidebar automatically
  }, [blocks, setCurrentApp, navigate])
}
