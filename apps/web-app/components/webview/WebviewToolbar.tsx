import { useEffect, useRef } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bug,
  Copy,
  Database,
  Globe,
  Loader2,
  RefreshCcw,
  X,
} from "lucide-react"

import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useWebviewStore } from "@/apps/web-app/store/webview-store"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import type { NativeMenuItem } from "@/components/ui/native-context-menu"
import type { RawDataAdapter, ViewMode } from "./types"
import { isDesktopMode } from "@/lib/env"

interface WebviewToolbarProps {
  // No props needed! Everything is cohesive
}

// Build native menu items for rawdata adapters
function buildRawDataMenuItems(adapters: RawDataAdapter[]): NativeMenuItem[] {
  if (adapters.length === 0) {
    return [
      { type: "text", label: "No adapters available", enabled: false },
      { type: "separator" },
      { type: "text", label: "Add adapters to .eidos/.rawdata/" },
    ]
  }

  const items: NativeMenuItem[] = [
    {
      type: "text",
      label: `Available Data (${adapters.length})`,
      enabled: false,
    },
    { type: "separator" },
  ]

  adapters.forEach((adapter, index) => {
    items.push({
      type: "text",
      label: adapter.name,
      enabled: true,
      id: `rawdata-adapter-${index}`,
    })
  })

  return items
}

