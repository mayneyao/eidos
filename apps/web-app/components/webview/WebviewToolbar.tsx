import type { Ref } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Database,
  Globe,
  Loader2,
  RefreshCcw,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { RawDataAdapter, ViewMode } from "./types"
import type { NativeMenuItem } from "@/components/ui/native-context-menu"

interface WebviewToolbarProps {
  viewId: string
  displayUrl: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  viewMode: ViewMode
  hasRawData: boolean
  isLoadingAdapters: boolean
  matchedAdapters: RawDataAdapter[]
  onDisplayUrlChange: (url: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur: () => void
  onGoBack: () => void
  onGoForward: () => void
  onReload: () => void
  onStop: () => void
  onOpenDevTools: () => void
  onLoadUrl: () => void
  onRunAdapter: (adapter: RawDataAdapter) => void
  onBackToBrowser: () => void
  addressBarRef?: Ref<HTMLInputElement>
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

export function WebviewToolbar({
  viewId,
  displayUrl,
  isLoading,
  canGoBack,
  canGoForward,
  viewMode,
  hasRawData,
  isLoadingAdapters,
  matchedAdapters,
  onDisplayUrlChange,
  onKeyDown,
  onBlur,
  onGoBack,
  onGoForward,
  onReload,
  onStop,
  onOpenDevTools,
  onLoadUrl,
  onRunAdapter,
  onBackToBrowser,
  addressBarRef,
}: WebviewToolbarProps) {
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
          onRunAdapter(matchedAdapters[adapterIndex])
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
        onClick={onGoBack}
        title="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!canGoForward}
        onClick={onGoForward}
        title="Forward"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
      {isLoading ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onStop}
          title="Stop"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onReload}
          title="Reload"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onOpenDevTools}
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
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={cn(
            "w-full bg-transparent text-xs outline-none transition-colors duration-200",
            isLoading ? "text-primary" : "text-muted-foreground"
          )}
        />
        {isLoading && (
          <div className="ml-2 h-1 w-16 overflow-hidden rounded-full bg-primary/20">
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          </div>
        )}
      </div>

      {viewMode === "table" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2"
          onClick={onBackToBrowser}
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="text-xs">Back to Browser</span>
        </Button>
      )}
    </div>
  )
}
