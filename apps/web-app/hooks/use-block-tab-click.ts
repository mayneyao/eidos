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

    if (hasUseSidebar) {
      // If block contains 'use sidebar' directive, render in sidebar
      setCurrentApp(tabId)
    } else {
      // Otherwise, navigate to block page normally
      navigate(`/blocks/${tabId}`, { target })
    }
  }, [blocks, setCurrentApp, navigate])
}
