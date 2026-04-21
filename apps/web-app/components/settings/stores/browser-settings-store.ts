import { create } from "zustand"

import { isDesktopMode } from "@/lib/env"

// Re-export types from backend
export interface SearchEngineConfig {
  id: string
  name: string
  url: string
  shortcut?: string
}

// Hard-coded built-in search engines (not saved to config)
export const BUILT_IN_SEARCH_ENGINES: SearchEngineConfig[] = [
  {
    id: "google",
    name: "Google",
    url: "https://www.google.com/search?q={query}",
    shortcut: "google.com",
  },
]

export interface BrowserConfig {
  defaultSearchEngine: string
  openLinksInBuiltInBrowser: boolean
  customSearchEngines: SearchEngineConfig[]
  enableRawData: boolean
}

const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  defaultSearchEngine: "google",
  openLinksInBuiltInBrowser: true,
  customSearchEngines: [],
  enableRawData: false,
}

interface BrowserSettingsState {
  config: BrowserConfig
  isLoading: boolean
  initialize: () => Promise<void>
  setDefaultSearchEngine: (engineId: string) => Promise<void>
  setOpenLinksInBuiltInBrowser: (value: boolean) => Promise<void>
  setEnableRawData: (value: boolean) => Promise<void>
  addCustomSearchEngine: (engine: SearchEngineConfig) => Promise<void>
  updateCustomSearchEngine: (engine: SearchEngineConfig) => Promise<void>
  removeCustomSearchEngine: (engineId: string) => Promise<void>
}

// Helper to get config from backend
const getConfig = async (): Promise<BrowserConfig> => {
  if (isDesktopMode && window.eidos?.config?.get) {
    try {
      const browserConfig = await window.eidos.config.get("browser")
      return {
        ...DEFAULT_BROWSER_CONFIG,
        ...browserConfig,
        customSearchEngines: browserConfig?.customSearchEngines || [],
      }
    } catch (error) {
      console.error("Failed to load browser config:", error)
    }
  }
  // Fallback to localStorage for web mode
  const saved = localStorage.getItem("browser-settings")
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      return { ...DEFAULT_BROWSER_CONFIG, ...parsed }
    } catch {
      // ignore
    }
  }
  return DEFAULT_BROWSER_CONFIG
}

// Helper to save config to backend
const saveConfig = async (config: BrowserConfig): Promise<void> => {
  if (isDesktopMode && window.eidos?.config?.set) {
    try {
      await window.eidos.config.set("browser", config)
      return
    } catch (error) {
      console.error("Failed to save browser config:", error)
    }
  }
  // Fallback to localStorage for web mode
  localStorage.setItem("browser-settings", JSON.stringify(config))
}

export const useBrowserSettingsStore = create<BrowserSettingsState>(
  (set, get) => ({
    config: DEFAULT_BROWSER_CONFIG,
    isLoading: false,

    initialize: async () => {
      set({ isLoading: true })
      try {
        const config = await getConfig()
        set({ config })
      } finally {
        set({ isLoading: false })
      }
    },

    setDefaultSearchEngine: async (engineId: string) => {
      const current = get().config
      const newConfig = { ...current, defaultSearchEngine: engineId }
      await saveConfig(newConfig)
      set({ config: newConfig })
    },

    setOpenLinksInBuiltInBrowser: async (value: boolean) => {
      const current = get().config
      const newConfig = { ...current, openLinksInBuiltInBrowser: value }
      await saveConfig(newConfig)
      set({ config: newConfig })
    },

    setEnableRawData: async (value: boolean) => {
      const current = get().config
      const newConfig = { ...current, enableRawData: value }
      await saveConfig(newConfig)
      set({ config: newConfig })
    },

    addCustomSearchEngine: async (engine: SearchEngineConfig) => {
      const current = get().config
      const newConfig = {
        ...current,
        customSearchEngines: [...current.customSearchEngines, engine],
      }
      await saveConfig(newConfig)
      set({ config: newConfig })
    },

    updateCustomSearchEngine: async (engine: SearchEngineConfig) => {
      const current = get().config
      const newConfig = {
        ...current,
        customSearchEngines: current.customSearchEngines.map((e) =>
          e.id === engine.id ? engine : e
        ),
      }
      await saveConfig(newConfig)
      set({ config: newConfig })
    },

    removeCustomSearchEngine: async (engineId: string) => {
      const current = get().config
      const newConfig = {
        ...current,
        customSearchEngines: current.customSearchEngines.filter(
          (e) => e.id !== engineId
        ),
        // If removing the default, reset to first built-in
        defaultSearchEngine:
          current.defaultSearchEngine === engineId
            ? BUILT_IN_SEARCH_ENGINES[0]?.id || "google"
            : current.defaultSearchEngine,
      }
      await saveConfig(newConfig)
      set({ config: newConfig })
    },
  })
)

// Get all search engines (built-in + custom)
export function getAllSearchEngines(
  config: BrowserConfig
): SearchEngineConfig[] {
  return [...BUILT_IN_SEARCH_ENGINES, ...config.customSearchEngines]
}

// Get search URL for a specific engine
export function getSearchUrl(
  engineId: string,
  query: string,
  config: BrowserConfig
): string {
  const engines = getAllSearchEngines(config)
  const engine = engines.find((e) => e.id === engineId)
  if (engine) {
    return engine.url.replace("{query}", encodeURIComponent(query))
  }
  // Fallback to Google
  return BUILT_IN_SEARCH_ENGINES[0].url.replace(
    "{query}",
    encodeURIComponent(query)
  )
}

// Get default search engine config
export function getDefaultSearchEngine(
  config: BrowserConfig
): SearchEngineConfig {
  const engines = getAllSearchEngines(config)
  return (
    engines.find((e) => e.id === config.defaultSearchEngine) ||
    engines[0] ||
    BUILT_IN_SEARCH_ENGINES[0]
  )
}
