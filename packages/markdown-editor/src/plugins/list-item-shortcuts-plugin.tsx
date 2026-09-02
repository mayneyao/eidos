import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  type LexicalNode,
} from "lexical"
import { useEffect } from "react"

import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"

type ListMoveDirection = "down" | "up"

function isNestedListWrapper(
  node: LexicalNode | null | undefined
): node is ListItemNode {
  return $isListItemNode(node) && $isListNode(node.getFirstChild())
}

function nearestContentListItem(node: LexicalNode): ListItemNode | null {
  let current: LexicalNode | null = node
  while (current) {
    if ($isListItemNode(current) && !isNestedListWrapper(current))
      return current
    current = current.getParent()
  }
  return null
}

function logicalItemTail(item: ListItemNode): ListItemNode {
  const next = item.getNextSibling()
  return isNestedListWrapper(next) ? next : item
}

function previousLogicalItem(item: ListItemNode): ListItemNode | null {
  const previous = item.getPreviousSibling()
  const candidate = isNestedListWrapper(previous)
    ? previous.getPreviousSibling()
    : previous
  return $isListItemNode(candidate) && !isNestedListWrapper(candidate)
    ? candidate
    : null
}

function nextLogicalItem(item: ListItemNode): ListItemNode | null {
  const candidate = logicalItemTail(item).getNextSibling()
  return $isListItemNode(candidate) && !isNestedListWrapper(candidate)
    ? candidate
    : null
}

function selectedListItem(): ListItemNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const anchor = nearestContentListItem(selection.anchor.getNode())
  const focus = nearestContentListItem(selection.focus.getNode())
  return anchor && focus && anchor.is(focus) ? anchor : null
}

/** Moves one logical item together with its immediately owned nested list. */
export function $moveListItem(
  item: ListItemNode,
  direction: ListMoveDirection
): boolean {
  const nestedList = isNestedListWrapper(item.getNextSibling())
    ? item.getNextSibling<ListItemNode>()
    : null

  if (direction === "up") {
    const target = previousLogicalItem(item)
    if (!target) return false
    target.insertBefore(item)
  } else {
    const target = nextLogicalItem(item)
    if (!target) return false
    logicalItemTail(target).insertAfter(item)
  }

  if (nestedList) item.insertAfter(nestedList)
  return true
}

/** Toggles a task-list item without converting ordinary list items. */
export function $toggleListItemChecked(item: ListItemNode): boolean {
  const checked = item.getChecked()
  if (checked === undefined) return false
  item.setChecked(!checked)
  return true
}

export function ListItemShortcutsPlugin() {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (!editor.isEditable() || event.defaultPrevented) return false
          const shouldToggle = matches(event, "list-item.toggle-checked")
          const direction = matches(event, "list-item.move-up")
            ? "up"
            : matches(event, "list-item.move-down")
              ? "down"
              : null
          if (!shouldToggle && !direction) return false
          const item = selectedListItem()
          if (!item) return false

          if (shouldToggle) {
            if (!$toggleListItemChecked(item)) return false
            event.preventDefault()
            $addUpdateTag(HISTORY_PUSH_TAG)
            return true
          }

          if (!direction) return false
          event.preventDefault()
          if ($moveListItem(item, direction)) $addUpdateTag(HISTORY_PUSH_TAG)
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor, matches]
  )

  return null
}
