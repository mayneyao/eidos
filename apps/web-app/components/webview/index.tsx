"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Globe } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { useTabTitle } from "@/hooks/use-tab-title"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useToast } from "@/components/ui/use-toast"
import { BrowserViewContainer } from "./BrowserViewContainer"
import { RawDataTableView } from "./RawDataTableView"
import { RawDataAdapter, ViewMode } from "./types"
import { WebviewToolbar } from "./WebviewToolbar"

// Declare global event listener type
declare global {
  interface WindowEventMap {
    "focus-webview-address-bar": CustomEvent
  }
}

export function Webview({ url }: { url: string }) {
  // Use tabId as viewId to ensure 1:1 relationship between tab and webview
  // This prevents webview leakage when tab closes
  const { tabId } = useTabContext()
  const committedUrlRef = useRef<string>("")
  const addressBarRef = useRef<HTMLInputElement>(null)

  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [displayUrl, setDisplayUrl] = useState("")
  const [matchedAdapters, setMatchedAdapters] = useState<RawDataAdapter[]>([])
  const matchedAdaptersRef = useRef(matchedAdapters)
  const [hasRawData, setHasRawData] = useState(false)
  const [isLoadingAdapters, setIsLoadingAdapters] = useState(false)
  const [isRefreshingAdapter, setIsRefreshingAdapter] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("browser")
  const [selectedAdapter, setSelectedAdapter] = useState<RawDataAdapter | null>(
    null
  )

  // Use store state for rawdata popover so it triggers overlay detection
  const isRawDataOpen = useAppRuntimeStore(
    (state) => state.isRawDataPopoverOpen
  )
  const setIsRawDataOpen = useAppRuntimeStore(
    (state) => state.setRawDataPopoverOpen
  )

  const isAnyOverlayOpen = useAppRuntimeStore(
    (state) =>
      state.isCmdkOpen ||
      state.isKeyboardShortcutsOpen ||
      state.isSpaceSettingsOpen ||
      state.isGlobalSearchOpen ||
      state.isRawDataPopoverOpen ||
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

  // Check for RawData adapters when URL changes
  useEffect(() => {
    if (!isDesktopMode || !url || !space) return

    const checkAdapters = async () => {
      setIsLoadingAdapters(true)
      try {
        console.log("[WebView] Checking adapters for:", { space, url })
        const adapters = await window.eidos.rawData.findListAdapters(space, url)
        console.log("[WebView] findListAdapters result:", adapters)
        setMatchedAdapters(adapters)
        setHasRawData(adapters.length > 0)
      } catch (error) {
        console.error("Failed to check RawData adapters:", error)
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

    // Sync the navigation URL to the tab store so tab shows correct URL
    const updateTab = useTabStore.getState().updateTab
    updateTab(tabId, { url })
  }

  const handleRawDataNavigation = (rawDataUrl: string) => {
    console.log("[WebView] rawdata navigation:", rawDataUrl)
    try {
      const urlObj = new URL(rawDataUrl)
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
        setIsRawDataOpen(false)
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
    if (viewMode === "table" && selectedAdapter) {
      // In table view, reload triggers adapter refresh
      handleRefreshAdapter()
    } else {
      // In browser view, reload the webview
      if (!isDesktopMode) return
      window.eidos.browser.view.reload(tabId)
    }
  }

  const handleStop = () => {
    if (!isDesktopMode) return
    window.eidos.browser.view.stop(tabId)
  }

  const handleGoBack = () => {
    if (!isDesktopMode) return
    window.eidos.browser.view.goBack(tabId)
  }

  const handleGoForward = () => {
    if (!isDesktopMode) return
    window.eidos.browser.view.goForward(tabId)
  }

  const handleOpenDevTools = () => {
    if (!isDesktopMode) return
    window.eidos.browser.view.openDevTools(tabId, { mode: "detach" })
  }

  const handleLoadUrl = () => {
    if (!isDesktopMode || !displayUrl.trim()) return
    let target = displayUrl.trim()

    if (/^rawdata:\/\//i.test(target)) {
      handleRawDataNavigation(target)
      return
    }

    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`
    }
    window.eidos.browser.view.loadURL(tabId, target)
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

  const handleRunAdapter = (adapter: RawDataAdapter) => {
    if (!space) return

    // Switch to table view directly, the view will be created by RawDataTableView
    setSelectedAdapter(adapter)
    setViewMode("table")
    setIsRawDataOpen(false)
    // Update address bar to show rawdata: protocol
    setDisplayUrl(`rawdata:${url}`)

    toast({
      title: `Opening ${adapter.name}`,
      description: "Loading data view...",
    })
  }

  const handleBackToBrowser = () => {
    setViewMode("browser")
    setSelectedAdapter(null)
    // Restore original URL
    setDisplayUrl(committedUrlRef.current)
  }

  const handleRefreshAdapter = async () => {
    if (!space || !selectedAdapter) return

    setIsRefreshingAdapter(true)
    try {
      toast({
        title: `Syncing ${selectedAdapter.name}...`,
        description: "Fetching data from source...",
      })

      const result = await window.eidos.rawData.runAdapter(
        space,
        selectedAdapter.filePath,
        {}
      )

      toast({
        title: `${selectedAdapter.name} synced`,
        description: `Persisted ${result.persisted.agents} agents, ${result.persisted.goods} goods, ${result.persisted.relations} relations`,
      })

      // Force re-create view to refresh data
      // By toggling viewMode briefly
      setViewMode("browser")
      setTimeout(() => setViewMode("table"), 0)
    } catch (error) {
      console.error("Failed to refresh adapter:", error)
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsRefreshingAdapter(false)
    }
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
          viewId={tabId}
          displayUrl={displayUrl}
          isLoading={isLoading || isRefreshingAdapter}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          viewMode={viewMode}
          hasRawData={hasRawData}
          isLoadingAdapters={isLoadingAdapters}
          matchedAdapters={matchedAdapters}
          isRawDataOpen={isRawDataOpen}
          setIsRawDataOpen={setIsRawDataOpen}
          onDisplayUrlChange={setDisplayUrl}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReload={handleReload}
          onStop={handleStop}
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
                viewId={tabId}
                url={url}
                isActive={isActive}
                isAnyOverlayOpen={isAnyOverlayOpen}
                viewMode={viewMode}
                onNavigate={handleNavigate}
                onLoadingChange={setIsLoading}
                onRawdataNavigation={handleRawDataNavigation}
              />
            </div>
          </div>
        ) : selectedAdapter ? (
          <RawDataTableView adapter={selectedAdapter} space={space} url={url} />
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
