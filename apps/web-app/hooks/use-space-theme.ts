import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { handleApplyTheme } from "@/apps/web-app/hooks/use-apply-theme-by-name"
import { useTheme } from "@/components/theme-provider"
import defaultThemeCss from "@/styles/themes/default.css?raw"

// Global flag to ensure theme is only auto-loaded once per app session
let globalThemeInitialized = false

interface ThemeCache {
  currentTheme: string | null
  themes: string[]
  currentThemeCss: string | null
  timestamp: number
}

const CACHE_KEY_PREFIX = "eidos:theme:"
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useSpaceTheme() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { sqlite } = useSqlite()
  const { space } = useCurrentPathInfo()
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === "dark"

  const [themes, setThemes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [cacheVersion, setCacheVersion] = useState(0) // Force re-compute when cache changes

  const cacheKey = `${CACHE_KEY_PREFIX}${space}`

  // Get cache from localStorage
  const getCache = useCallback((): ThemeCache | null => {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return null
      const data = JSON.parse(cached) as ThemeCache
      if (Date.now() - data.timestamp > CACHE_TTL) {
        localStorage.removeItem(cacheKey)
        return null
      }
      return data
    } catch {
      return null
    }
  }, [cacheKey])

  // Set cache to localStorage
  const setCache = useCallback(
    (data: ThemeCache) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data))
        setCacheVersion((v) => v + 1) // Trigger re-compute
      } catch (e) {
        console.error("Failed to cache theme:", e)
      }
    },
    [cacheKey]
  )

  // Clear cache
  const clearCache = useCallback(() => {
    localStorage.removeItem(cacheKey)
    setCacheVersion((v) => v + 1)
  }, [cacheKey])

  // Current theme from cache (source of truth)
  const currentTheme = useMemo(() => {
    return getCache()?.currentTheme ?? null
  }, [getCache, cacheVersion]) // Re-compute when cache changes

  // Load theme list
  const loadThemes = useCallback(async () => {
    if (!sqlite) return
    setIsLoading(true)
    try {
      const list = await sqlite.theme.list()
      setThemes(list)
    } catch (error) {
      console.error("Failed to load themes:", error)
    } finally {
      setIsLoading(false)
    }
  }, [sqlite])

  // Get theme CSS from DB
  const getThemeCss = useCallback(
    async (name: string): Promise<string | null> => {
      if (!sqlite) return null
      return await sqlite.theme.get(name)
    },
    [sqlite]
  )

  // Apply a theme by name and save to KV (user action)
  const applyTheme = useCallback(
    async (name: string | null) => {
      if (!sqlite) return

      if (!name) {
        // Apply default theme
        handleApplyTheme(defaultThemeCss, isDarkMode)
        await sqlite.theme.setCurrent(null)
        clearCache()
        return
      }

      try {
        const css = await getThemeCss(name)
        if (!css) {
          toast({
            title: t("theme.notFound", "Theme not found"),
            variant: "destructive",
          })
          return
        }

        handleApplyTheme(css, isDarkMode)
        await sqlite.theme.setCurrent(name)

        // Update cache with current theme CSS
        setCache({
          currentTheme: name,
          themes,
          currentThemeCss: css,
          timestamp: Date.now(),
        })
      } catch (error) {
        console.error("Failed to apply theme:", error)
        toast({
          title: t("theme.applyError", "Failed to apply theme"),
          variant: "destructive",
        })
      }
    },
    [sqlite, isDarkMode, toast, t, getThemeCss, themes, clearCache, setCache]
  )

  // Install a new theme
  const installTheme = useCallback(
    async (name: string, css: string) => {
      if (!sqlite) return

      try {
        await sqlite.theme.install(name, css)
        await loadThemes()
        toast({
          title: t("theme.installed", "Theme installed"),
          description: name,
        })
      } catch (error) {
        console.error("Failed to install theme:", error)
        toast({
          title: t("theme.installError", "Failed to install theme"),
          variant: "destructive",
        })
      }
    },
    [sqlite, loadThemes, toast, t]
  )

  // Uninstall a theme
  const uninstallTheme = useCallback(
    async (name: string) => {
      if (!sqlite) return

      try {
        await sqlite.theme.uninstall(name)
        await loadThemes()

        if (currentTheme === name) {
          await applyTheme(null)
        }

        toast({
          title: t("theme.uninstalled", "Theme uninstalled"),
          description: name,
        })
      } catch (error) {
        console.error("Failed to uninstall theme:", error)
        toast({
          title: t("theme.uninstallError", "Failed to uninstall theme"),
          variant: "destructive",
        })
      }
    },
    [sqlite, currentTheme, applyTheme, loadThemes, toast, t]
  )

  // Auto-load theme list on mount for every instance
  useEffect(() => {
    if (!sqlite) return
    loadThemes()
  }, [sqlite, loadThemes])

  // Global theme auto-apply on first mount
  useEffect(() => {
    if (!sqlite || globalThemeInitialized) return

    const initApply = async () => {
      try {
        // Try cache first for instant UI
        const cached = getCache()
        if (cached?.currentTheme && cached.currentThemeCss) {
          handleApplyTheme(cached.currentThemeCss, isDarkMode)
        }

        // Then fetch from DB to ensure meta is fresh
        const name = await sqlite.theme.getCurrent()
        if (name) {
          const css = await sqlite.theme.get(name)
          if (css) {
            handleApplyTheme(css, isDarkMode)
            setCache({
              currentTheme: name,
              themes: [], // This will be updated by the other effect
              currentThemeCss: css,
              timestamp: Date.now(),
            })
          }
        }

        globalThemeInitialized = true
      } catch (error) {
        console.error("Failed to initialize theme CSS:", error)
      }
    }

    initApply()
  }, [sqlite, isDarkMode, getCache, setCache])

  // Re-apply theme when dark mode changes
  useEffect(() => {
    if (!currentTheme || !sqlite || !globalThemeInitialized) return

    const reapply = async () => {
      // Try cache first
      const cached = getCache()
      if (cached?.currentTheme === currentTheme && cached.currentThemeCss) {
        handleApplyTheme(cached.currentThemeCss, isDarkMode)
        return
      }

      // Fallback to DB
      const css = await sqlite.theme.get(currentTheme)
      if (css) {
        handleApplyTheme(css, isDarkMode)
        setCache({
          currentTheme,
          themes,
          currentThemeCss: css,
          timestamp: Date.now(),
        })
      }
    }

    reapply()
  }, [isDarkMode, currentTheme, sqlite, getCache, setCache, themes])

  return {
    currentTheme,
    themes,
    isLoading,
    applyTheme,
    installTheme,
    uninstallTheme,
    getThemeCss,
    refreshThemes: loadThemes,
  }
}
