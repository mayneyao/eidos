"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, Globe, RefreshCcw } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { useTabTitle } from "@/hooks/use-tab-title"
import { Button } from "@/components/ui/button"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"

function generateViewId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function WebviewPage() {
  const [searchParams] = useSearchParams()
  const rawUrl = searchParams.get("url") || ""
  const containerRef = useRef<HTMLDivElement>(null)
  const viewIdRef = useRef<string>(generateViewId())
  const committedUrlRef = useRef<string>("")
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [displayUrl, setDisplayUrl] = useState("")
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)

  const url = useMemo(() => {
    if (!rawUrl) return ""
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl
    return `https://${rawUrl}`
  }, [rawUrl])

  const isAnyOverlayOpen = useAppRuntimeStore(
    (state) =>
      state.isCmdkOpen ||
      state.isKeyboardShortcutsOpen ||
      state.isSpaceSettingsOpen ||
      state.isGlobalSearchOpen
  )
  const { isActive } = useTabContext()

  useTabTitle(displayUrl || url || "Webview")

  useEffect(() => {
    setDisplayUrl(url)
    committedUrlRef.current = url
  }, [url])

  useEffect(() => {
    if (!isDesktopMode || !url) return
    const content = containerRef.current
    if (!content) return

    const viewId = viewIdRef.current

    const syncBounds = () => {
      const rect = content.getBoundingClientRect()
      window.eidos.browserView.updateBounds(viewId, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    const open = async () => {
      const rect = content.getBoundingClientRect()
      await window.eidos.browserView.open(viewId, url, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }

    open()

    const ro = new ResizeObserver(syncBounds)
    ro.observe(content)

    const unsubscribe = window.eidos.browserView.onUpdate(viewId, (data) => {
      if (data.type === "navigate") {
        const u = data.url || ""
        setDisplayUrl(u)
        committedUrlRef.current = u
        setCanGoBack(data.canGoBack ?? false)
        setCanGoForward(data.canGoForward ?? false)
      } else if (data.type === "loading") {
        setIsLoading(data.isLoading ?? false)
      }
    })

    return () => {
      ro.disconnect()
      unsubscribe()
      window.eidos.browserView.close(viewId)
    }
  }, [url])

  useEffect(() => {
    if (!isDesktopMode || !url) return
    const viewId = viewIdRef.current
    const shouldShow = isActive && !isAnyOverlayOpen

    const update = async () => {
      if (!shouldShow) {
        if (isAnyOverlayOpen) {
          const res = await window.eidos.browserView.capturePage(viewId)
          if (res.success && res.dataUrl) {
            setScreenshotUrl(res.dataUrl)
          }
        } else {
          setScreenshotUrl(null)
        }
        window.eidos.browserView.setVisible(viewId, false)
      } else {
        const content = containerRef.current
        if (content) {
          const rect = content.getBoundingClientRect()
          window.eidos.browserView.updateBounds(viewId, {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          })
        }
        window.eidos.browserView.setVisible(viewId, true)
        setScreenshotUrl(null)
      }
    }

    update()
  }, [isActive, isAnyOverlayOpen, url])

  const handleReload = () => {
    if (!isDesktopMode) return
    window.eidos.browserView.reload(viewIdRef.current)
  }

  const handleGoBack = () => {
    if (!isDesktopMode) return
    window.eidos.browserView.goBack(viewIdRef.current)
  }

  const handleGoForward = () => {
    if (!isDesktopMode) return
    window.eidos.browserView.goForward(viewIdRef.current)
  }

  const handleLoadUrl = () => {
    if (!isDesktopMode || !displayUrl.trim()) return
    let target = displayUrl.trim()
    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`
    }
    window.eidos.browserView.loadURL(viewIdRef.current, target)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur()
      handleLoadUrl()
    }
  }

  const handleBlur = () => {
    setDisplayUrl(committedUrlRef.current)
  }

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Globe className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No URL provided</p>
        </div>
      </div>
    )
  }

  if (isDesktopMode) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!canGoBack}
            onClick={handleGoBack}
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!canGoForward}
            onClick={handleGoForward}
            title="Forward"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleReload}
            title="Reload"
          >
            <RefreshCcw
              className={cn("h-4 w-4", isLoading && "animate-spin")}
            />
          </Button>
          <div className="mx-2 flex flex-1 items-center overflow-hidden rounded-md border bg-muted/40 px-2 py-1">
            <Globe className="mr-2 h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={displayUrl}
              onChange={(e) => setDisplayUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="w-full bg-transparent text-xs text-muted-foreground outline-none"
            />
          </div>
        </div>
        <div ref={containerRef} className="relative flex-1">
          {screenshotUrl && (
            <img
              src={screenshotUrl}
              alt="Screenshot"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <iframe
      src={url}
      title={url}
      className="h-full w-full border-0"
      allow="fullscreen"
    />
  )
}
