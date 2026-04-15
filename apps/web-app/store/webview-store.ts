import { create } from "zustand"

import i18n from "@/locales/i18n"
import { isDesktopMode } from "@/lib/env"
import { useTabStore } from "@/apps/web-app/store/tabs"
import type {
  RawDataAdapter,
  ViewMode,
} from "@/apps/web-app/components/webview/types"

export interface WebviewState {
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  displayUrl: string
  matchedAdapters: RawDataAdapter[]
  hasRawData: boolean
  isLoadingAdapters: boolean
  isRefreshingAdapter: boolean
  viewMode: ViewMode
  selectedAdapter: RawDataAdapter | null
  pageTitle: string
  isReaderViewMode: boolean
  readerViewContent: string
  readerViewMarkdown: string
  isParsingReaderView: boolean
  readerViewOriginalUrl: string // Store original URL to return to after reader view
  // Find in page
  isFindInPageOpen: boolean
  findText: string
  findMatches: number
  findActiveMatch: number
  // RawData adapter sync
  adapterLogs: string[]
  adapterProgressHint: string | null
}

interface WebviewStore {
  states: Record<string, WebviewState>
  setWebviewState: (
    tabId: string,
    updates:
      | Partial<WebviewState>
      | ((prev: WebviewState) => Partial<WebviewState>)
  ) => void
  clearWebviewState: (tabId: string) => void

  // Basic Navigation Actions
  goBack: (tabId: string) => void
  goForward: (tabId: string) => void
  reload: (tabId: string) => void
  stop: (tabId: string) => void
  openDevTools: (tabId: string) => void
  loadURL: (tabId: string, url: string) => void

  // Logic Actions
  refreshAdapters: (tabId: string, space: string, url: string) => Promise<void>
  captureReaderView: (
    tabId: string
  ) => Promise<{ success: boolean; error?: string }>
  exitReaderView: (tabId: string) => void
  runAdapter: (
    tabId: string,
    space: string,
    adapter: RawDataAdapter
  ) => Promise<{ success: boolean; error?: string; result?: any }>
  enterRawDataView: (
    tabId: string,
    space: string,
    adapterPath: string
  ) => Promise<{
    success: boolean
    adapter?: RawDataAdapter
    error?: string
  }>
  navigateRawData: (
    tabId: string,
    rawDataUrl: string
  ) => {
    success: boolean
    host?: string
    adapter?: RawDataAdapter
    error?: string
  }
  onNavigate: (
    tabId: string,
    url: string,
    canGoBack: boolean,
    canGoForward: boolean
  ) => void

  // Find in Page Actions
  findInPage: (
    tabId: string,
    text: string,
    options?: { forward?: boolean; findNext?: boolean }
  ) => void
  stopFindInPage: (tabId: string) => void
  onFindInPageResult: (
    tabId: string,
    result: { requestId: number; activeMatchOrdinal: number; matches: number }
  ) => void
}

export const defaultWebviewState: WebviewState = {
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  displayUrl: "",
  matchedAdapters: [],
  hasRawData: false,
  isLoadingAdapters: false,
  isRefreshingAdapter: false,
  viewMode: "browser",
  selectedAdapter: null,
  pageTitle: "",
  isReaderViewMode: false,
  readerViewContent: "",
  readerViewMarkdown: "",
  isParsingReaderView: false,
  readerViewOriginalUrl: "",
  // Find in page
  isFindInPageOpen: false,
  findText: "",
  findMatches: 0,
  findActiveMatch: 0,
  // RawData adapter sync
  adapterLogs: [],
  adapterProgressHint: null,
}

