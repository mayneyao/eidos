import { useCallback, useEffect, useState } from "react"

import { ThemeRegistryItem } from "@/apps/desktop/src/services/theme-market"
import { getThemeMarket } from "@/apps/desktop/src/services/theme-market"

const market = getThemeMarket()

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
    setIsLoading(true)
    setError(null)
    try {
      const list = await market.list()
      setThemes(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load themes")
    } finally {
      setIsLoading(false)
    }
  }, [])

  const downloadTheme = useCallback(async (repo: string) => {
    return await market.download(repo)
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
