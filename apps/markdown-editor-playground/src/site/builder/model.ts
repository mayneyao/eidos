import { createMarkdownPreset } from "@eidos.space/markdown"
import type { MarkdownEditorInteractions } from "@eidos.space/markdown"
import { commonmarkPreset } from "@eidos.space/markdown/presets"
import {
  tablePlugin,
  taskListPlugin,
  strikethroughPlugin,
  autolinkPlugin,
  tagFilterPlugin,
  imagePlugin,
  rawHtmlPlugin,
  mathPlugin,
  footnotePlugin,
  frontmatterPlugin,
  highlightPlugin,
  headingPlugin,
  quotePlugin,
  listPlugin,
  codeBlockPlugin,
  inlineCodePlugin,
  emphasisPlugin,
  linkPlugin,
  thematicBreakPlugin,
  referencePlugin,
  wikilinkPlugin,
  embedPlugin,
  tagPlugin,
  commentPlugin,
  blockIdPlugin,
  inlineFootnotePlugin,
  calloutPlugin,
  attachmentPlugin,
  vaultLinkPlugin,
} from "@eidos.space/markdown/plugins"
import { syntaxExamples } from "../syntax-catalog"

export const builderPlugins = [
  {
    id: "callout",
    en: "Callouts",
    zh: "提示块",
    plugin: calloutPlugin,
    symbol: "calloutPlugin",
    examples: ["callout"],
    group: "Vault",
  },
  {
    id: "attachment",
    en: "Attachment dimensions",
    zh: "附件尺寸",
    plugin: attachmentPlugin,
    symbol: "attachmentPlugin",
    examples: ["obsidian-image"],
    group: "Vault",
  },
  {
    id: "vault-link",
    en: "Vault-relative links",
    zh: "Vault 相对链接",
    plugin: vaultLinkPlugin,
    symbol: "vaultLinkPlugin",
    examples: ["relative-link"],
    group: "Vault",
  },
  {
    id: "embed",
    en: "Embeds",
    zh: "嵌入引用",
    plugin: embedPlugin,
    symbol: "embedPlugin",
    examples: ["embed"],
    group: "Vault",
  },
  {
    id: "tag",
    en: "Tags",
    zh: "标签",
    plugin: tagPlugin,
    symbol: "tagPlugin",
    examples: ["tag"],
    group: "Vault",
  },
  {
    id: "comment",
    en: "Comments",
    zh: "注释",
    plugin: commentPlugin,
    symbol: "commentPlugin",
    examples: ["comment"],
    group: "Vault",
  },
  {
    id: "block-id",
    en: "Block identifiers",
    zh: "块标识符",
    plugin: blockIdPlugin,
    symbol: "blockIdPlugin",
    examples: ["block-id"],
    group: "Vault",
  },
  {
    id: "inline-footnote",
    en: "Inline footnotes",
    zh: "行内脚注",
    plugin: inlineFootnotePlugin,
    symbol: "inlineFootnotePlugin",
    examples: ["inline-footnote"],
    group: "Vault",
  },
  {
    id: "wikilink",
    en: "Wiki links",
    zh: "双链",
    plugin: wikilinkPlugin,
    symbol: "wikilinkPlugin",
    examples: ["wikilink"],
    group: "Vault",
  },
  {
    id: "heading",
    en: "Headings",
    zh: "标题",
    plugin: headingPlugin,
    symbol: "headingPlugin",
    examples: ["heading", "setext"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "quote",
    en: "Quotes",
    zh: "引用",
    plugin: quotePlugin,
    symbol: "quotePlugin",
    examples: ["quote"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "list",
    en: "Lists",
    zh: "列表",
    plugin: listPlugin,
    symbol: "listPlugin",
    examples: ["bullet-list", "ordered-list", "list-blocks"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "code",
    en: "Code blocks",
    zh: "代码块",
    plugin: codeBlockPlugin,
    symbol: "codeBlockPlugin",
    examples: ["fenced-code", "indented-code"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "inline-code",
    en: "Inline code",
    zh: "行内代码",
    plugin: inlineCodePlugin,
    symbol: "inlineCodePlugin",
    examples: ["code-span"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "emphasis",
    en: "Emphasis",
    zh: "强调",
    plugin: emphasisPlugin,
    symbol: "emphasisPlugin",
    examples: ["emphasis"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "link",
    en: "Links",
    zh: "链接",
    plugin: linkPlugin,
    symbol: "linkPlugin",
    examples: ["link", "autolink"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "divider",
    en: "Dividers",
    zh: "分隔线",
    plugin: thematicBreakPlugin,
    symbol: "thematicBreakPlugin",
    examples: ["thematic-break"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "reference",
    en: "References",
    zh: "引用式链接",
    plugin: referencePlugin,
    symbol: "referencePlugin",
    examples: ["reference-link"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "table",
    en: "Tables",
    zh: "表格",
    plugin: tablePlugin,
    symbol: "tablePlugin",
    examples: ["table"],
    group: "GFM",
  },
  {
    id: "task-list",
    en: "Task lists",
    zh: "任务列表",
    plugin: taskListPlugin,
    symbol: "taskListPlugin",
    examples: ["task-list"],
    group: "GFM",
  },
  {
    id: "strikethrough",
    en: "Strikethrough",
    zh: "删除线",
    plugin: strikethroughPlugin,
    symbol: "strikethroughPlugin",
    examples: ["strikethrough"],
    group: "GFM",
  },
  {
    id: "autolink",
    en: "Automatic links",
    zh: "自动链接",
    plugin: autolinkPlugin,
    symbol: "autolinkPlugin",
    examples: ["extended-autolink"],
    group: "GFM",
  },
  {
    id: "tag-filter",
    en: "GFM tag filter",
    zh: "GFM 标签过滤",
    plugin: tagFilterPlugin,
    symbol: "tagFilterPlugin",
    examples: ["tag-filter"],
    group: "GFM",
  },
  {
    id: "image",
    en: "Images",
    zh: "图片",
    plugin: imagePlugin,
    symbol: "imagePlugin",
    examples: ["image"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "html",
    en: "Safe HTML",
    zh: "安全 HTML",
    plugin: rawHtmlPlugin,
    symbol: "rawHtmlPlugin",
    examples: ["html"],
    group: "CommonMark",
    inherited: true,
  },
  {
    id: "math",
    en: "Equations",
    zh: "公式",
    plugin: mathPlugin,
    symbol: "mathPlugin",
    examples: ["inline-math", "block-math"],
    group: "Extended",
  },
  {
    id: "footnote",
    en: "Footnotes",
    zh: "脚注",
    plugin: footnotePlugin,
    symbol: "footnotePlugin",
    examples: ["footnote"],
    group: "Extended",
  },
  {
    id: "frontmatter",
    en: "Frontmatter",
    zh: "文档属性",
    plugin: frontmatterPlugin,
    symbol: "frontmatterPlugin",
    examples: ["frontmatter"],
    group: "Extended",
  },
  {
    id: "highlight",
    en: "Highlight",
    zh: "高亮",
    plugin: highlightPlugin,
    symbol: "highlightPlugin",
    examples: ["highlight"],
    group: "Extended",
  },
] as const

export type BuilderPluginId = (typeof builderPlugins)[number]["id"]
export function builderDependencies(id: BuilderPluginId): BuilderPluginId[] {
  const entry = builderPlugins.find((candidate) => candidate.id === id)!
  const requirements =
    "requires" in entry.plugin ? (entry.plugin.requires ?? []) : []
  return builderPlugins
    .filter(
      (candidate) =>
        requirements.includes(candidate.plugin.id) ||
        (id === "reference" && candidate.id === "link")
    )
    .map((candidate) => candidate.id)
}
export function builderRequiredBy(config: BuilderConfig, id: BuilderPluginId) {
  return builderPlugins.filter(
    (entry) =>
      config.plugins.includes(entry.id) &&
      builderDependencies(entry.id).includes(id)
  )
}
export interface BuilderConfig {
  schemaVersion: 1 | 2
  plugins: BuilderPluginId[]
  toolbar: boolean
  interactions?: MarkdownEditorInteractions
  imageStorage?: "opfs"
}
export const builderInteractions = [
  { id: "toolbar", en: "Formatting toolbar", zh: "格式工具栏" },
  { id: "insertMenu", en: "Insertion menus", zh: "插入菜单" },
  { id: "blockDrag", en: "Block drag handles", zh: "块拖拽把手" },
  { id: "blockSelection", en: "Block selection", zh: "块选区" },
] as const

export function builderInteractionEnabled(
  config: BuilderConfig,
  id: keyof MarkdownEditorInteractions
): boolean {
  return (
    config.interactions?.[id] ?? (id === "blockSelection" || config.toolbar)
  )
}
const legacyBase: BuilderPluginId[] = [
  "heading",
  "quote",
  "list",
  "code",
  "inline-code",
  "emphasis",
  "link",
  "divider",
  "reference",
]
export function selectedBuilderPlugins(
  config: BuilderConfig
): BuilderPluginId[] {
  const ids = new Set(
    config.schemaVersion === 1
      ? [...legacyBase, ...config.plugins]
      : config.plugins
  )
  for (const id of ids)
    for (const dependency of builderDependencies(id)) ids.add(dependency)
  return builderPlugins
    .filter((entry) => ids.has(entry.id))
    .map((entry) => entry.id)
}
export const startingPoints = [
  "minimal",
  "commonmark",
  "gfm",
  "eidos",
  "obsidian",
] as const
export function startingConfig(
  id: (typeof startingPoints)[number]
): BuilderConfig {
  return {
    schemaVersion: 2,
    toolbar: true,
    plugins: builderPlugins
      .filter(
        (entry) =>
          id !== "minimal" &&
          (id === "obsidian" ||
            (id === "eidos" && entry.group !== "Vault") ||
            entry.group === "CommonMark" ||
            (id === "gfm" && entry.group === "GFM"))
      )
      .map((entry) => entry.id),
  }
}
export function parseBuilderConfig(value: string | null): BuilderConfig {
  if (!value) return startingConfig("gfm")
  if (value.length > 8192) throw new Error("Configuration is too large.")
  const input: unknown = JSON.parse(value)
  if (
    !input ||
    typeof input !== "object" ||
    !("schemaVersion" in input) ||
    (input.schemaVersion !== 1 && input.schemaVersion !== 2) ||
    !("plugins" in input) ||
    !Array.isArray(input.plugins) ||
    !("toolbar" in input) ||
    typeof input.toolbar !== "boolean"
  )
    throw new Error("Unsupported editor configuration.")
  const ids = input.plugins
  let interactions: MarkdownEditorInteractions | undefined
  if ("interactions" in input) {
    const value = input.interactions
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.entries(value).some(
        ([key, enabled]) =>
          !builderInteractions.some((entry) => entry.id === key) ||
          typeof enabled !== "boolean"
      )
    )
      throw new Error("Unsupported interaction configuration.")
    interactions = Object.fromEntries(Object.entries(value))
  }
  if ("imageStorage" in input && input.imageStorage !== "opfs")
    throw new Error("Unsupported image storage adapter.")
  if (
    ids.some((id: unknown) => !builderPlugins.some((entry) => entry.id === id))
  )
    throw new Error("This configuration contains an unknown plugin.")
  return {
    schemaVersion: 2,
    plugins: selectedBuilderPlugins({
      schemaVersion: input.schemaVersion,
      plugins: ids,
      toolbar: input.toolbar,
    }),
    toolbar: input.toolbar,
    ...(interactions ? { interactions } : {}),
    ...("imageStorage" in input ? { imageStorage: "opfs" as const } : {}),
  }
}
export function resolveBuilder(config: BuilderConfig) {
  const selected = selectedBuilderPlugins(config)
  const chosen = builderPlugins.filter((entry) => selected.includes(entry.id))
  const excluded = builderPlugins
    .filter((entry) => "inherited" in entry && !selected.includes(entry.id))
    .map((entry) => entry.plugin.id)
  const added = chosen.filter((entry) => !("inherited" in entry))
  const preset = createMarkdownPreset({
    id: "custom.markdown",
    extends: commonmarkPreset,
    exclude: excluded,
    plugins: added.map((entry) => entry.plugin),
  })
  const imports = added.map((entry) => entry.symbol)
  const presetCode = `import { createMarkdownPreset } from "@eidos.space/markdown"\nimport { commonmarkPreset } from "@eidos.space/markdown/presets"\n${imports.length ? `import { ${imports.join(", ")} } from "@eidos.space/markdown/plugins"\n` : ""}\nexport const preset = createMarkdownPreset({\n  id: "custom.markdown",\n  extends: commonmarkPreset,\n${excluded.length ? `  exclude: ${JSON.stringify(excluded)},\n` : ""}  plugins: [${imports.join(", ")}],\n})\n`
  const usesImages = selected.includes("image")
  const useOpfs = config.imageStorage === "opfs" && usesImages
  const componentCode = `import { useState } from "react"\nimport { MarkdownEditor } from "@eidos.space/markdown"\nimport "@eidos.space/markdown/styles.css"\nimport { preset } from "./markdown-preset.js"\n${useOpfs ? 'import { useOpfsImageStorage } from "./image-storage.js"\n' : ""}\nexport default function Editor() {\n  const [markdown, setMarkdown] = useState("# Your document\\n\\nStart writing.")\n${useOpfs ? "  const images = useOpfsImageStorage()\n" : ""}  return (\n    <MarkdownEditor\n      documentKey="my-document"\n      preset={preset}\n      markdown={markdown}\n      onMarkdownChange={setMarkdown}\n      showToolbar={${config.toolbar}}\n${useOpfs ? "      {...images}\n" : ""}    />\n  )\n}\n`
  const examples = new Set<string>(
    chosen.flatMap((entry) => [...entry.examples])
  )
  const example =
    `${selected.includes("heading") ? "# " : ""}Your Markdown editor\n\n${selected.includes("emphasis") ? "**Your words. Your syntax.**" : "Your words. Your syntax."}\n\n` +
    syntaxExamples
      .filter((entry) => examples.has(entry.id))
      .map((entry) => entry.source)
      .join("\n\n")
  return {
    usesImages,
    useOpfs,
    preset,
    presetCode,
    componentCode: config.interactions
      ? componentCode.replace(
          `      showToolbar={${config.toolbar}}`,
          `      showToolbar={${config.toolbar}}\n      interactions={${JSON.stringify(config.interactions)}}`
        )
      : componentCode,
    example,
  }
}
