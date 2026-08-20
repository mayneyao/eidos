import type {
  EidosLiteAppearance,
  EidosLitePreferences,
} from "../shared/contracts"
import { DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS } from "../shared/keyboard-shortcuts"

export type ResolvedAppearance = "light" | "dark"

export function resolveAppearance(
  appearance: EidosLiteAppearance,
  systemDark: boolean
): ResolvedAppearance {
  return appearance === "system" ? (systemDark ? "dark" : "light") : appearance
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
  appearance: "system",
  language: "system",
  timeZone: "system",
  weekStartsOnMonday: true,
  keyboardShortcuts: { ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS },
  automaticUpdates: true,
  automaticCheckpoints: false,
  defaultSpaceLocation: null,
}
