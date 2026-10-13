import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  $setState,
  COMMAND_PRIORITY_HIGH,
  HISTORIC_TAG,
  INSERT_PARAGRAPH_COMMAND,
  ParagraphNode,
  createState,
  type EditorState,
  type LexicalEditor,
} from "lexical"

const pendingTail = createState("eidosPendingWritingLine", {
  parse: (value) => value === true,
})

/** A focused writing line is UI state until the user actually edits it. */
export function documentStateWithoutPendingTail(
  editor: LexicalEditor,
  state: EditorState
): EditorState {
  const pending = state.read(() => {
    const node = $getRoot().getLastChild()
    return (
      $isParagraphNode(node) && node.isEmpty() && $getState(node, pendingTail)
    )
  })
  // NodeState follows undo/redo snapshots, including the first input and Enter.
  if (!pending) return state
  const serialized = state.toJSON()
  serialized.root.children.pop()
  return editor.parseEditorState(serialized)
}

/** The existing bottom padding is a writing target, including after decorators. */
export function DocumentTailPlugin({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (readOnly) return
    let press: { id: number; x: number; y: number; time: number } | null = null
    const unregisterInput = editor.registerNodeTransform(
      ParagraphNode,
      (node) => {
        if (!node.isEmpty() && $getState(node, pendingTail))
          $setState(node, pendingTail, false)
      }
    )
    const unregisterEnter = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        // Enter is an explicit request for a document line, including blank
        // lines. Let Lexical perform the edit and record its normal history.
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const node = selection.anchor.getNode()
          const paragraph = $isParagraphNode(node) ? node : node.getParent()
          if ($isParagraphNode(paragraph) && $getState(paragraph, pendingTail))
            $setState(paragraph, pendingTail, false)
        }
        return false
      },
      COMMAND_PRIORITY_HIGH
    )
    const unregisterRoot = editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener("pointerdown", startPress)
      previousRoot?.parentElement?.removeEventListener("pointerup", selectAtEnd)
      previousRoot?.parentElement?.removeEventListener(
        "pointercancel",
        cancelPress
      )
      press = null
      root?.addEventListener("pointerdown", startPress)
      root?.parentElement?.addEventListener("pointerup", selectAtEnd)
      root?.parentElement?.addEventListener("pointercancel", cancelPress)
    })
    return () => {
      unregisterEnter()
      unregisterInput()
      unregisterRoot()
    }
    function cancelPress() {
      press = null
    }
    function startPress(event: PointerEvent) {
      press = null
      const root = editor.getRootElement()
      if (
        !root ||
        event.target !== root ||
        event.button !== 0 ||
        !editor.isEditable() ||
        editor.isComposing()
      )
        return
      // WebKit adds zero-size caret boundaries around decorators.
      let last = root.lastElementChild
      while (
        last?.hasAttribute("data-lexical-decorator-boundary") ||
        last?.hasAttribute("data-lexical-cursor")
      )
        last = last.previousElementSibling
      if (last && event.clientY < last.getBoundingClientRect().bottom) return
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      }
    }
    function selectAtEnd(event: PointerEvent) {
      const start = press
      press = null
      if (
        !start ||
        start.id !== event.pointerId ||
        Date.now() - start.time >= 500 ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10 ||
        !editor.isEditable() ||
        editor.isComposing()
      )
        return
      // Finish after native selection and desktop marquee cleanup, before the
      // keyboard opens. Selecting on pointerdown lets WebKit reset the caret.
      event.preventDefault()
      editor.update(
        () => {
          const document = $getRoot()
          const lastNode = document.getLastChild()
          if ($isParagraphNode(lastNode) && lastNode.isEmpty()) {
            lastNode.selectEnd()
          } else {
            const paragraph = $createParagraphNode()
            $setState(paragraph, pendingTail, true)
            document.append(paragraph)
            paragraph.selectEnd()
          }
        },
        // Provide a native caret and editing context without adding a user
        // undo step. Serialization omits this line while it is still pending.
        { discrete: true, tag: HISTORIC_TAG }
      )
      editor.focus(undefined, { defaultSelection: "rootEnd" })
    }
  }, [editor, readOnly])
  return null
}
