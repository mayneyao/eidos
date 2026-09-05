import {
  createEditor,
  $getRoot,
  $isElementNode,
  $isTextNode,
  type LexicalNode,
} from "lexical"
import { createMarkdownPreset, minimalPreset } from "../presets"
import { tablePlugin } from "../features/gfm/individual-plugins"
import { emphasisPlugin } from "../features/commonmark/plugin"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"

function composition(emphasis: boolean) {
  const preset = createMarkdownPreset({
    id: emphasis ? "test.table-emphasis" : "test.table-only",
    extends: minimalPreset,
    plugins: [tablePlugin, ...(emphasis ? [emphasisPlugin] : [])],
  })
  const registry = compileMarkdownPlugins(preset.plugins)
  return (source: string) => {
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      onError(error) {
        throw error
      },
    })
    editor.update(
      () => preset.codec.import(source, registry.transformers, {}),
      {
        discrete: true,
      }
    )
    return editor.getEditorState().read(() => {
      const flatten = (node: LexicalNode): LexicalNode[] => [
        node,
        ...($isElementNode(node) ? node.getChildren().flatMap(flatten) : []),
      ]
      const nodes = flatten($getRoot())
      return {
        tables: nodes.filter((node) => node.getType() === "table").length,
        bold: nodes
          .filter($isTextNode)
          .filter((node) => node.hasFormat("bold"))
          .map((node) => node.getTextContent()),
        text: $getRoot().getTextContent(),
        markdown: preset.codec.export(registry.transformers),
      }
    })
  }
}

it("table-only compositions preserve disabled inline syntax without optional link nodes", () => {
  const result = composition(false)(
    "| Header |\n| --- |\n| **Bold** and [Link](https://example.com) |"
  )
  expect(result.tables).toBe(1)
  expect(result.bold).toEqual([])
  expect(result.text).toContain("**Bold** and [Link](https://example.com)")
})

it("table cells inherit enabled emphasis without leaking it into another composition", () => {
  const plain = composition(false)
  const rich = composition(true)
  const source = "| Header |\n| --- |\n| **Bold** |"
  expect(rich(source).bold).toEqual(["Bold"])
  expect(plain(source).bold).toEqual([])
  expect(rich(source).markdown).toContain("**Bold**")
  expect(plain(source).text).toContain("**Bold**")
})
