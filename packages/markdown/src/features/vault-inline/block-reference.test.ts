import {
  createEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
} from "lexical"
import { EfmInlineNode, $isEfmInlineNode } from "../../nodes/efm-semantic-node"
import {
  $ensureParagraphBlockId,
  blockReferenceMarkdown,
} from "./block-reference"

it("assigns the requested paragraph a stable ID without touching the caret's paragraph", () => {
  const editor = createEditor({ nodes: [EfmInlineNode] })
  editor.update(
    () => {
      const first = $createParagraphNode().append($createTextNode("First"))
      const second = $createParagraphNode().append($createTextNode("Second"))
      $getRoot().append(first, second)
      first.selectEnd()
      const id = $ensureParagraphBlockId(second.getKey())
      expect(id).toMatch(/^b-[a-f0-9]{12}$/u)
      expect($ensureParagraphBlockId(second.getKey())).toBe(id)
      expect(first.getTextContent()).toBe("First")
      expect(second.getChildren().filter($isEfmInlineNode)).toHaveLength(1)
      first.insertBefore(second)
      expect($ensureParagraphBlockId(second.getKey())).toBe(id)
    },
    { discrete: true }
  )
})

it("creates portable root paths or explicit same-document links", () => {
  expect(blockReferenceMarkdown("Notes/介绍.md", "b-123")).toBe(
    "[[/Notes/介绍.md#^b-123]]"
  )
  expect(blockReferenceMarkdown(undefined, "b-123")).toBe("[[#^b-123]]")
  expect(() => blockReferenceMarkdown("bad|path.md", "b-123")).toThrow()
})
