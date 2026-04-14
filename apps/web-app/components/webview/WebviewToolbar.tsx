import { useEffect, useRef } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Loader2,
  RefreshCcw,
  X,
} from "lucide-react"

import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useWebviewStore } from "@/apps/web-app/store/webview-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ViewMode } from "./types"
import { isDesktopMode } from "@/lib/env"

interface WebviewToolbarProps {
  // No props needed! Everything is cohesive
}

export function WebviewToolbar({}: WebviewToolbarProps) {
  const { tabId, isFocused } = useTabContext()

  const addressBarRef = useRef<HTMLInputElement>(null)
  const committedUrlRef = useRef<string>("")
  const state = useWebviewStore((s) => s.states[tabId])
  const setWebviewState = useWebviewStore((s) => s.setWebviewState)

  const {
    displayUrl = "",
    isLoading: isViewLoading = false,
    canGoBack = false,
    canGoForward = false,
    viewMode = "browser" as ViewMode,
  } = state || {}

  const isParsingReaderView = useWebviewStore(
    (s) => s.states[tabId]?.isParsingReaderView ?? false
  )
  const isLoading = isViewLoading || isParsingReaderView

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
      if (!isFocused) return

      // Blur the webview so focus returns to the main window and the address bar can be focused
      if (isDesktopMode) {
        window.eidos.browser.find?.blurWebview?.(tabId)
      }

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
  }, [isFocused])

  // Listen for toggle-find-in-page custom event from shortcuts.tsx
  useEffect(() => {
    if (!isDesktopMode) return

    const handleToggleFindInPage = async () => {
      // Only respond if this tab is the active tab
      if (!isFocused) return

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
  }, [isFocused, tabId])

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
  const handleLoadUrl = () => {
    if (!displayUrl.trim()) return
    let target = displayUrl.trim()

    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`
    }
    useWebviewStore.getState().loadURL(tabId, target)
  }

  const handleReload = () => {
    useWebviewStore.getState().reload(tabId)
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
    setWebviewState(tabId, { displayUrl: committedUrlRef.current })
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
