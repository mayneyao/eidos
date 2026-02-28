import { createHeadlessEditor } from "@lexical/headless"
import { $convertToMarkdownString } from "@lexical/markdown"
import type { BaseSelection } from "lexical"
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  RootNode,
  $isTextNode,
} from "lexical"
import type { ListItemNode } from "@lexical/list"
import { $isListItemNode, $isListNode, ListNode } from "@lexical/list"

import { _getDocMarkdown } from "@/apps/web-app/hooks/use-doc-editor"

import { getAllNodes } from "../nodes"
import { allTransformers } from "../plugins/const"

export function $duplicateParagraph(isUp: boolean) {
  const selection = $getSelection()
  const nodes = selection?.getNodes()

  if (nodes?.length === 1) {
    const node = nodes[0]
    const paragraph = $isParagraphNode(node) ? node : node.getParent()

    if ($isParagraphNode(paragraph)) {
      const clone = $createParagraphNode()
      const text = $createTextNode(paragraph.getTextContent())
      clone.append(text)

      if (isUp) {
        paragraph.insertBefore(clone)
      } else {
        paragraph.insertAfter(clone)
      }

      if ($isRangeSelection(selection)) {
        const offset = selection.anchor.offset || 0
        const newSelection = $createRangeSelection()
        newSelection.anchor.set(text.getKey(), offset, "text")
        newSelection.focus.set(text.getKey(), offset, "text")
        $setSelection(newSelection)
      }
    }
  }
}

/**
 *
 * @param selection
 * @returns
 */
export function getMarkdownFromSelection(selection: BaseSelection | null) {
  if (selection === null) {
    return ""
  }
  const nodes = selection.getNodes()
  //   nodes are a list of nodes, each node has parent. prev, next. rebuild a node tree

  const editor = createHeadlessEditor({
    nodes: getAllNodes(),
    onError: () => {},
  })
  const _nodes = nodes.map((node) => node.exportJSON())

  try {
    const _state = {
      root: {
        children: [
          {
            children: [],
            direction: null,
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
          },
          ..._nodes,
        ],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    }
    console.log(_state)
    const state = editor.parseEditorState(JSON.stringify(_state))
    console.log(state)
    if (state.isEmpty()) {
      return ""
    }
    editor.update(
      () => {
        const root = $getRoot()
        const markdown = $convertToMarkdownString(allTransformers)
        console.log("markdown", markdown)
        return markdown
      },
      {
        discrete: true,
      }
    )
  } catch (error) {}
}

/**
 * Find the list item node from current selection
 * @param anchorNode The anchor node from selection
 * @returns ListItemNode if found, null otherwise
 */
export function $findListItemNode(anchorNode: any): ListItemNode | null {
  if ($isListItemNode(anchorNode)) {
    return anchorNode
  }

  // Check if we're inside a list item
  let parent = anchorNode.getParent()
  let depth = 0
  while (parent && depth < 10) {
    if ($isListItemNode(parent)) {
      return parent
    }
    parent = parent.getParent()
    depth++
  }

  return null
}

/**
 * Restore cursor position in a list item node
 * @param listItemNode The target list item node
 * @param currentOffset The original cursor offset
 */
export function $restoreCursorInListItem(
  listItemNode: ListItemNode,
  currentOffset: number
) {
  const firstChild = listItemNode.getFirstChild()
  if (firstChild) {
    const newSelection = $createRangeSelection()
    if ($isTextNode(firstChild)) {
      const textLength = firstChild.getTextContent().length
      const newOffset = Math.min(currentOffset, textLength)
      newSelection.anchor.set(firstChild.getKey(), newOffset, "text")
      newSelection.focus.set(firstChild.getKey(), newOffset, "text")
    } else {
      newSelection.anchor.set(listItemNode.getKey(), 0, "element")
      newSelection.focus.set(listItemNode.getKey(), 0, "element")
    }
    $setSelection(newSelection)
  }
}

/**
 * Move a list item up or down within its parent list
 * @param isUp Whether to move up (true) or down (false)
 * @returns Whether the move operation was successful
 */
export function $moveListItem(isUp: boolean): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) {
    return false
  }

  const anchorNode = selection.anchor.getNode()
  const listItemNode = $findListItemNode(anchorNode)

  if (!listItemNode) {
    return false
  }

  // Get the sibling to swap with
  const sibling = isUp
    ? listItemNode.getPreviousSibling()
    : listItemNode.getNextSibling()
  if (!sibling || !$isListItemNode(sibling)) {
    return false
  }

  // Store current selection info before moving
  const currentOffset = selection.anchor.offset

  // Move the list item
  listItemNode.remove()
  if (isUp) {
    sibling.insertBefore(listItemNode)
  } else {
    sibling.insertAfter(listItemNode)
  }

  // Restore cursor position
  $restoreCursorInListItem(listItemNode, currentOffset)

  return true
}

/**
 * Toggle the checked state of a checklist item
 * @returns Whether the toggle operation was successful
 */
export function $toggleCheckList(): boolean {
  const selection = $getSelection()
  const nodes = selection?.getNodes()

  if (nodes?.length !== 1) {
    return false
  }

  const node = nodes[0]

  if ($isListItemNode(node)) {
    const parent = node.getParent()
    if ($isListNode(parent) && parent.getListType() === "check") {
      ;(node as ListItemNode).toggleChecked()
      return true
    }
  } else if ($isListItemNode(node.getParent())) {
    const parent = node.getParent() as ListItemNode
    const listNode = parent.getParent()
    if ($isListNode(listNode) && listNode.getListType() === "check") {
      parent.toggleChecked()
      return true
    }
  }

  return false
}
