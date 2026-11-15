import { useState } from "react"
import {
  MarkdownEditor,
  type MarkdownNoteCandidate,
} from "@eidos.space/markdown"
import "@eidos.space/markdown/styles.css"
import { preset } from "./markdown-preset.js"

const files: MarkdownNoteCandidate[] = [
  {
    title: "示例 %20.png",
    displayPath: "素材/示例 %20.png",
    path: "%E7%B4%A0%E6%9D%90/%E7%A4%BA%E4%BE%8B%20%2520.png",
    imageUrl: "/%E7%B4%A0%E6%9D%90/%E7%A4%BA%E4%BE%8B%20%2520.png",
  },
]

export default function Editor() {
  const [markdown, setMarkdown] = useState("# Your document\n\nStart writing.")
  return (
    <MarkdownEditor
      documentKey="my-document"
      preset={preset}
      markdown={markdown}
      onMarkdownChange={setMarkdown}
      showToolbar={false}
      searchNotes={async () => files}
    />
  )
}
