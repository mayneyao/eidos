"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Globe } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useToast } from "@/components/ui/use-toast"

import {
  OpenDataTableView,
  WebviewToolbar,
  BrowserViewContainer,
  type OpenDataAdapter,
  type ViewMode,
} from "./components"

// Declare global event listener type
declare global {
  interface WindowEventMap {
    "focus-webview-address-bar": CustomEvent
  }
}

function generateViewId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function WebviewPage() {
  const [searchParams] = useSearchParams()
  const rawUrl = searchParams.get("url") || ""
  const viewIdRef = useRef<string>(generateViewId())
  const committedUrlRef = useRef<string>("")
  const addressBarRef = useRef<HTMLInputElement>(null)

  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [displayUrl, setDisplayUrl] = useState("")
  const [matchedAdapters, setMatchedAdapters] = useState<OpenDataAdapter[]>([])
  const matchedAdaptersRef = useRef(matchedAdapters)
  const [hasOpenData, setHasOpenData] = useState(false)
  const [isLoadingAdapters, setIsLoadingAdapters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("browser")
  const [selectedAdapter, setSelectedAdapter] =
    useState<OpenDataAdapter | null>(null)

  // Use store state for opendata popover so it triggers overlay detection
  const isOpenDataOpen = useAppRuntimeStore(
    (state) => state.isOpenDataPopoverOpen
  )
  const setIsOpenDataOpen = useAppRuntimeStore(
    (state) => state.setOpenDataPopoverOpen
  )

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
      state.isGlobalSearchOpen ||
      state.isOpenDataPopoverOpen ||
      state.isTerminalVisible
  )
  const { isActive } = useTabContext()
  const { space } = useCurrentPathInfo()
  const { toast } = useToast()

  useTabTitle(displayUrl || url || "Webview")

  useEffect(() => {
    setDisplayUrl(url)
    committedUrlRef.current = url
  }, [url])

  useEffect(() => {
    matchedAdaptersRef.current = matchedAdapters
  }, [matchedAdapters])

  // Listen for focus address bar event from global shortcuts
  useEffect(() => {
    const handleFocusAddressBar = () => {
      addressBarRef.current?.focus()
      addressBarRef.current?.select()
    }

    window.addEventListener("focus-webview-address-bar", handleFocusAddressBar)
    return () => {
      window.removeEventListener(
        "focus-webview-address-bar",
        handleFocusAddressBar
      )
    }
  }, [])

  // Check for OpenData adapters when URL changes
  useEffect(() => {
    if (!isDesktopMode || !url || !space) return

    const checkAdapters = async () => {
      setIsLoadingAdapters(true)
      try {
        console.log("[WebView] Checking adapters for:", { space, url })
        const adapters = await window.eidos.openData.findListAdapters(
          space,
          url
        )
        console.log("[WebView] findListAdapters result:", adapters)
        setMatchedAdapters(adapters)
        setHasOpenData(adapters.length > 0)
      } catch (error) {
        console.error("Failed to check OpenData adapters:", error)
      } finally {
        setIsLoadingAdapters(false)
      }
    }

    checkAdapters()
  }, [url, space])

  const handleNavigate = ({
    url,
    canGoBack,
    canGoForward,
  }: {
    url: string
    canGoBack: boolean
    canGoForward: boolean
  }) => {
    setDisplayUrl(url)
    committedUrlRef.current = url
    setCanGoBack(canGoBack)
    setCanGoForward(canGoForward)
  }

  const handleRawdataNavigation = (rawdataUrl: string) => {
    console.log("[WebView] rawdata navigation:", rawdataUrl)
    try {
      const urlObj = new URL(rawdataUrl)
      const host = urlObj.hostname
      const adapters = matchedAdaptersRef.current

      const matchingAdapter = adapters.find((a) => {
        const adapterDomain = a.domain?.toLowerCase()
        const adapterSite = a.site?.toLowerCase()
        const targetHost = host.toLowerCase()
        return (
          adapterDomain?.includes(targetHost) ||
          targetHost.includes(adapterDomain || "") ||
          adapterSite?.includes(targetHost) ||
          targetHost.includes(adapterSite || "")
        )
      })

      if (matchingAdapter) {
        setSelectedAdapter(matchingAdapter)
        setViewMode("table")
        setIsOpenDataOpen(false)
        toast({
          title: `Switched to ${matchingAdapter.name}`,
          description: `Viewing raw data for ${host}`,
        })
      } else {
        toast({
          title: "No adapter found",
          description: `No raw data adapter available for ${host}`,
          variant: "destructive",
        })
      }
    } catch (e) {
      console.error("[WebView] Failed to parse rawdata URL:", e)
    }
  }

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

  const handleOpenDevTools = () => {
    if (!isDesktopMode) return
    window.eidos.browserView.openDevTools(viewIdRef.current, { mode: "detach" })
  }

  const handleLoadUrl = () => {
    if (!isDesktopMode || !displayUrl.trim()) return
    let target = displayUrl.trim()

    if (/^rawdata:\/\//i.test(target)) {
      handleRawdataNavigation(target)
      return
    }

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

  const handleRunAdapter = (adapter: OpenDataAdapter) => {
    if (!space) return
    setSelectedAdapter(adapter)
    setViewMode("table")
    setIsOpenDataOpen(false)
  }

  const handleBackToBrowser = () => {
    setViewMode("browser")
    setSelectedAdapter(null)
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
        <WebviewToolbar
          viewId={viewIdRef.current}
          displayUrl={displayUrl}
          isLoading={isLoading}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          viewMode={viewMode}
          hasOpenData={hasOpenData}
          isLoadingAdapters={isLoadingAdapters}
          matchedAdapters={matchedAdapters}
          isOpenDataOpen={isOpenDataOpen}
          setIsOpenDataOpen={setIsOpenDataOpen}
          onDisplayUrlChange={setDisplayUrl}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReload={handleReload}
          onOpenDevTools={handleOpenDevTools}
          onLoadUrl={handleLoadUrl}
          onRunAdapter={handleRunAdapter}
          onBackToBrowser={handleBackToBrowser}
          addressBarRef={addressBarRef}
        />

        {viewMode === "browser" ? (
          <div className="relative flex flex-1 min-h-0">
            <div className="flex flex-1 min-h-0">
              <BrowserViewContainer
                viewId={viewIdRef.current}
                url={url}
                isActive={isActive}
                isAnyOverlayOpen={isAnyOverlayOpen}
                viewMode={viewMode}
                onNavigate={handleNavigate}
                onLoadingChange={setIsLoading}
                onRawdataNavigation={handleRawdataNavigation}
              />
            </div>
          </div>
        ) : selectedAdapter ? (
          <OpenDataTableView
            adapter={selectedAdapter}
            space={space}
            url={url}
          />
        ) : null}
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
