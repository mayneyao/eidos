import { useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

export function FocusRequestPlugin({
  token,
  readOnly,
}: {
  token: number
  readOnly: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const acceptedToken = useRef(token)

  useEffect(() => {
    if (acceptedToken.current === token) return
    acceptedToken.current = token
    if (readOnly) return
    // DOM focus alone is a no-op when clicking editor whitespace has already
    // focused the root without leaving a text selection inside it.
    editor.focus(
      () => editor.getRootElement()?.focus({ preventScroll: true }),
      { defaultSelection: "rootStart" }
    )
  }, [editor, token, readOnly])

  return null
}
