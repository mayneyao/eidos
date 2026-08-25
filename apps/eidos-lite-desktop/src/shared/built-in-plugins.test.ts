import {
  DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS,
  isEidosLiteBuiltInPlugins,
  isEidosLiteShortcutEnabled,
  normalizeEidosLiteBuiltInPlugins,
} from "./built-in-plugins"

describe("Eidos Lite built-in plugins", () => {
  it("keeps optional plugins disabled until explicitly enabled", () => {
    expect(normalizeEidosLiteBuiltInPlugins(undefined)).toEqual(
      DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS
    )
    expect(normalizeEidosLiteBuiltInPlugins({ terminal: true })).toEqual({
      terminal: true,
    })
    expect(normalizeEidosLiteBuiltInPlugins({ terminal: "yes" })).toEqual(
      DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS
    )
  })

  it("accepts only the complete registered plugin shape", () => {
    expect(isEidosLiteBuiltInPlugins({ terminal: false })).toBe(true)
    expect(isEidosLiteBuiltInPlugins({ terminal: false, unknown: true })).toBe(
      false
    )
    expect(isEidosLiteBuiltInPlugins({ terminal: "yes" })).toBe(false)
  })

  it("activates terminal shortcuts only with the terminal plugin", () => {
    expect(
      isEidosLiteShortcutEnabled("toggle-terminal", { terminal: false })
    ).toBe(false)
    expect(
      isEidosLiteShortcutEnabled("toggle-terminal-position", { terminal: true })
    ).toBe(true)
    expect(isEidosLiteShortcutEnabled("toggle-sync", { terminal: false })).toBe(
      true
    )
  })
})
