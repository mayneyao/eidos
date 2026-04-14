import { useEffect } from "react"

import { isDesktopMode } from "@/lib/env"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"

const MAIN_WINDOW_VIEW_ID = "__main__"

/**
 * Hook to enable find-in-page for document content in the Desktop app.
 * Wires up the main window's native Electron find overlay.
 */
export function useDocFindInPage() {
  const { isFocused } = useTabContext()

  useEffect(() => {
    if (!isDesktopMode) return

    // Close find overlay when doc tab loses focus
    if (!isFocused) {
      window.eidos?.browser?.find?.closeFindOverlay?.(MAIN_WINDOW_VIEW_ID)
      window.eidos?.browser?.find?.stopFindInPage?.(
        MAIN_WINDOW_VIEW_ID,
        "clearSelection"
      )
    }
  }, [isFocused])

  useEffect(() => {
    if (!isDesktopMode) return

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
  }, [isFocused])

  useEffect(() => {
    return () => {
      if (!isDesktopMode) return
      window.eidos?.browser?.find?.closeFindOverlay?.(MAIN_WINDOW_VIEW_ID)
      window.eidos?.browser?.find?.stopFindInPage?.(
        MAIN_WINDOW_VIEW_ID,
        "clearSelection"
      )
    }
  }, [])
}
