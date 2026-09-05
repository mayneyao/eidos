import type { BuiltInMarkdownProfileId } from "@eidos.space/markdown"

export const presets = [
  {
    id: "gfm",
    name: "GFM",
    en: "CommonMark + tables, task lists, strikethrough, autolinks and tag filtering.",
    zh: "CommonMark，以及表格、任务列表、删除线、自动链接和 HTML 标签过滤。",
  },
  {
    id: "eidos",
    name: "Eidos",
    en: "GFM + document properties, footnotes, equations and highlights.",
    zh: "GFM，以及文档属性、脚注、数学公式和高亮。",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    en: "Vault syntax: wikilinks, callouts, embeds, tags and comments. Experimental.",
    zh: "笔记库语法：双链、提示块、嵌入、标签和注释。实验性预设。",
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
