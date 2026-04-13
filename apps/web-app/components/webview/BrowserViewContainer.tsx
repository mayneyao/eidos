import { useRef, useEffect } from "react"
import { isDesktopMode } from "@/lib/env"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useWebviewStore } from "@/apps/web-app/store/webview-store"

interface BrowserViewContainerProps {
  viewId: string
  url: string
  space?: string
  isActive: boolean
  isAnyOverlayOpen: boolean
  viewMode: "browser" | "table"
  isReaderViewMode?: boolean
  onNavigate: (data: {
    url: string
    canGoBack: boolean
    canGoForward: boolean
  }) => void
  onLoadingChange: (isLoading: boolean) => void
  onRawdataNavigation: (url: string) => void
  onTitleChange?: (title: string) => void
}

export function BrowserViewContainer({
  viewId,
  url,
  space,
  isActive,
  isAnyOverlayOpen,
  viewMode,
  isReaderViewMode,
  onNavigate,
  onLoadingChange,
  onRawdataNavigation,
  onTitleChange,
}: BrowserViewContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Set view space when it changes
  useEffect(() => {
    if (!isDesktopMode || !space) return
    window.eidos?.browser?.view?.setViewSpace?.(viewId, space)
  }, [viewId, space])

  useEffect(() => {
    console.log(
      "[BrowserViewContainer] useEffect triggered, url:",
      url,
      "viewId:",
      viewId,
      "isDesktop:",
      isDesktopMode
    )
    if (!isDesktopMode || !url) {
      console.log(
        "[BrowserViewContainer] Early return - isDesktop:",
        isDesktopMode,
        "url:",
        url
      )
      return
    }
    const content = containerRef.current
    if (!content) {
      console.log("[BrowserViewContainer] Early return - no content ref")
      return
    }
    console.log("[BrowserViewContainer] Opening view with url:", url)

    const syncBounds = () => {
      const rect = content.getBoundingClientRect()
      const bounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
      window.eidos.browser.view.updateBounds(viewId, bounds)
      // Sync find overlay position if open
      window.eidos.browser.find?.syncFindOverlayPosition?.(viewId, bounds)
    }

    const open = async () => {
      // Wait for container to have proper size
      let rect = content.getBoundingClientRect()

      // If container has no height, wait a bit
      if (rect.height < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        rect = content.getBoundingClientRect()
      }

      await window.eidos.browser.view.open(viewId, url, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(Math.max(rect.width, 100)),
        height: Math.round(Math.max(rect.height, 100)),
      })
    }

    open()

    const ro = new ResizeObserver(syncBounds)
    ro.observe(content)

    const unsubscribe = window.eidos.browser.view.onUpdate(viewId, (data) => {
      if (data.type === "navigate") {
        onNavigate({
          url: data.url || "",
          canGoBack: data.canGoBack ?? false,
          canGoForward: data.canGoForward ?? false,
        })
      } else if (data.type === "loading") {
        onLoadingChange(data.isLoading ?? false)
      } else if (data.type === "rawdata-navigation") {
        onRawdataNavigation(data.url || "")
      } else if (data.type === "title") {
        onTitleChange?.(data.title || "")
      }
    })

    // Listen for find in page results
    const unsubscribeFind = window.eidos.browser.view.onFindInPageResult?.(
      viewId,
      (result) => {
        useWebviewStore.getState().onFindInPageResult(viewId, result)
      }
    )

    // Listen for bounds update requests (after leaving fullscreen)
    const unsubscribeBounds = window.eidos.browser.view.onRequestBoundsUpdate?.(
      viewId,
      () => {
        const content = containerRef.current
        if (content) {
          const rect = content.getBoundingClientRect()
          window.eidos.browser.view.updateBounds(viewId, {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          })
        }
      }
    )

    // Listen for zoom changes and update bounds
    const unsubscribeZoom = window.eidos.browser.view.onZoomChanged?.(() => {
      const content = containerRef.current
      if (content) {
        // Force layout recalculation after zoom change
        void content.offsetHeight
        const rect = content.getBoundingClientRect()
        window.eidos.browser.view.updateBounds(viewId, {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      }
    })

    // Listen for focus events from BrowserView to activate this tab
    const handleFocus = (eventViewId: string) => {
      if (eventViewId === viewId) {
        const { setActiveTab, getPanelForTab, setActivePanel } =
          useTabStore.getState()
        setActiveTab(viewId)
        const panel = getPanelForTab(viewId)
        if (panel) {
          setActivePanel(panel.id)
        }
      }
    }

    const focusListenerId = window.eidos?.on?.(
      "browser.view:focus",
      (_event: any, id: string) => handleFocus(id)
    )

    return () => {
      ro.disconnect()
      unsubscribe()
      unsubscribeBounds?.()
      unsubscribeZoom?.()
      unsubscribeFind?.()
      if (focusListenerId) {
        window.eidos?.off?.("browser.view:focus", focusListenerId)
      }
      window.eidos.browser.view.close(viewId)
    }
  }, [url, viewId])

  useEffect(() => {
    if (!isDesktopMode || !url) return

    // Show BrowserView in browser mode or reader view mode
    const shouldShow =
      isActive &&
      !isAnyOverlayOpen &&
      (viewMode === "browser" || isReaderViewMode)

    console.log(
      "[BrowserViewContainer] Visibility effect - shouldShow:",
      shouldShow,
      "isActive:",
      isActive,
      "isAnyOverlayOpen:",
      isAnyOverlayOpen,
      "viewMode:",
      viewMode
    )

    if (shouldShow) {
      // Update bounds before showing to ensure correct position
      const content = containerRef.current
      if (content) {
        const rect = content.getBoundingClientRect()
        window.eidos.browser.view.updateBounds(viewId, {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(Math.max(rect.width, 100)),
          height: Math.round(Math.max(rect.height, 100)),
        })
      }
    }

    window.eidos.browser.view.setVisible(viewId, !!shouldShow)
  }, [isActive, isAnyOverlayOpen, url, viewMode, viewId])

  return (
    <div ref={containerRef} className="flex-1 w-full h-full min-h-[100px]" />
  )
}
