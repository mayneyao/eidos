import { useCallback, useEffect, useState } from "react"

// Interface for theme registry items from desktop service
export interface ThemeRegistryItem {
  name: string
  author: string
  repo: string
  screenshot: string
  modes: ("light" | "dark")[]
  legacy?: boolean
}

// Extended theme type with UI state
export interface ThemeWithStatus extends ThemeRegistryItem {
  isInstalled?: boolean
  isActive?: boolean
  isLocal?: boolean
}

export function useThemeMarket() {
  const [themes, setThemes] = useState<ThemeRegistryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadThemes = useCallback(async () => {
    // Only available in desktop environment
    if (!window.eidos?.market) {
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const list = await window.eidos.market.list()
      setThemes(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load themes")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const downloadTheme = useCallback(async (repo: string) => {
    if (!window.eidos?.market) {
      return null
    }
    return await window.eidos.market.download(repo)
  }, [])

  useEffect(() => {
    loadThemes()
  }, [loadThemes])

  return {
    themes,
    isLoading,
    error,
    refresh: loadThemes,
    downloadTheme,
  }
}
