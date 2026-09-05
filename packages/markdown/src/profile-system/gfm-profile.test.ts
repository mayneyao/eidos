import {
  createEditor,
  $getRoot,
  $isElementNode,
  type LexicalNode,
} from "lexical"
import { $isTableNode } from "@lexical/table"
import { $isListItemNode } from "@lexical/list"
import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { $isEfmBlockNode, $isEfmInlineNode } from "../nodes/efm-semantic-node"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import { gfmMarkdownProfile } from "./builtins"

const registry = compileMarkdownPlugins(gfmMarkdownProfile.plugins)
function flatten(node: LexicalNode): LexicalNode[] {
  return [
    node,
    ...($isElementNode(node) ? node.getChildren().flatMap(flatten) : []),
  ]
}
function inspect(source: string) {
  const editor = createEditor({
    nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
    onError(error) {
      throw error
    },
  })
  editor.update(
    () => {
      gfmMarkdownProfile.codec.import(source, registry.transformers, {
        syntaxFeatures: registry.features,
      })
    },
    { discrete: true }
  )
  return editor.getEditorState().read(() => {
    const nodes = flatten($getRoot())
    return {
      nodes: nodes.map((node) => node.getType()),
      tables: nodes.filter($isTableNode).length,
      checked: nodes.filter($isListItemNode).map((node) => node.getChecked()),
      text: $getRoot().getTextContent(),
      blocks: nodes.filter($isEfmBlockNode).map((node) => node.getData()),
      inlines: nodes.filter($isEfmInlineNode).map((node) => node.getData()),
      markdown: gfmMarkdownProfile.codec.export(registry.transformers),
    }
  })
}

describe("GFM preset", () => {
  it.each(["---", ":---", "---:", ":---:"])(
    "imports and exports single-column tables with %s alignment",
    (delimiter) => {
      const source = `| Custom |\n| ${delimiter} |\n| Preserved |\n| |`
      const result = inspect(source)
      expect(result.tables).toBe(1)
      expect(result.nodes.filter((type) => type === "tablerow")).toHaveLength(3)
      expect(result.text).toContain("Preserved")
      expect(result.markdown).toBe(source.replace(/\| \|$/u, "|  |"))
      expect(inspect(result.markdown).tables).toBe(1)
    }
  )
  it.each(["| Header\n| ---\n| Value", "Header |\n--- |\nValue |"])(
    "accepts a single outer pipe: %s",
    (source) => {
      expect(inspect(source).tables).toBe(1)
    }
  )
  it("does not interpret ordinary pipe-separated text as a table", () => {
    expect(inspect("Left | Right\nNot a delimiter").tables).toBe(0)
  })
  it("includes every GFM extension family and excludes EFM/vault commands", () => {
    expect(registry.insertions.map((entry) => entry.labelKey)).toContain(
      "table"
    )
    expect(registry.insertions.map((entry) => entry.labelKey)).not.toContain(
      "blockMath"
    )
    expect(registry.features.has("efm.footnote")).toBe(false)
    expect(registry.features.has("obsidian.wikilink")).toBe(false)
    const result = inspect(
      "| Name | Value |\n| :--- | ---: |\n| A \\| B | 42 |\n\n- [x] Done\n- [ ] Next\n\n~~Removed~~\n\nwww.example.com and hello@example.com"
    )
    expect(result.tables).toBe(1)
    expect(result.checked).toEqual([true, false])
    expect(result.markdown).toContain("~~Removed~~")
    expect(
      result.inlines.filter((entry) => entry.kind === "autolink")
    ).toHaveLength(2)
  })
  it("does not interpret YAML envelopes, math fences or vault syntax as extensions", () => {
    const result = inspect(
      "---\ntitle: Notes\n---\n\n```math\nx^2\n```\n\nAn $equation$, ==highlight==, [[Note]] and ^[inline note]."
    )
    expect(
      result.blocks.some((entry) =>
        ["frontmatter", "math", "footnote"].includes(entry.kind)
      )
    ).toBe(false)
    expect(result.inlines).toEqual([])
    expect(result.nodes).not.toContain("efm-source-block")
    expect(result.markdown).toContain("```math")
    expect(result.text).toContain("[[Note]]")
  })
  it("retains disallowed HTML without executing it", () => {
    const source =
      '<script>alert("unsafe")</script>\n\n<iframe src="https://example.com"></iframe>'
    const result = inspect(source)
    expect(result.blocks.filter((entry) => entry.kind === "raw-html")).toEqual(
      []
    )
    expect(result.markdown).toBe(source)
  })
  it("supports CommonMark reference links, angle autolinks and container previews", () => {
    const result = inspect(
      "Heading\n=======\n\n[Guide][doc] and <https://example.com>\n\n[doc]: https://example.com\n\n> A **quote**.\n\n    indented code"
    )
    expect(result.markdown).toContain("[doc]: https://example.com")
    expect(result.inlines.some((entry) => entry.kind === "autolink")).toBe(true)
    expect(result.nodes).not.toContain("efm-source-block")
  })
})
