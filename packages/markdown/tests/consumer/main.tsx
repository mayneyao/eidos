import { useState } from "react"
import { createRoot } from "react-dom/client"
import {
  MarkdownEditor,
  gfmMarkdownProfile,
  type MarkdownEditorProps,
} from "@eidos.space/markdown"
import { eidosMarkdownPlugins } from "@eidos.space/markdown/plugins"
import "@eidos.space/markdown/styles.css"
import { notePlugin } from "./note-plugin.js"
import GeneratedEditor from "./Editor.js"

const plugins = [...eidosMarkdownPlugins, notePlugin]

function App() {
  const [markdown, setMarkdown] = useState("# Consumer\n\n:::note\nHello\n:::")
  const props: MarkdownEditorProps = {
    documentKey: "consumer",
    markdown,
    onMarkdownChange: setMarkdown,
    plugins,
  }
  return (
    <>
      <GeneratedEditor />
      <MarkdownEditor {...props} />
      <MarkdownEditor
        documentKey="gfm-string"
        profile="gfm"
        markdown={markdown}
        onMarkdownChange={setMarkdown}
      />
      <MarkdownEditor
        documentKey="gfm-object"
        profile={gfmMarkdownProfile}
        markdown={markdown}
        onMarkdownChange={setMarkdown}
      />
    </>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing consumer root")
createRoot(root).render(<App />)