export const useWebviewStore = create<WebviewStore>((set, get) => ({
  states: {},
  setWebviewState: (tabId, updates) =>
    set((state) => {
      const currentState = state.states[tabId] || defaultWebviewState
      const nextUpdates =
        typeof updates === "function" ? updates(currentState) : updates
      return {
        states: {
          ...state.states,
          [tabId]: { ...currentState, ...nextUpdates },
        },
      }
    }),
  clearWebviewState: (tabId) =>
    set((state) => {
      const newStates = { ...state.states }
      delete newStates[tabId]
      return { states: newStates }
    }),

  goBack: (tabId) => {
    if (!isDesktopMode) return
    // If in reader view mode, exit it first
    const state = get().states[tabId]
    if (state?.isReaderViewMode) {
      get().exitReaderView(tabId)
      return
    }
    window.eidos?.browser?.view?.goBack(tabId)
  },
  exitReaderView: (tabId) => {
    if (!isDesktopMode) return
    const state = get().states[tabId]
    if (!state?.isReaderViewMode) return

    // Use the saved original URL, not the current displayUrl (which is eidos-read://...)
    const originalUrl = state.readerViewOriginalUrl || state.displayUrl || ""
    window.eidos?.browser?.view?.exitReaderView(tabId, originalUrl)
    get().setWebviewState(tabId, {
      isReaderViewMode: false,
      readerViewOriginalUrl: "",
    })
  },
  goForward: (tabId) => {
    if (!isDesktopMode) return
    window.eidos?.browser?.view?.goForward(tabId)
  },
  reload: (tabId) => {
    if (!isDesktopMode) return
    window.eidos?.browser?.view?.reload(tabId)
  },
  stop: (tabId) => {
    if (!isDesktopMode) return
    window.eidos?.browser?.view?.stop(tabId)
  },
  openDevTools: (tabId) => {
    if (!isDesktopMode) return
    window.eidos?.browser?.view?.openDevTools(tabId, { mode: "detach" })
  },
  loadURL: (tabId, url) => {
    if (!isDesktopMode) return
    window.eidos?.browser?.view?.loadURL(tabId, url)
  },

  refreshAdapters: async (tabId, space, url) => {
    if (!isDesktopMode || !url || !space) return

    get().setWebviewState(tabId, { isLoadingAdapters: true })
    try {
      const adapters = await window.eidos.rawData.findListAdapters(space, url)
      get().setWebviewState(tabId, {
        matchedAdapters: adapters,
        hasRawData: adapters.length > 0,
      })
    } catch (error) {
      console.error("Failed to check RawData adapters:", error)
    } finally {
      get().setWebviewState(tabId, { isLoadingAdapters: false })
    }
  },

  captureReaderView: async (tabId) => {
    if (!isDesktopMode) return { success: false, error: "Not in desktop mode" }

    const state = get().states[tabId]
    const originalUrl = state?.displayUrl || ""

    get().setWebviewState(tabId, { isParsingReaderView: true })
    try {
      // First, capture the content from current page
      const result = await window.eidos.browser.view.captureAsReaderView(tabId)
      if (result.success && result.content) {
        // Set isReaderViewMode BEFORE opening reader view to prevent
        // onNavigate from updating displayUrl with the eidos-read:// URL
        get().setWebviewState(tabId, {
          isReaderViewMode: true,
          readerViewMarkdown: result.contentMarkdown || "",
          readerViewOriginalUrl: originalUrl,
        })

        // Open reader view in the BrowserView via custom protocol
        const openResult = await window.eidos.browser.view.openReaderView(
          tabId,
          {
            html: result.content,
            title: result.title || "Reader View",
            originalUrl: originalUrl,
            markdown: result.contentMarkdown,
          }
        )

        if (!openResult.success) {
          // Reset reader view mode if failed
          get().setWebviewState(tabId, {
            isReaderViewMode: false,
            readerViewOriginalUrl: "",
          })
          return {
            success: false,
            error: openResult.error || "Failed to open reader view",
          }
        }

        return { success: true }
      } else {
        return {
          success: false,
          error: result.error || "Could not extract content",
        }
      }
    } catch (error) {
      console.error("Failed to capture reader view:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    } finally {
      get().setWebviewState(tabId, { isParsingReaderView: false })
    }
  },

  runAdapter: async (tabId, space, adapter) => {
    get().setWebviewState(tabId, {
      isRefreshingAdapter: true,
      adapterLogs: [],
      adapterProgressHint: i18n.t("rawdata.firstSyncHint"),
    })

    const onLog = (
      _event: any,
      data: { adapterPath: string; message: string }
    ) => {
      if (data.adapterPath !== adapter.filePath) return
      get().setWebviewState(tabId, (prev) => ({
        adapterLogs: [...prev.adapterLogs, data.message].slice(-50),
      }))
    }

    const onProgress = (
      _event: any,
      data: {
        adapterPath: string
        status: string
        hint?: string
        error?: string
      }
    ) => {
      if (data.adapterPath !== adapter.filePath) return
      if (data.hint) {
        get().setWebviewState(tabId, { adapterProgressHint: data.hint })
      }
      if (data.status === "error" && data.error) {
        get().setWebviewState(tabId, {
          adapterProgressHint: data.error,
          adapterLogs: [
            ...(get().states[tabId]?.adapterLogs || []),
            i18n.t("rawdata.log.error", { message: data.error }),
          ].slice(-50),
        })
      }
    }

    const logListenerId = window.eidos?.on?.("rawdata:log", onLog)
    const progressListenerId = window.eidos?.on?.(
      "rawdata:progress",
      onProgress
    )

    try {
      const result = await window.eidos.rawData.runAdapter(
        space,
        adapter.filePath,
        {}
      )

      // Preserve the full adapter object (including queries) if available
      const fullAdapter =
        get().states[tabId]?.matchedAdapters.find(
          (a) => a.filePath === adapter.filePath
        ) || adapter

      // Force re-create view to refresh data by toggling viewMode briefly
      get().setWebviewState(tabId, { viewMode: "browser" })
      setTimeout(
        () =>
          get().setWebviewState(tabId, {
            viewMode: "table",
            selectedAdapter: fullAdapter,
            adapterProgressHint: null,
          }),
        0
      )

      return { success: true, result }
    } catch (error) {
      console.error("Failed to refresh adapter:", error)
      // Keep viewMode unchanged on error to avoid remount loop
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    } finally {
      if (logListenerId) window.eidos?.off?.("rawdata:log", logListenerId)
      if (progressListenerId)
        window.eidos?.off?.("rawdata:progress", progressListenerId)
      get().setWebviewState(tabId, { isRefreshingAdapter: false })
    }
  },

  enterRawDataView: async (tabId, space, adapterPath) => {
    try {
      const adapters = await window.eidos.rawData.getAdapters(space)
      const found = adapters.find((a) => a.path === adapterPath)
      if (!found) {
        return {
          success: false,
          error: `Adapter not found: ${adapterPath}`,
        }
      }
      const adapter: RawDataAdapter = {
        site: found.adapter.meta.site,
        name: found.adapter.meta.name,
        description: found.adapter.meta.description,
        domain: found.adapter.meta.domain,
        filePath: found.path,
        queries: found.adapter.queries,
      }

      get().setWebviewState(tabId, {
        viewMode: "table",
        selectedAdapter: adapter,
      })
      return { success: true, adapter }
    } catch (error) {
      console.error("Failed to enter raw data view:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  },

  navigateRawData: (tabId, rawDataUrl) => {
    console.log("[WebViewStore] navigateRawData:", rawDataUrl)
    try {
      const urlObj = new URL(rawDataUrl)
      const host = urlObj.hostname
      const { matchedAdapters } = get().states[tabId] || defaultWebviewState

      const matchingAdapter = matchedAdapters.find((a) => {
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
        get().setWebviewState(tabId, {
          selectedAdapter: matchingAdapter,
          viewMode: "table",
        })
        return { success: true, host, adapter: matchingAdapter }
      }
      return { success: false, host }
    } catch (e) {
      console.error("[WebViewStore] Failed to parse rawdata URL:", e)
      return { success: false, error: "Failed to parse URL" }
    }
  },

  onNavigate: (tabId, url, canGoBack, canGoForward) => {
    const state = get().states[tabId]

    // Never update URL if it's the reader view protocol URL
    if (url.startsWith("eidos-read://")) {
      // Still update navigation state for goBack/goForward
      get().setWebviewState(tabId, { canGoBack, canGoForward })
      return
    }

    // Don't update displayUrl when in reader view mode
    // But still update canGoBack/canGoForward for navigation state
    if (state?.isReaderViewMode) {
      get().setWebviewState(tabId, { canGoBack, canGoForward })
      return
    }

    get().setWebviewState(tabId, { displayUrl: url, canGoBack, canGoForward })
    // Sync the navigation URL to the tab store so tab shows correct URL
    useTabStore.getState().updateTab(tabId, { url })
  },

  // Find in Page Actions
  findInPage: (tabId, text, options) => {
    if (!isDesktopMode) return
    if (!text) {
      get().stopFindInPage(tabId)
      return
    }
    window.eidos?.browser?.view?.findInPage(tabId, text, options)
  },

  stopFindInPage: (tabId) => {
    if (!isDesktopMode) return
    window.eidos?.browser?.view?.stopFindInPage(tabId)
    get().setWebviewState(tabId, {
      findMatches: 0,
      findActiveMatch: 0,
    })
  },

  onFindInPageResult: (tabId, result) => {
    get().setWebviewState(tabId, {
      findMatches: result.matches,
      findActiveMatch: result.activeMatchOrdinal,
    })
  },
}))

export const getWebviewState = (tabId: string) => {
  return useWebviewStore.getState().states[tabId] || defaultWebviewState
}
