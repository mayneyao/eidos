import type { MarkdownPluginInsertion } from "../../plugin-system/plugin-api"
import { calloutBlockSyntax } from "./callout-syntax"

export const calloutInsertions: readonly MarkdownPluginInsertion[] = [
  {
    id: "markdown.callout",
    order: 195,
    contexts: ["block"],
    glyph: "[!]",
    labelKey: "callout",
    keywords: ["note", "callout", "alert", "box", "tip", "info", "warning"],
    section: "extended",
    execute(context) {
      const source = "> [!note]\n> "
      const key = context.insertBlock(() =>
        calloutBlockSyntax.import(source, {})
      )
      if (!key) return
      context.closeMenu()
      context.selectBlock(key)
    },
  },
]
