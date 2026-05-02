import { useToast } from "@/components/ui/use-toast"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import {
  useWebviewStore,
  defaultWebviewState,
} from "@/apps/web-app/store/webview-store"
import { BrowserViewContainer } from "./BrowserViewContainer"
import { RawDataTableView } from "./RawDataTableView"

export function WebviewContent({ url }: { url: string }) {
  const { tabId, isActive } = useTabContext()
  const { space } = useCurrentPathInfo()
  const { toast } = useToast()
  const state = useWebviewStore((s) => s.states[tabId])
  const setWebviewState = useWebviewStore((s) => s.setWebviewState)

  const { viewMode, isReaderViewMode, selectedAdapter } =
    state || defaultWebviewState

  const isAnyOverlayOpen = useAppRuntimeStore(
    (state) =>
      state.isCmdkOpen ||
      state.isKeyboardShortcutsOpen ||
      state.isGlobalSearchOpen ||
      state.isDeleteDialogOpen ||
      state.isMoveToFolderOpen
  )

  // Note: Reader view is now rendered inside BrowserView via eidos-read:// protocol
  // We still render BrowserViewContainer when in reader view mode
  if (viewMode === "browser" || isReaderViewMode) {
    return (
      <div className="relative flex flex-1 min-h-0">
        <BrowserViewContainer
          viewId={tabId}
          url={url}
          space={space}
          isActive={isActive}
          isAnyOverlayOpen={isAnyOverlayOpen}
          viewMode={
            isReaderViewMode
              ? "browser"
              : viewMode === "table"
                ? "table"
                : "browser"
          }
          isReaderViewMode={isReaderViewMode}
          onNavigate={({ url, canGoBack, canGoForward }) => {
            useWebviewStore
              .getState()
              .onNavigate(tabId, url, canGoBack, canGoForward)
          }}
          onLoadingChange={(loading) =>
            setWebviewState(tabId, { isLoading: loading })
          }
          onRawdataNavigation={async (target, adapterPath) => {
            // Check if raw data is enabled
            const browserConfig = await window.eidos?.config?.get("browser")
            if (!browserConfig?.enableRawData) {
              toast({
                title: "Raw Data is disabled",
                description:
                  "Enable it in Settings > Browser to use this feature.",
                variant: "destructive",
              })
              return
            }
            if (adapterPath && space) {
              const result = await useWebviewStore
                .getState()
                .enterRawDataView(tabId, space, adapterPath)
              if (!result.success) {
                toast({
                  title: "Failed to enter raw data view",
                  description: result.error,
                  variant: "destructive",
                })
              }
            } else {
              const result = useWebviewStore
                .getState()
                .navigateRawData(tabId, target)
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
            }
          }}
          onTitleChange={(title) =>
            setWebviewState(tabId, { pageTitle: title })
          }
        />
      </div>
    )
  }

  if (selectedAdapter && space) {
    return (
      <div className="relative flex flex-1 min-h-0">
        <RawDataTableView adapter={selectedAdapter} space={space} url={url} />
      </div>
    )
  }

  return null
}
