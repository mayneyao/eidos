import { $createParagraphNode, createEditor } from "lexical"
import {
  resolveBlockBoundary,
  type MarkdownBlockBoundary,
} from "./block-boundary"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import {
  eidosMarkdownPlugins,
  obsidianMarkdownPlugins,
} from "../plugin-system/builtins"
import { $createEfmBlockNode } from "../nodes/efm-semantic-node"
import { $createEfmSourceBlockNode } from "../nodes/efm-source-block-node"
import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"

describe("plugin document boundaries", () => {
  it.each([
    { plugins: eidosMarkdownPlugins },
    { plugins: obsidianMarkdownPlugins },
  ])(
    "retains semantic and fallback boundaries in each profile",
    ({ plugins }) => {
      const registry = compileMarkdownPlugins(plugins)
      const editor = createEditor({
        nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      })
      editor.update(
        () => {
          expect(
            resolveBlockBoundary(
              $createEfmBlockNode({
                kind: "frontmatter",
                source: "---\nx: y\n---",
              }),
              registry.blockBoundaries
            )
          ).toBe("start")
          expect(
            resolveBlockBoundary(
              $createEfmSourceBlockNode("---\nx: [\n---", "frontmatter"),
              registry.blockBoundaries
            )
          ).toBe("start")
          expect(
            resolveBlockBoundary(
              $createEfmBlockNode({
                kind: "footnote-definition",
                source: "[^a]: note",
              }),
              registry.blockBoundaries
            )
          ).toBe("end")
          expect(
            resolveBlockBoundary(
              $createParagraphNode(),
              registry.blockBoundaries
            )
          ).toBeNull()
        },
        { discrete: true }
      )
    }
  )

  it("rejects contradictory claims", () => {
    const editor = createEditor()
    editor.update(
      () => {
        const start: MarkdownBlockBoundary = {
          id: "test.start",
          placement: "start",
          matches: () => true,
        }
        expect(() =>
          resolveBlockBoundary($createParagraphNode(), [
            start,
            { ...start, id: "test.end", placement: "end" },
          ])
        ).toThrow(/Conflicting block boundaries/u)
      },
      { discrete: true }
    )
  })

  it("validates unique namespaced IDs at compilation", () => {
    const boundary: MarkdownBlockBoundary = {
      id: "test.fixed",
      placement: "end",
      matches: () => true,
    }
    expect(() =>
      compileMarkdownPlugins([
        {
          apiVersion: 1,
          id: "test.plugin",
          version: "1",
          blockBoundaries: [boundary, boundary],
        },
      ])
    ).toThrow(/unique namespaced ID/u)
  })
})
