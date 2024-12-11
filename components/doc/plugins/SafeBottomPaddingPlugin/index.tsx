import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode"
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
} from "lexical"

export const SafeBottomPaddingPlugin = () => {
  const [editor] = useLexicalComposerContext()

  const insertPlaceholder = () => {
    editor.update(() => {
      const root = $getRoot()
      const lastNode = root.getLastChild()

      if ($isDecoratorBlockNode(lastNode)) {
        const paragraph = $createParagraphNode()
        const text = $createTextNode("")
        paragraph.append(text)
        root.append(paragraph)

        const selection = $createRangeSelection()
        selection.anchor.set(text.getKey(), 0, "text")
        selection.focus.set(text.getKey(), 0, "text")
        $setSelection(selection)
      }
    })
  }

  return (
    <div
      className="h-56 w-full"
      role="safe-bottom-padding"
      onClick={insertPlaceholder}
    ></div>
  )
}
