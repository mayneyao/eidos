import { useRef, useEffect } from "react"
import { isDesktopMode } from "@/lib/env"

interface BrowserViewContainerProps {
  viewId: string
  url: string
  isActive: boolean
  isAnyOverlayOpen: boolean
  viewMode: "browser" | "table"
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
  isActive,
  isAnyOverlayOpen,
  viewMode,
  onNavigate,
  onLoadingChange,
  onRawdataNavigation,
  onTitleChange,
}: BrowserViewContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isDesktopMode || !url) return
    const content = containerRef.current
    if (!content) return

    const syncBounds = () => {
      const rect = content.getBoundingClientRect()
      window.eidos.browser.view.updateBounds(viewId, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
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

    return () => {
      ro.disconnect()
      unsubscribe()
      unsubscribeBounds?.()
      unsubscribeZoom?.()
      window.eidos.browser.view.close(viewId)
    }
  }, [url, viewId])

  useEffect(() => {
    if (!isDesktopMode || !url) return

    const shouldShow = isActive && !isAnyOverlayOpen && viewMode === "browser"

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

    window.eidos.browser.view.setVisible(viewId, shouldShow)
  }, [isActive, isAnyOverlayOpen, url, viewMode, viewId])

  return (
    <div ref={containerRef} className="flex-1 w-full h-full min-h-[100px]" />
  )
}
