import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

export const AutoEditable = ({ editable }: { editable: boolean }) => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.setEditable(editable)
  }, [editable, editor])
  return null
}