export function WebviewToolbar({}: WebviewToolbarProps) {
  const { tabId } = useTabContext()
  const { space } = useCurrentPathInfo()
  const { toast } = useToast()

  const addressBarRef = useRef<HTMLInputElement>(null)
  const committedUrlRef = useRef<string>("")
  const state = useWebviewStore((s) => s.states[tabId])
  const setWebviewState = useWebviewStore((s) => s.setWebviewState)

  const {
    displayUrl = "",
    isLoading: isViewLoading = false,
    isRefreshingAdapter = false,
    isParsingReaderView = false,
    canGoBack = false,
    canGoForward = false,
    viewMode = "browser" as ViewMode,
    selectedAdapter = null as RawDataAdapter | null,
    hasRawData = false,
    isLoadingAdapters = false,
    matchedAdapters = [],
    isReaderViewMode = false,
    readerViewMarkdown = "",
  } = state || {}

  const isLoading = isViewLoading || isRefreshingAdapter || isParsingReaderView

  // Sync committed URL ref
  useEffect(() => {
    if (state?.displayUrl) {
      committedUrlRef.current = state.displayUrl
    }
  }, [state?.displayUrl])

  // Focus address bar listener
  useEffect(() => {
    const handleFocusAddressBar = () => {
      // Only respond if this tab is the active tab
      const activeTabId = useTabStore.getState().getActiveTabId()
      if (activeTabId !== tabId) return

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
  }, [tabId])

  // Listen for toggle-find-in-page custom event from shortcuts.tsx
  useEffect(() => {
    if (!isDesktopMode) return

    const handleToggleFindInPage = async () => {
      // Only respond if this tab is the active tab
      const activeTabId = useTabStore.getState().getActiveTabId()
      if (activeTabId !== tabId) return

      // Toggle find overlay
      const isOpen =
        await window.eidos?.browser?.find?.isFindOverlayOpen?.(tabId)
      if (isOpen) {
        await window.eidos?.browser?.find?.closeFindOverlay?.(tabId)
        useWebviewStore.getState().stopFindInPage(tabId)
      } else {
        await window.eidos?.browser?.find?.showFindOverlay?.(tabId, {
          findText: "",
          findMatches: 0,
          findActiveMatch: 0,
        })
      }
    }

    window.addEventListener("toggle-find-in-page", handleToggleFindInPage)

    return () => {
      window.removeEventListener("toggle-find-in-page", handleToggleFindInPage)
    }
  }, [tabId])

  // Listen for find overlay close from main process
  useEffect(() => {
    if (!isDesktopMode) return

    const handleFindClose = (eventViewId: string) => {
      if (eventViewId === tabId) {
        useWebviewStore.getState().stopFindInPage(tabId)
      }
    }

    const listenerId = window.eidos?.on?.(
      "browser.find:close",
      (_event: any, id: string) => handleFindClose(id)
    )

    return () => {
      if (listenerId) {
        window.eidos?.off?.("browser.find:close", listenerId)
      }
    }
  }, [tabId])

  const onDisplayUrlChange = (url: string) =>
    setWebviewState(tabId, { displayUrl: url })

  const handleGoBack = () => useWebviewStore.getState().goBack(tabId)
  const handleGoForward = () => useWebviewStore.getState().goForward(tabId)
  const handleStop = () => useWebviewStore.getState().stop(tabId)
  const handleOpenDevTools = () =>
    useWebviewStore.getState().openDevTools(tabId)

  const handleLoadUrl = () => {
    if (!displayUrl.trim()) return
    let target = displayUrl.trim()

    if (/^rawdata:\/\//i.test(target)) {
      const result = useWebviewStore.getState().navigateRawData(tabId, target)
      if (result.success) {
        toast({
          title: `Switched to ${result.adapter?.name}`,
          description: `Viewing raw data for ${result.host}`,
        })
      } else {
        toast({
          title: "No adapter found",
          description: `No raw data adapter available for ${result.host}`,
          variant: "destructive",
        })
      }
      return
    }

    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`
    }
    useWebviewStore.getState().loadURL(tabId, target)
  }

  const handleReload = () => {
    if (viewMode === "table" && selectedAdapter) {
      handleRunAdapter(selectedAdapter)
    } else {
      useWebviewStore.getState().reload(tabId)
    }
  }

  const handleRunAdapter = async (adapter: RawDataAdapter) => {
    if (!space) return

    const result = await useWebviewStore
      .getState()
      .runAdapter(tabId, space, adapter)
    if (result.success && result.result) {
      toast({
        title: `${adapter.name} synced`,
        description: `Persisted ${result.result.persisted.agents} agents, ${result.result.persisted.goods} goods, ${result.result.persisted.relations} relations`,
      })
    } else {
      toast({
        title: "Sync failed",
        description: result.error,
        variant: "destructive",
      })
    }
  }

  const handleToggleReaderView = async () => {
    if (isReaderViewMode) {
      useWebviewStore.getState().exitReaderView(tabId)
      return
    }

    const result = await useWebviewStore.getState().captureReaderView(tabId)
    if (!result.success) {
      toast({
        title: "Failed to parse content",
        description: result.error,
        variant: "destructive",
      })
    }
  }

  const handleCopyMarkdown = async () => {
    if (!readerViewMarkdown) return
    try {
      await navigator.clipboard.writeText(readerViewMarkdown)
      toast({
        title: "Copied",
        description: "Markdown copied to clipboard",
      })
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleBackToBrowser = () => {
    setWebviewState(tabId, {
      viewMode: "browser",
      selectedAdapter: null,
      displayUrl: committedUrlRef.current,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur()
      handleLoadUrl()
    }
  }

  const handleBlur = () => {
    // Don't reset displayUrl in reader view mode
    if (isReaderViewMode) return
    setWebviewState(tabId, { displayUrl: committedUrlRef.current })
  }

  const handleRawDataButtonClick = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!window.eidos?.showNativeMenu) return

    const rect = event.currentTarget.getBoundingClientRect()
    const menuItems = buildRawDataMenuItems(matchedAdapters)

    // Create a one-time click handler
    const clickHandler = (e: any, itemId: string) => {
      // Extract adapter index from item id (format: "rawdata-adapter-{index}")
      const match = itemId.match(/rawdata-adapter-(\d+)/)
      if (match) {
        const adapterIndex = parseInt(match[1], 10)
        if (matchedAdapters[adapterIndex]) {
          handleRunAdapter(matchedAdapters[adapterIndex])
        }
      }
      // Remove this listener
      if (listenerId) {
        window.eidos?.off?.("native-menu-click", listenerId)
      }
    }

    // Register listener and store the listener ID
    const listenerId = window.eidos.on("native-menu-click", clickHandler)

    try {
      await window.eidos.showNativeMenu(menuItems, {
        clientX: rect.left,
        clientY: rect.bottom + 4,
      })
    } catch (error) {
      console.error("Failed to show native menu:", error)
      // Clean up listener on error
      if (listenerId) {
        window.eidos?.off?.("native-menu-click", listenerId)
      }
    }
  }
  return (
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
      {isLoading ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleStop}
          title="Stop"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleReload}
          title="Reload"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleOpenDevTools}
        title="Open DevTools"
      >
        <Bug className="h-4 w-4" />
      </Button>
      {viewMode === "browser" && (
        <Button
          variant={hasRawData ? "default" : "ghost"}
          size="icon"
          className={cn(
            "h-7 w-7",
            hasRawData &&
              "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          disabled={isLoadingAdapters}
          onClick={handleRawDataButtonClick}
          title="Raw Data"
        >
          <Database className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant={isReaderViewMode ? "default" : "ghost"}
        size="icon"
        className={cn(
          "h-7 w-7",
          isReaderViewMode &&
            "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        onClick={handleToggleReaderView}
        title={isReaderViewMode ? "Show Web Page" : "Reader View"}
      >
        <BookOpen className="h-4 w-4" />
      </Button>
      {isReaderViewMode && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCopyMarkdown}
          title="Copy Markdown"
        >
          <Copy className="h-4 w-4" />
        </Button>
      )}
      <div
        className={cn(
          "mx-2 flex flex-1 items-center overflow-hidden rounded-md border px-2 py-1 transition-colors duration-200",
          isLoading
            ? "border-primary/50 bg-primary/5"
            : "border-input bg-muted/40"
        )}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-3 w-3 shrink-0 animate-spin text-primary" />
        ) : (
          <Globe className="mr-2 h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={addressBarRef}
          type="text"
          value={displayUrl}
          onChange={(e) => onDisplayUrlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Enter URL..."
        />
      </div>
      {viewMode === "table" && (
        <Button variant="outline" size="sm" onClick={handleBackToBrowser}>
          Back to Browser
        </Button>
      )}
    </div>
  )
}
