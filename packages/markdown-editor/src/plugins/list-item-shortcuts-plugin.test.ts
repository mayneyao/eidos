import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list"
import { createEditor, $getRoot, type ElementNode } from "lexical"

import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
} from "../markdown/efm-document"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "../markdown/markdown-transformers"
import { MARKDOWN_EDITOR_NODES } from "../nodes/node-registry"
import { $moveListItem } from "./list-item-shortcuts-plugin"

const ORIGINAL = [
  "- Alpha",
  "    - Alpha one",
  "    - Alpha two",
  "- Bravo",
  "    - Bravo child",
  "- Charlie",
].join("\n")

function readMarkdown(editor: ReturnType<typeof createEditor>): string {
  return editor
    .getEditorState()
    .read(() => $convertToEfmMarkdownString(EIDOS_MARKDOWN_TRANSFORMERS))
}

function listItems(list: ElementNode): ListItemNode[] {
  return list.getChildren().filter($isListItemNode)
}

describe("list item movement", () => {
  it("moves a parent item with its nested subtree", () => {
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () =>
        $convertFromEfmMarkdownString(ORIGINAL, EIDOS_MARKDOWN_TRANSFORMERS),
      { discrete: true }
    )

    editor.update(
      () => {
        const list = $getRoot().getFirstChild()
        expect($isListNode(list)).toBe(true)
        if (!$isListNode(list)) return
        expect($moveListItem(listItems(list)[0], "down")).toBe(true)
      },
      { discrete: true }
    )

    expect(readMarkdown(editor)).toBe(
      [
        "- Bravo",
        "    - Bravo child",
        "- Alpha",
        "    - Alpha one",
        "    - Alpha two",
        "- Charlie",
      ].join("\n")
    )
  })

  it("moves a nested item only among its siblings", () => {
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () =>
        $convertFromEfmMarkdownString(ORIGINAL, EIDOS_MARKDOWN_TRANSFORMERS),
      { discrete: true }
    )

    editor.update(
      () => {
        const list = $getRoot().getFirstChild()
        expect($isListNode(list)).toBe(true)
        if (!$isListNode(list)) return
        const nestedWrapper = listItems(list)[1]
        const nestedList = nestedWrapper.getFirstChild()
        expect($isListNode(nestedList)).toBe(true)
        if (!$isListNode(nestedList)) return
        expect($moveListItem(listItems(nestedList)[0], "down")).toBe(true)
      },
      { discrete: true }
    )

    expect(readMarkdown(editor)).toBe(
      [
        "- Alpha",
        "    - Alpha two",
        "    - Alpha one",
        "- Bravo",
        "    - Bravo child",
        "- Charlie",
      ].join("\n")
    )
  })

  it.each([
    {
      expected: "3. Second\n4. First",
      label: "ordered",
      source: "3. First\n4. Second",
    },
    {
      expected: "- [ ] Todo\n- [x] Done",
      label: "task",
      source: "- [x] Done\n- [ ] Todo",
    },
  ])("preserves $label list semantics", ({ expected, source }) => {
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () => $convertFromEfmMarkdownString(source, EIDOS_MARKDOWN_TRANSFORMERS),
      { discrete: true }
    )

    editor.update(
      () => {
        const list = $getRoot().getFirstChild()
        expect($isListNode(list)).toBe(true)
        if (!$isListNode(list)) return
        expect($moveListItem(listItems(list)[0], "down")).toBe(true)
      },
      { discrete: true }
    )

    expect(readMarkdown(editor)).toBe(expected)
  })

  it("does nothing at a sibling boundary", () => {
    const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
    editor.update(
      () =>
        $convertFromEfmMarkdownString(
          "- First\n- Second",
          EIDOS_MARKDOWN_TRANSFORMERS
        ),
      { discrete: true }
    )

    editor.update(
      () => {
        const list = $getRoot().getFirstChild()
        expect($isListNode(list)).toBe(true)
        if (!$isListNode(list)) return
        expect($moveListItem(listItems(list)[0], "up")).toBe(false)
      },
      { discrete: true }
    )

    expect(readMarkdown(editor)).toBe("- First\n- Second")
  })
})
