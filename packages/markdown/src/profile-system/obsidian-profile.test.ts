import {
  createEditor,
  $getRoot,
  $isElementNode,
  type LexicalNode,
} from "lexical"

import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { $isEfmBlockNode, $isEfmInlineNode } from "../nodes/efm-semantic-node"
import {
  EIDOS_MARKDOWN_PLUGIN_REGISTRY,
  OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY,
} from "../plugin-system/builtins"
import { eidosMarkdownProfile, obsidianMarkdownProfile } from "./builtins"

function nodeAndDescendants(node: LexicalNode): LexicalNode[] {
  return [
    node,
    ...($isElementNode(node)
      ? node.getChildren().flatMap(nodeAndDescendants)
      : []),
  ]
}

function descendants() {
  return $getRoot().getChildren().flatMap(nodeAndDescendants)
}

describe("Obsidian Markdown profile", () => {
  it("does not enable Obsidian semantics in the Eidos profile", () => {
    const editor = createEditor({
      nodes: [
        ...MARKDOWN_EDITOR_CORE_NODES,
        ...EIDOS_MARKDOWN_PLUGIN_REGISTRY.nodes,
      ],
    })
    const source = "Plain [[Note]], #tag, and %%comment%%. ^stable"
    editor.update(
      () => {
        eidosMarkdownProfile.codec.import(
          source,
          EIDOS_MARKDOWN_PLUGIN_REGISTRY.transformers,
          {
            inputProfile: "document",
            syntaxFeatures: EIDOS_MARKDOWN_PLUGIN_REGISTRY.features,
          }
        )
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      expect(descendants().filter($isEfmInlineNode)).toEqual([])
      expect(
        eidosMarkdownProfile.codec.export(
          EIDOS_MARKDOWN_PLUGIN_REGISTRY.transformers
        )
      ).toBe(source)
    })
  })

  it("imports Obsidian syntax only when its document profile is active", () => {
    const editor = createEditor({
      nodes: [
        ...MARKDOWN_EDITOR_CORE_NODES,
        ...OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY.nodes,
      ],
    })
    const source = `# Project

See [[Notes/Physics#Energy|the note]], ![[assets/chart.png|120x80]], and #research.

![Wide preview|240x120](assets/wide.png)

![250](assets/unlabelled.png)

An inline ^[Footnote body] and an %%editor comment%%. ^stable-block

> [!warning]- Watch out
> This is **important**.
`

    editor.update(
      () => {
        obsidianMarkdownProfile.codec.import(
          source,
          OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY.transformers,
          {
            inputProfile: "document",
            syntaxFeatures: OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY.features,
          }
        )
      },
      { discrete: true }
    )

    const snapshot = editor.getEditorState().read(() => {
      const nodes = descendants()
      return {
        blocks: nodes.filter($isEfmBlockNode).map((node) => node.getData()),
        inlines: nodes.filter($isEfmInlineNode).map((node) => node.getData()),
        markdown: obsidianMarkdownProfile.codec.export(
          OBSIDIAN_MARKDOWN_PLUGIN_REGISTRY.transformers
        ),
      }
    })

    expect(snapshot.blocks.map((block) => block.kind)).toContain(
      "obsidian-callout"
    )
    expect(snapshot.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "image",
          alt: "Wide preview",
          width: 240,
          height: 120,
          obsidian: true,
        }),
        expect.objectContaining({
          kind: "image",
          alt: "",
          width: 250,
          obsidian: true,
        }),
      ])
    )
    expect(snapshot.inlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "obsidian-link",
          path: "Notes/Physics",
          heading: "Energy",
          label: "the note",
        }),
        expect.objectContaining({
          kind: "obsidian-embed",
          path: "assets/chart.png",
          width: 120,
          height: 80,
        }),
        expect.objectContaining({ kind: "obsidian-tag", value: "research" }),
        expect.objectContaining({
          kind: "obsidian-inline-footnote",
          value: "Footnote body",
        }),
        expect.objectContaining({
          kind: "obsidian-comment",
          value: "editor comment",
        }),
        expect.objectContaining({
          kind: "obsidian-block-id",
          identifier: "stable-block",
        }),
      ])
    )
    expect(snapshot.markdown).toContain("[[Notes/Physics#Energy|the note]]")
    expect(snapshot.markdown).toContain("![[assets/chart.png|120x80]]")
    expect(snapshot.markdown).toContain(
      "![Wide preview|240x120](assets/wide.png)"
    )
    expect(snapshot.markdown).toContain("![250](assets/unlabelled.png)")
    expect(snapshot.markdown).toContain("> [!warning]- Watch out")
    expect(snapshot.markdown).toBe(source.trimEnd())
  })
})
