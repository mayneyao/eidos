import type { Ref } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Database,
  Globe,
  Loader2,
  RefreshCcw,
  Table2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { RawDataAdapter, ViewMode } from "./types"

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
  isRawDataOpen: boolean
  setIsRawDataOpen: (open: boolean) => void
  onDisplayUrlChange: (url: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur: () => void
  onGoBack: () => void
  onGoForward: () => void
  onReload: () => void
  onOpenDevTools: () => void
  onLoadUrl: () => void
  onRunAdapter: (adapter: RawDataAdapter) => void
  onBackToBrowser: () => void
  addressBarRef?: Ref<HTMLInputElement>
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
  isRawDataOpen,
  setIsRawDataOpen,
  onDisplayUrlChange,
  onKeyDown,
  onBlur,
  onGoBack,
  onGoForward,
  onReload,
  onOpenDevTools,
  onLoadUrl,
  onRunAdapter,
  onBackToBrowser,
  addressBarRef,
}: WebviewToolbarProps) {
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
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onReload}
        title="Reload"
      >
        <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onOpenDevTools}
        title="Open DevTools"
      >
        <Bug className="h-4 w-4" />
      </Button>
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

      {viewMode === "browser" && (
        <Popover open={isRawDataOpen} onOpenChange={setIsRawDataOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={hasRawData ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1.5 px-2",
                hasRawData &&
                  "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              disabled={isLoadingAdapters}
            >
              <Database className="h-3.5 w-3.5" />
              <span className="text-xs">Raw Data</span>
              {hasRawData && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px]">
                  {matchedAdapters.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0" sideOffset={4}>
            <div className="border-b px-3 py-2">
              <h4 className="text-sm font-medium">Available Data</h4>
              <p className="text-xs text-muted-foreground">
                {matchedAdapters.length > 0
                  ? "Raw data available for this site"
                  : "No raw data available for this site"}
              </p>
            </div>
            <ScrollArea className="h-[200px]">
              {matchedAdapters.length > 0 ? (
                <div className="p-1">
                  {matchedAdapters.map((adapter) => (
                    <button
                      key={`${adapter.site}-${adapter.name}`}
                      onClick={() => onRunAdapter(adapter)}
                      className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent"
                    >
                      <Table2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{adapter.name}</p>
                        {adapter.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {adapter.description}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                  <Database className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">
                    No adapters available for this domain.
                    <br />
                    Add adapters to{" "}
                    <code className="rounded bg-muted px-1">
                      .eidos/.rawdata/
                    </code>
                  </p>
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}

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
