import {
  $getRoot,
  $isElementNode,
  createEditor,
  type LexicalNode,
} from "lexical"

import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
} from "./efm-document"
import { MARKDOWN_EDITOR_NODES } from "../nodes/node-registry"
import { $isEfmBlockNode, $isEfmInlineNode } from "../nodes/efm-semantic-node"
import { $isEfmSourceBlockNode } from "../nodes/efm-source-block-node"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "./markdown-transformers"

function roundTrip(markdown: string): string {
  const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
  editor.update(
    () => {
      $convertFromEfmMarkdownString(markdown, EIDOS_MARKDOWN_TRANSFORMERS)
    },
    { discrete: true }
  )
  return editor
    .getEditorState()
    .read(() => $convertToEfmMarkdownString(EIDOS_MARKDOWN_TRANSFORMERS))
}

function descendants(node: LexicalNode): LexicalNode[] {
  return [
    node,
    ...($isElementNode(node) ? node.getChildren().flatMap(descendants) : []),
  ]
}

describe("Lexical Markdown round-trip", () => {
  it("reaches a stable canonical representation for supported Markdown", () => {
    const input = `# Portable document

Paragraph with **bold**, _italic_, ~~strike~~, and \`code\`.

- [x] Build the editor
- [ ] Verify the demo

> Markdown remains canonical.

---

\`\`\`ts
const editor = "lexical"
\`\`\`
`
    const first = roundTrip(input)
    const second = roundTrip(first)

    expect(second).toBe(first)
    expect(first).toContain("# Portable document")
    expect(first).toContain("- [x] Build the editor")
    expect(first).toContain('const editor = "lexical"')
  })

  it("preserves GFM tables, alignment, and inline formatting", () => {
    const input = `| Surface | Status | Price |
| :--- | :---: | ---: |
| Eidos | **Ready** | \`$9\` |
| Local | [Open](https://eidos.space) | $0 |
`
    const first = roundTrip(input)
    const second = roundTrip(first)

    expect(second).toBe(first)
    expect(first).toContain("| :--- | :---: | ---: |")
    expect(first).toContain("| Eidos | **Ready** | `$9` |")
    expect(first).toContain("[Open](https://eidos.space)")
  })

  it("imports EFM extensions as semantic nodes and preserves their source", () => {
    const input = `---
title: EFM example
tags:
  - markdown
---

# EFM document

Inline math $e^{i\\pi} + 1 = 0$ and a footnote[^source].

[^source]: A **formatted** definition.

![Preview](./preview.png "Local image")

[reference]: https://eidos.space "Eidos"

Use [the reference][reference].

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

\`\`\`math
\\sum_{i=1}^{n} i
\`\`\`

~~~math
x + y
~~~

<script>alert("never execute")</script>

==ordinary EFM text==
`
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () => {
        $convertFromEfmMarkdownString(input, EIDOS_MARKDOWN_TRANSFORMERS)
      },
      { discrete: true }
    )
    editor.getEditorState().read(() => {
      const nodes = descendants($getRoot())
      const blocks = nodes.filter($isEfmBlockNode)
      const inline = nodes.filter($isEfmInlineNode)
      const sourceBlocks = nodes.filter($isEfmSourceBlockNode)

      expect(blocks.map((node) => node.getData().kind)).toEqual([
        "frontmatter",
        "image",
        "reference-definition",
        "math",
        "math",
        "math",
        "footnote-definition",
      ])
      expect(inline.map((node) => node.getData().kind)).toEqual([
        "math",
        "footnote-reference",
        "reference-link",
      ])
      expect(sourceBlocks.map((node) => node.getKind())).toEqual(["raw-html"])
    })

    const first = editor
      .getEditorState()
      .read(() => $convertToEfmMarkdownString(EIDOS_MARKDOWN_TRANSFORMERS))
    const second = roundTrip(first)

    expect(second).toBe(first)
    expect(first).toContain("title: EFM example")
    expect(first).toContain("$e^{i\\pi} + 1 = 0$")
    expect(first).toContain("[^source]: A **formatted** definition.")
    expect(first).toContain("![Preview](./preview.png")
    expect(first).toContain("\\int_0^1 x^2\\,dx")
    expect(first).toContain('<script>alert("never execute")</script>')
    expect(first).toContain("==ordinary EFM text==")
  })

  it("round-trips empty formula and image placeholders as semantic blocks", () => {
    const input = `$$

$$

![]()`
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () => {
        $convertFromEfmMarkdownString(input, EIDOS_MARKDOWN_TRANSFORMERS)
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      const blocks = descendants($getRoot()).filter($isEfmBlockNode)
      expect(blocks.map((node) => node.getData().kind)).toEqual([
        "math",
        "image",
      ])
      expect(blocks.map((node) => node.getData().source)).toEqual([
        "$$\n\n$$",
        "![]()",
      ])
    })

    expect(roundTrip(input)).toBe(input)
  })

  it("supports the editor highlight extension and preserves its delimiters", () => {
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () => {
        $convertFromEfmMarkdownString(
          "Before ==highlighted text== after",
          EIDOS_MARKDOWN_TRANSFORMERS
        )
      },
      { discrete: true }
    )

    editor.getEditorState().read(() => {
      const highlighted = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === "highlighted text")
      expect(highlighted?.hasFormat("highlight")).toBe(true)
    })
    expect(
      editor
        .getEditorState()
        .read(() => $convertToEfmMarkdownString(EIDOS_MARKDOWN_TRANSFORMERS))
    ).toBe("Before ==highlighted text== after")
  })
})
