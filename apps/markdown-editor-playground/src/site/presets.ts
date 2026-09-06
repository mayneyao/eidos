import type { BuiltInMarkdownProfileId } from "@eidos.space/markdown"

export const presets = [
  {
    id: "eidos",
    name: "Eidos",
    en: "CommonMark + GFM + Wiki links, with Eidos document extensions.",
    zh: "CommonMark + GFM + Wiki 文件链接，以及 Eidos 文档扩展。",
  },
] as const satisfies readonly {
  id: BuiltInMarkdownProfileId
  name: string
  en: string
  zh: string
}[]

export function presetFromSearch(
  fallback: BuiltInMarkdownProfileId = "eidos"
): BuiltInMarkdownProfileId {
  const value = new URLSearchParams(window.location.search).get("preset")
  return presets.find((preset) => preset.id === value)?.id ?? fallback
}

export function updatePresetUrl(preset: BuiltInMarkdownProfileId) {
  const url = new URL(window.location.href)
  url.searchParams.set("preset", preset)
  window.history.replaceState(window.history.state, "", url)
}
