import type { ThemeDeclaration } from "@eidos.space/plugin-sdk"

/** Mounts a packaged, validated stylesheet on the Lite host. */
export function applyPluginHostTheme(
  root: HTMLElement,
  theme: ThemeDeclaration | null
): () => void {
  if (!theme) return () => {}
  const style = root.ownerDocument.createElement("style")
  style.dataset.eidosPluginTheme = ""
  style.textContent = theme.stylesheet
  root.ownerDocument.head.append(style)
  return () => style.remove()
}
