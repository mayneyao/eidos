export const MARKDOWN_FEATURES = {
  code: "markdown.code",
  emphasis: "markdown.emphasis",
  heading: "markdown.heading",
  inlineCode: "markdown.inline-code",
  link: "markdown.link",
  list: "markdown.list",
  paragraph: "markdown.paragraph",
  quote: "markdown.quote",
  thematicBreak: "markdown.thematic-break",
  gfmStrikethrough: "gfm.strikethrough",
  gfmTable: "gfm.table",
  gfmTaskList: "gfm.task-list",
  highlight: "eidos.highlight",
  math: "efm.math",
  image: "efm.image",
  footnote: "efm.footnote",
  frontmatter: "efm.frontmatter",
  rawHtml: "efm.raw-html",
  reference: "efm.reference",
  sourceRangeEditing: "editor.source-range-editing",
} as const

export type MarkdownFeatureId =
  (typeof MARKDOWN_FEATURES)[keyof typeof MARKDOWN_FEATURES]
