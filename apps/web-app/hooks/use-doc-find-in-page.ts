import { useEffect, useMemo } from "react"

import { isDesktopMode } from "@/lib/env"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { ITreeNode } from "@eidos.space/core/types/ITreeNode"

const MAIN_WINDOW_VIEW_ID = "__main__"

/**
 * Hook to enable find-in-page for document content in the Desktop app.
 * Wires up the main window's native Electron find overlay.
 */
export function useDocFindInPage(nodeType: string = "doc") {
  const { isFocused } = useTabContext()

  const shouldShowFindInPage = useMemo(() => {
    return isDesktopMode && ["doc", "day", "agent"].includes(nodeType)
  }, [isDesktopMode, nodeType])

  useEffect(() => {
    if (!shouldShowFindInPage) return

    // Close find overlay when doc tab loses focus
    if (!isFocused) {
      window.eidos?.browser?.find?.closeFindOverlay?.(MAIN_WINDOW_VIEW_ID)
      window.eidos?.browser?.find?.stopFindInPage?.(
        MAIN_WINDOW_VIEW_ID,
        "clearSelection"
      )
    }
  }, [isFocused, shouldShowFindInPage])

  useEffect(() => {
    if (!shouldShowFindInPage) return

    const handleToggleFindInPage = async () => {
      if (!isFocused) return
      const isOpen =
        await window.eidos?.browser?.find?.isFindOverlayOpen?.(
          MAIN_WINDOW_VIEW_ID
        )
      if (isOpen) {
        await window.eidos?.browser?.find?.closeFindOverlay?.(
          MAIN_WINDOW_VIEW_ID
        )
        window.eidos?.browser?.find?.stopFindInPage?.(
          MAIN_WINDOW_VIEW_ID,
          "clearSelection"
        )
      } else {
        await window.eidos?.browser?.find?.showFindOverlay?.(
          MAIN_WINDOW_VIEW_ID,
          {
            findText: "",
            findMatches: 0,
            findActiveMatch: 0,
          }
        )
      }
    }

    window.addEventListener("toggle-find-in-page", handleToggleFindInPage)
    return () => {
      window.removeEventListener("toggle-find-in-page", handleToggleFindInPage)
    }
  }, [isFocused, shouldShowFindInPage])

  useEffect(() => {
    return () => {
      if (!shouldShowFindInPage) return
      window.eidos?.browser?.find?.closeFindOverlay?.(MAIN_WINDOW_VIEW_ID)
      window.eidos?.browser?.find?.stopFindInPage?.(
        MAIN_WINDOW_VIEW_ID,
        "clearSelection"
      )
    }
  }, [shouldShowFindInPage])
}
