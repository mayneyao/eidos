import type { EidosLiteShortcutCommand } from "./keyboard-shortcuts"

export const EIDOS_LITE_BUILT_IN_PLUGIN_IDS = ["terminal"] as const

export type EidosLiteBuiltInPluginId =
  (typeof EIDOS_LITE_BUILT_IN_PLUGIN_IDS)[number]

export type EidosLiteBuiltInPlugins = Record<EidosLiteBuiltInPluginId, boolean>

export const DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS: EidosLiteBuiltInPlugins =
  Object.freeze({ terminal: false })

export function isEidosLiteBuiltInPlugins(
  value: unknown
): value is EidosLiteBuiltInPlugins {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    Object.keys(candidate).length === EIDOS_LITE_BUILT_IN_PLUGIN_IDS.length &&
    EIDOS_LITE_BUILT_IN_PLUGIN_IDS.every(
      (pluginId) => typeof candidate[pluginId] === "boolean"
    )
  )
}

export function normalizeEidosLiteBuiltInPlugins(
  value: unknown
): EidosLiteBuiltInPlugins {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return {
    terminal:
      typeof candidate.terminal === "boolean"
        ? candidate.terminal
        : DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS.terminal,
  }
}

export function isEidosLiteShortcutEnabled(
  command: EidosLiteShortcutCommand,
  plugins: EidosLiteBuiltInPlugins
): boolean {
  if (command === "toggle-terminal" || command === "toggle-terminal-position") {
    return plugins.terminal
  }
  return true
}
