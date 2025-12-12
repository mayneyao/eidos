"use client"

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

type ThemeMode = "light" | "dark" | "system"

type ThemeContextValue = {
  /**
   * User-selected theme value. Mirrors next-themes' `theme` (light/dark/system).
   */
  theme: ThemeMode
  /**
   * Actual applied theme (light/dark) after resolving system preference.
   */
  resolvedTheme: Exclude<ThemeMode, "system">
  forcedTheme?: ThemeMode
  setTheme: (theme: ThemeMode) => void
  /**
   * Alias for the user-selected theme for explicit access.
   */
  rawTheme: ThemeMode
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const getSystemTheme = (): Exclude<ThemeMode, "system"> => {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export type ThemeProviderProps = PropsWithChildren<{
  attribute?: "class" | "data-theme"
  defaultTheme?: ThemeMode
  enableSystem?: boolean
  storageKey?: string
  forcedTheme?: ThemeMode
}>

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "light",
  enableSystem = true,
  storageKey = "theme",
  forcedTheme,
}: ThemeProviderProps) {
  const [systemTheme, setSystemTheme] = useState<Exclude<ThemeMode, "system">>(
    () => getSystemTheme()
  )

  const [themeSetting, setThemeSetting] = useState<ThemeMode>(() => {
    if (forcedTheme) return forcedTheme
    if (typeof window === "undefined") return defaultTheme

    const stored = window.localStorage.getItem(storageKey)
    if (
      stored === "light" ||
      stored === "dark" ||
      (enableSystem && stored === "system")
    ) {
      return stored
    }

    if (defaultTheme === "system" && enableSystem) {
      return "system"
    }

    return defaultTheme
  })

  useEffect(() => {
    if (!enableSystem || typeof window === "undefined") return

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const updateSystemTheme = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(event.matches ? "dark" : "light")
    }

    updateSystemTheme(media)
    media.addEventListener("change", updateSystemTheme)
    return () => media.removeEventListener("change", updateSystemTheme)
  }, [enableSystem])

  const resolvedTheme = useMemo<Exclude<ThemeMode, "system">>(() => {
    if (forcedTheme) {
      if (forcedTheme === "system") return systemTheme
      return forcedTheme === "dark" ? "dark" : "light"
    }

    if (themeSetting === "system") return systemTheme
    return themeSetting === "dark" ? "dark" : "light"
  }, [forcedTheme, systemTheme, themeSetting])

  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement

    if (attribute === "class") {
      root.classList.remove("light", "dark")
      root.classList.add(resolvedTheme)
    } else {
      root.setAttribute(attribute, resolvedTheme)
    }
  }, [attribute, resolvedTheme])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (forcedTheme) {
      window.localStorage.removeItem(storageKey)
      return
    }

    window.localStorage.setItem(storageKey, themeSetting)
  }, [forcedTheme, storageKey, themeSetting])

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      if (forcedTheme) return
      setThemeSetting(nextTheme)
    },
    [forcedTheme]
  )

  const value = useMemo(
    () => ({
      theme: themeSetting,
      resolvedTheme,
      forcedTheme,
      setTheme,
      rawTheme: themeSetting,
    }),
    [themeSetting, resolvedTheme, forcedTheme, setTheme]
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? {
    theme: "light",
    resolvedTheme: "light",
    forcedTheme: undefined,
    setTheme: () => {},
    rawTheme: "light",
  }
}
