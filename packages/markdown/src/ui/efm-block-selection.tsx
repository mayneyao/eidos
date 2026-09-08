import {
  $createNodeSelection,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  getComposedEventTarget,
  type LexicalEditor,
  type NodeKey,
} from "lexical"
import { useCallback, useEffect, useState } from "react"

type EfmBlockSelectionKind = "node" | null

const INTERACTIVE_SELECTOR = [
  "[data-efm-editor-interactive='true']",
  "button",
  "input",
  "textarea",
  "select",
  "a[href]",
].join(",")

function interactiveTarget(target: EventTarget | null): Element | null {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  return element?.closest(INTERACTIVE_SELECTOR) ?? null
}

export function EfmBlockSelection({
  editor,
  nodeKey,
}: {
  editor: LexicalEditor
  nodeKey: NodeKey
}) {
  const [selectionKind, setSelectionKind] =
    useState<EfmBlockSelectionKind>(null)

  const readSelectionKind = useCallback((): EfmBlockSelectionKind => {
    const selection = $getSelection()
    if ($isNodeSelection(selection) && selection.has(nodeKey)) return "node"
    return null
  }, [nodeKey])

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => setSelectionKind(readSelectionKind()))
      }),
    [editor, readSelectionKind]
  )

  useEffect(() => {
    const element = editor.getElementByKey(nodeKey)
    if (!element) return
    element.classList.toggle("eme-efm-block-selected", selectionKind === "node")
    if (selectionKind) {
      element.dataset.efmSelectionKind = selectionKind
    } else {
      delete element.dataset.efmSelectionKind
    }
    return () => {
      element.classList.remove("eme-efm-block-selected")
      delete element.dataset.efmSelectionKind
    }
  }, [editor, nodeKey, selectionKind])

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const block = editor.getElementByKey(nodeKey)
        const target = getComposedEventTarget(event)
        if (!(target instanceof Node) || !block?.contains(target)) return false
        if (interactiveTarget(target)) return false

        const selection = $getSelection()
        if (
          event.shiftKey ||
          ($isRangeSelection(selection) && !selection.isCollapsed())
        ) {
          return false
        }

        event.preventDefault()
        editor.getRootElement()?.focus({ preventScroll: true })
        const nextSelection = $createNodeSelection()
        nextSelection.add(nodeKey)
        $setSelection(nextSelection)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, nodeKey])

  return null
}
