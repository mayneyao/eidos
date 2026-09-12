import {
  resolveEidosLiteAppearance,
  type EidosLiteResolvedAppearance,
} from "../shared/appearance"
import type {
  EidosLiteAppearance,
  EidosLitePreferences,
} from "../shared/contracts"
import { DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS } from "../shared/built-in-plugins"
import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"

export type ResolvedAppearance = EidosLiteResolvedAppearance

export function resolveAppearance(
  appearance: EidosLiteAppearance,
  systemDark: boolean
): ResolvedAppearance {
  return resolveEidosLiteAppearance(appearance, systemDark)
}

export function toggledAppearance(
  current: ResolvedAppearance
): EidosLiteAppearance {
  return current === "dark" ? "light" : "dark"
}

export function applyAppearance(
  root: HTMLElement,
  appearance: EidosLiteAppearance,
  systemDark: boolean
): ResolvedAppearance {
  const resolved = resolveAppearance(appearance, systemDark)
  root.dataset.theme = resolved
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
  return resolved
}

export const DEFAULT_RENDERER_PREFERENCES: EidosLitePreferences = {
  uiZoom: 1,
  appearance: "system",
  language: "system",
  markdownFileEditingMode: "source",
  htmlFileOpenMode: "preview",
  markdownCompatibilityProfile: "eidos",
  terminalLayout: "bottom",
  timeZone: "system",
  weekStartsOnMonday: true,
  builtInPlugins: { ...DEFAULT_EIDOS_LITE_BUILT_IN_PLUGINS },
  terminalShell: null,
  keyboardShortcuts: { ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS },
  automaticUpdates: true,
  automaticCheckpoints: false,
  defaultSpaceLocation: null,
}
