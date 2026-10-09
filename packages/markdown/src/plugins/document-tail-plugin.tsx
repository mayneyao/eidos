import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $getRoot,
  $isParagraphNode,
  HISTORY_PUSH_TAG,
} from "lexical"

/** The existing bottom padding is a writing target, including after decorators. */
export function DocumentTailPlugin({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (readOnly) return
    let press: { id: number; x: number; y: number; time: number } | null = null
    return editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener("pointerdown", startPress)
      previousRoot?.parentElement?.removeEventListener("pointerup", insertAtEnd)
      previousRoot?.parentElement?.removeEventListener(
        "pointercancel",
        cancelPress
      )
      press = null
      root?.addEventListener("pointerdown", startPress)
      root?.parentElement?.addEventListener("pointerup", insertAtEnd)
      root?.parentElement?.addEventListener("pointercancel", cancelPress)
    })
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
      while (last?.hasAttribute("data-lexical-decorator-boundary"))
        last = last.previousElementSibling
      if (last && event.clientY < last.getBoundingClientRect().bottom) return
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      }
    }
    function insertAtEnd(event: PointerEvent) {
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
      // keyboard opens. Inserting on pointerdown lets WebKit reset the caret.
      event.preventDefault()
      editor.update(
        () => {
          const document = $getRoot()
          const lastNode = document.getLastChild()
          const paragraph =
            $isParagraphNode(lastNode) && lastNode.isEmpty()
              ? lastNode
              : $createParagraphNode()
          if (paragraph !== lastNode) document.append(paragraph)
          paragraph.selectEnd()
        },
        { discrete: true, tag: HISTORY_PUSH_TAG }
      )
      editor.focus(undefined, { defaultSelection: "rootEnd" })
    }
  }, [editor, readOnly])
  return null
}
