import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

export default function MyDocPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // TODO: add doc plugin logic here
  }, [editor])

  return null
}
