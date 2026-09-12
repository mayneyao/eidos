import type { EidosLiteAppearance } from "./contracts"

export type EidosLiteResolvedAppearance = "light" | "dark"

export function resolveEidosLiteAppearance(
  appearance: EidosLiteAppearance,
  systemDark: boolean
): EidosLiteResolvedAppearance {
  return appearance === "system" ? (systemDark ? "dark" : "light") : appearance
}
