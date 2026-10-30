import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import type { ThemeDeclaration } from "@eidos.space/plugin-sdk"
import type { EidosLiteAppearance } from "../shared/contracts"
import {
  applyAppearance,
  DEFAULT_RENDERER_PREFERENCES,
  resolveAppearance,
  type ResolvedAppearance,
} from "./app-appearance"
import { applyPluginHostTheme } from "./plugin-host-theme"

export function useAppTheme(): ResolvedAppearance {
  const media = useMemo(
    () => window.matchMedia("(prefers-color-scheme: dark)"),
    []
  )
  const [systemDark, setSystemDark] = useState(media.matches)
  const [appearance, setAppearance] = useState<EidosLiteAppearance>(
    DEFAULT_RENDERER_PREFERENCES.appearance
  )
  const [pluginTheme, setPluginTheme] = useState<ThemeDeclaration | null>(null)
  useEffect(() => {
    const update = () => setSystemDark(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [media])
  useEffect(() => {
    void window.eidosLite
      .getPreferences()
      .then((preferences) => setAppearance(preferences.appearance))
    return window.eidosLite.onPreferencesChanged((preferences) =>
      setAppearance(preferences.appearance)
    )
  }, [])
  const theme = resolveAppearance(appearance, systemDark)
  useLayoutEffect(() => {
    applyAppearance(document.documentElement, appearance, systemDark)
  }, [appearance, systemDark])
  useEffect(() => {
    let generation = 0
    const update = () => {
      const current = ++generation
      void window.eidosLite
        .listPlugins()
        .then((listing) => {
          if (current !== generation) return
          const selected = listing.plugins.find(
            (plugin) => plugin.manifest.id === listing.activeThemeId
          )
          setPluginTheme(selected?.manifest.theme ?? null)
        })
        .catch(() => {
          if (current === generation) setPluginTheme(null)
        })
    }
    update()
    const unsubscribe = window.eidosLite.onPluginEvent(({ event }) => {
      if (event.observation === "host.catalog") update()
    })
    return () => {
      generation++
      unsubscribe()
    }
  }, [])
  useLayoutEffect(
    () => applyPluginHostTheme(document.documentElement, pluginTheme),
    [pluginTheme]
  )
  return theme
}
