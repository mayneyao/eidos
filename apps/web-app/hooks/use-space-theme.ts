import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { handleApplyTheme } from "@/apps/web-app/hooks/use-apply-theme-by-name"
import { useTheme } from "@/components/theme-provider"
import defaultThemeCss from "@/styles/themes/default.css?raw"
import {
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
  type EidosDataEventChannelMsg,
  DataUpdateSignalType,
} from "@/lib/const"
import { KVTableName } from "@/packages/core/sqlite/const"
import {
  extractThemeColors,
  generateFallbackColors,
} from "@/apps/web-app/lib/theme-color-parser"

// Local set to track initialized spaces in current app session
const initializedSpaces = new Set<string>()

// Simple listener system to sync multiple instances of useSpaceTheme
const themeListeners = new Set<() => void>()
const notifyThemeChange = () => themeListeners.forEach((l) => l())

interface ThemeCache {
  currentTheme: string | null
  themes: string[]
  currentThemeCss: string | null
  timestamp: number
}

const CACHE_KEY_PREFIX = "eidos:theme:"

// Color cache for theme previews (memory only, not persisted)
const themeColorCache = new Map<string, string[]>()

export function useSpaceTheme() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { sqlite } = useSqlite()
  const { space } = useCurrentPathInfo()
  const { resolvedTheme } = useTheme()
  const isDarkMode = resolvedTheme === "dark"

  const [themes, setThemes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [cacheVersion, setCacheVersion] = useState(0) // Local trigger
  const [syncVersion, setSyncVersion] = useState(0) // Global trigger
  const [colorCacheVersion, setColorCacheVersion] = useState(0) // Trigger re-render when colors loaded

  // Subscribe to global theme changes (in-app memory)
  useEffect(() => {
    // Inner-app listener
    const l = () => setSyncVersion((v) => v + 1)
    themeListeners.add(l)
    return () => {
      themeListeners.delete(l)
    }
  }, [])

  const cacheKey = `${CACHE_KEY_PREFIX}${space}`

  // Get cache from localStorage
  const getCache = useCallback((): ThemeCache | null => {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return null
      return JSON.parse(cached) as ThemeCache
    } catch {
      return null
    }
  }, [cacheKey])

  // Set cache to localStorage
  const setCache = useCallback(
    (data: ThemeCache) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data))
        setCacheVersion((v) => v + 1) // Trigger re-compute locally
        notifyThemeChange() // Trigger re-compute in other instances
      } catch (e) {
        console.error("Failed to cache theme:", e)
      }
    },
    [cacheKey]
  )

  // Subscribe to cross-tab and CLI sync via database events
  useEffect(() => {
    if (!space || !sqlite) return

    const bc = new BroadcastChannel(EidosDataEventChannelName)
    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old } = payload
        const key = _new?.key || _old?.key
        if (table === KVTableName && key === "eidos:space:config:theme") {
          // Changed via CLI or other process
          const name = await sqlite.theme.getCurrent()
          if (name) {
            const css = await sqlite.theme.get(name)
            if (css) {
              setCache({
                currentTheme: name,
                themes: [], // will be refreshed by hooks
                currentThemeCss: css,
                timestamp: Date.now(),
              })
            } else {
              // css missing, reset
              localStorage.removeItem(`${CACHE_KEY_PREFIX}${space}`)
              setCacheVersion((v) => v + 1)
              setSyncVersion((v) => v + 1)
            }
          } else {
            // Null theme means reset
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${space}`)
            setCacheVersion((v) => v + 1)
            setSyncVersion((v) => v + 1)
          }
        }
      }
    }
    bc.addEventListener("message", handler)

    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [sqlite, space, setCache])

  // Clear cache
  const clearCache = useCallback(() => {
    localStorage.removeItem(cacheKey)
    setCacheVersion((v) => v + 1)
    notifyThemeChange()
  }, [cacheKey])

  // Current theme from cache (source of truth)
  const currentTheme = useMemo(() => {
    return getCache()?.currentTheme ?? null
  }, [getCache, cacheVersion, syncVersion]) // Re-compute when cache or global sync changes

  // Current theme CSS from cache
  const currentThemeCss = useMemo(() => {
    return getCache()?.currentThemeCss ?? null
  }, [getCache, cacheVersion, syncVersion])

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

        // If this is the current theme, re-apply it to update the UI
        if (currentTheme === name) {
          await applyTheme(name)
        }

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

  // Global theme auto-apply on first mount for each space
  useEffect(() => {
    if (!sqlite || !space || initializedSpaces.has(space)) return

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
          } else {
            // Theme name exists but CSS not found - reset to default
            await sqlite.theme.setCurrent(null)
            handleApplyTheme(defaultThemeCss, isDarkMode)
          }
        } else {
          // No custom theme - ensure default is applied
          handleApplyTheme(defaultThemeCss, isDarkMode)
        }

        initializedSpaces.add(space)
      } catch (error) {
        console.error("Failed to initialize theme CSS:", error)
      }
    }

    initApply()
  }, [sqlite, space, isDarkMode, getCache, setCache])

  // Re-apply theme when dark mode changes
  useLayoutEffect(() => {
    if (!space || !sqlite || !initializedSpaces.has(space)) return

    const reapply = async () => {
      // Always get freshest data from cache or state to avoid stale closure issues
      // in multi-instance scenarios (e.g. ThemeUpdater vs Settings)
      const cached = getCache()
      const effectiveTheme = cached?.currentTheme ?? currentTheme

      if (!effectiveTheme) {
        handleApplyTheme(defaultThemeCss, isDarkMode)
        return
      }

      // Try cache first
      if (cached?.currentTheme === effectiveTheme && cached.currentThemeCss) {
        handleApplyTheme(cached.currentThemeCss, isDarkMode)
        return
      }

      // Fallback to DB
      const css = await sqlite.theme.get(effectiveTheme)
      if (css) {
        handleApplyTheme(css, isDarkMode)
        setCache({
          currentTheme: effectiveTheme,
          themes,
          currentThemeCss: css,
          timestamp: Date.now(),
        })
      } else {
        // Current theme not found anymore - fallback to default
        handleApplyTheme(defaultThemeCss, isDarkMode)
      }
    }

    reapply()
  }, [isDarkMode, currentTheme, sqlite, space, getCache, setCache, themes])

  // Get theme preview colors (with caching)
  const getThemeColors = useCallback(
    async (name: string): Promise<string[]> => {
      // Return cached colors if available
      const cacheKey = `${space}:${name}`
      if (themeColorCache.has(cacheKey)) {
        return themeColorCache.get(cacheKey)!
      }

      // For default theme, use fixed colors
      if (!name) {
        return ["#18181b", "#27272a", "#52525b"]
      }

      if (!sqlite) {
        return generateFallbackColors(name)
      }

      try {
        const css = await sqlite.theme.get(name)
        if (css) {
          const colors = extractThemeColors(css)
          if (colors && colors.length >= 2) {
            themeColorCache.set(cacheKey, colors)
            // Trigger re-render after async load
            setColorCacheVersion((v) => v + 1)
            return colors
          }
        }
      } catch (error) {
        console.error(`Failed to parse theme colors for ${name}:`, error)
      }

      // Fallback to name-based colors
      return generateFallbackColors(name)
    },
    [sqlite, space]
  )

  // Clear color cache when themes change
  useEffect(() => {
    if (space) {
      // Clear color cache for this space to ensure fresh colors
      for (const key of themeColorCache.keys()) {
        if (key.startsWith(`${space}:`)) {
          themeColorCache.delete(key)
        }
      }
    }
  }, [space, themes.length])

  return {
    currentTheme,
    currentThemeCss,
    themes,
    isLoading,
    applyTheme,
    installTheme,
    uninstallTheme,
    getThemeCss,
    refreshThemes: loadThemes,
    getThemeColors,
  }
}
