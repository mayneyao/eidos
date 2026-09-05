import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { Transformer } from "@lexical/markdown"
import { TextNode, type TextFormatType } from "lexical"

const TEXT_FORMATS: readonly TextFormatType[] = [
  "bold",
  "italic",
  "strikethrough",
  "underline",
  "code",
  "highlight",
  "subscript",
  "superscript",
  "lowercase",
  "uppercase",
  "capitalize",
]

/** Native HTML/JSON paste must not introduce formats the preset cannot export. */
export function TextFormatPolicyPlugin({
  transformers,
}: {
  transformers: readonly Transformer[]
}) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const allowed = new Set(
      transformers.flatMap((transformer) =>
        transformer.type === "text-format" ? transformer.format : []
      )
    )
    const disabled = TEXT_FORMATS.filter((format) => !allowed.has(format))
    return editor.registerNodeTransform(TextNode, (node) => {
      for (const format of disabled) {
        if (node.hasFormat(format)) node.toggleFormat(format)
      }
    })
  }, [editor, transformers])
  return null
}
