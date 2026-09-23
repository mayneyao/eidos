import { THEME_TOKEN_PROPERTIES } from "@eidos.space/plugin-runtime/theme"
import type { ThemeDeclaration } from "@eidos.space/plugin-sdk"

/** Applies validated data from a theme package. No plugin CSS or script enters the host. */
export function applyPluginHostTheme(
  root: HTMLElement,
  theme: ThemeDeclaration | null,
  appearance: "light" | "dark"
): () => void {
  if (!theme) return () => {}
  const applied: string[] = []
  for (const [key, value] of Object.entries(theme[appearance])) {
    const property =
      THEME_TOKEN_PROPERTIES[key as keyof typeof THEME_TOKEN_PROPERTIES]
    if (
      property &&
      typeof value === "string" &&
      typeof CSS !== "undefined" &&
      CSS.supports(property, value)
    ) {
      root.style.setProperty(key, value)
      applied.push(key)
    }
  }
  const faces: FontFace[] = []
  if (typeof FontFace !== "undefined" && document.fonts) {
    for (const font of theme.fonts ?? []) {
      try {
        const face = new FontFace(font.family, `url("${font.source}")`, {
          weight: font.weight ?? "normal",
        })
        document.fonts.add(face)
        faces.push(face)
        void face.load().catch(() => {})
      } catch {
        // The fallback font stack remains usable if a font cannot load.
      }
    }
  }
  return () => {
    for (const key of applied) root.style.removeProperty(key)
    for (const face of faces) document.fonts.delete(face)
  }
}
