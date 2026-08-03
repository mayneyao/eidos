import type {
  EidosLiteAppearance,
  EidosLitePreferences,
} from "../shared/contracts"

export type ResolvedAppearance = "light" | "dark"

export function resolveAppearance(
  appearance: EidosLiteAppearance,
  systemDark: boolean
): ResolvedAppearance {
  return appearance === "system" ? (systemDark ? "dark" : "light") : appearance
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
  automaticCheckpoints: false,
  defaultSpaceLocation: null,
}
