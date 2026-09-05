import {
  $createEfmBlockNode,
  $createEfmInlineNode,
} from "../../nodes/efm-semantic-node"
import type { MarkdownPluginInsertion } from "../../plugin-system/plugin-api"

/** Shared by dialect profiles; insertion UI never branches on equation IDs. */
export const mathInsertions: readonly MarkdownPluginInsertion[] = [
  {
    id: "eidos.math.block",
    order: 200,
    contexts: ["block"],
    glyph: "∑",
    labelKey: "mathBlock",
    section: "extended",
    execute(context) {
      const key = context.insertBlock(() =>
        $createEfmBlockNode({
          kind: "math",
          source: "$$\n\n$$",
          value: "",
        })
      )
      if (!key) return
      context.closeMenu()
      context.selectBlock(key)
    },
  },
  {
    id: "eidos.math.inline",
    order: 210,
    contexts: ["inline"],
    glyph: "√x",
    labelKey: "inlineMath",
    section: "extended",
    execute(context) {
      context.requestText({
        title: context.labels.inlineMath,
        label: context.labels.formulaSource,
        onSubmit(input) {
          const value = input.trim()
          if (!value) return
          if (
            !context.insertInline(() => [
              $createEfmInlineNode({
                kind: "math",
                source: `$${value}$`,
                value,
              }),
            ])
          )
            return
          context.closeMenu()
          context.focusEditor()
        },
      })
    },
  },
]
