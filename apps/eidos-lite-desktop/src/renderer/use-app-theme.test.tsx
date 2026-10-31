// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { useAppTheme } from "./use-app-theme"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import type { EidosLitePreferences } from "../shared/contracts"

it.each(["light", "dark"] as const)(
  "keeps the startup %s theme while preferences are pending",
  async (appearance) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const previousUrl = window.location.href
    window.history.replaceState(null, "", `?appearance=${appearance}#/opening`)
    vi.stubGlobal("matchMedia", () => ({
      matches: appearance === "light",
      addEventListener() {},
      removeEventListener() {},
    }))
    let finish!: (preferences: EidosLitePreferences) => void
    let changed!: (preferences: EidosLitePreferences) => void
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getPreferences: () =>
          new Promise<EidosLitePreferences>((resolve) => {
            finish = resolve
          }),
        onPreferencesChanged: (listener: typeof changed) => {
          changed = listener
          return () => {}
        },
        listPlugins: async () => ({ plugins: [] }),
        onPluginEvent: () => () => {},
      },
    })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      return <span>{useAppTheme()}</span>
    }
    try {
      await act(async () => root.render(<Harness />))
      expect(document.documentElement.style.colorScheme).toBe(appearance)
      expect(host.textContent).toBe(appearance)
      await act(async () =>
        finish({ ...DEFAULT_RENDERER_PREFERENCES, appearance })
      )
      expect(document.documentElement.style.colorScheme).toBe(appearance)
      const next = appearance === "dark" ? "light" : "dark"
      await act(async () =>
        changed({ ...DEFAULT_RENDERER_PREFERENCES, appearance: next })
      )
      expect(document.documentElement.style.colorScheme).toBe(next)
    } finally {
      await act(async () => root.unmount())
      host.remove()
      window.history.replaceState(null, "", previousUrl)
      document.documentElement.removeAttribute("style")
      document.documentElement.removeAttribute("data-theme")
      document.documentElement.classList.remove("dark")
      vi.unstubAllGlobals()
    }
  }
)
