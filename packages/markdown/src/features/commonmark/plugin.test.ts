import {
  $getRoot,
  $isElementNode,
  $isTextNode,
  createEditor,
  type LexicalNode,
} from "lexical"
import { minimalPreset } from "../../presets"
import { createMarkdownPreset } from "../../profile-system/create-preset"
import { compileMarkdownPlugins } from "../../plugin-system/plugin-compiler"
import { MARKDOWN_EDITOR_CORE_NODES } from "../../nodes/node-registry"
import {
  headingPlugin,
  quotePlugin,
  listPlugin,
  codeBlockPlugin,
  inlineCodePlugin,
  emphasisPlugin,
  linkPlugin,
  thematicBreakPlugin,
  commonmarkPlugin,
  commonmarkSyntaxPlugins,
} from "./plugin"

function flatten(node: LexicalNode): LexicalNode[] {
  return [
    node,
    ...($isElementNode(node) ? node.getChildren().flatMap(flatten) : []),
  ]
}

describe("CommonMark syntax ownership", () => {
  it.each([
    [headingPlugin, "# Heading", "heading"],
    [quotePlugin, "> Quote", "quote"],
    [listPlugin, "- Item", "list"],
    [codeBlockPlugin, "```js\nconst x = 1\n```", "code"],
    [inlineCodePlugin, "An `inline` token", "text"],
    [emphasisPlugin, "A **bold** token", "text"],
    [linkPlugin, "[Link](https://example.com)", "link"],
    [thematicBreakPlugin, "---", "horizontalrule"],
  ] as const)("%s works without the legacy bundle", (plugin, source, type) => {
    const preset = createMarkdownPreset({
      id: "test.commonmark-owner",
      extends: minimalPreset,
      plugins: [plugin],
    })
    const registry = compileMarkdownPlugins(preset.plugins)
    const editor = createEditor({
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      onError(error) {
        throw error
      },
    })
    editor.update(
      () => preset.codec.import(source, registry.transformers, {}),
      { discrete: true }
    )
    editor.getEditorState().read(() => {
      const nodes = flatten($getRoot())
      expect(nodes.map((node) => node.getType())).toContain(type)
      expect(nodes.map((node) => node.getType())).not.toContain(
        "efm-source-block"
      )
      if (plugin === emphasisPlugin)
        expect(
          nodes.filter($isTextNode).some((node) => node.hasFormat("bold"))
        ).toBe(true)
      if (plugin === inlineCodePlugin)
        expect(
          nodes.filter($isTextNode).some((node) => node.hasFormat("code"))
        ).toBe(true)
    })
    expect(registry.insertions.map((item) => item.id)).toEqual(
      (plugin.insertions ?? []).map((item) => item.id)
    )
    expect(registry.toolbar.map((item) => item.id)).toEqual(
      (plugin.toolbar ?? []).map((item) => item.id)
    )
  })

  it("builds the legacy descriptor arrays from the owners, preserving order", () => {
    for (const key of ["transformers", "toolbar", "insertions"] as const) {
      const owned = commonmarkSyntaxPlugins.flatMap<{ order?: number }>(
        (plugin) => plugin[key] ?? []
      )
      expect(commonmarkPlugin[key]).toEqual(
        owned.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      )
    }
    expect(commonmarkPlugin.features).toEqual(
      commonmarkSyntaxPlugins.flatMap((plugin) => plugin.features ?? [])
    )
  })
})
