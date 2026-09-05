import { useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown"
import "@eidos.space/markdown/styles.css"
import { preset } from "./markdown-preset.js"

export default function Editor() {
  const [markdown, setMarkdown] = useState("# Your document\n\nStart writing.")
  return (
    <MarkdownEditor
      documentKey="my-document"
      preset={preset}
      markdown={markdown}
      onMarkdownChange={setMarkdown}
      showToolbar={false}
    />
  )
}
