import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

import defaultTheme from "@/components/doc/themes/default"

// too wired to import mermaid here, but it's necessary
// import mermaid let lexical code node recognize 'mermaid' language

import "prismjs/components/prism-mermaid"
import {
  useAllEditorNodes,
  useLoadingExtBlocks,
} from "../../hooks/use-all-nodes"
import { MarkdownLoaderPlugin } from "../MarkdownLoaderPlugin"

export const AIContentEditor = ({ markdown }: { markdown: string }) => {
  const allNodes = useAllEditorNodes()
  const isLoading = useLoadingExtBlocks()
  const initialConfig: InitialConfigType = {
    namespace: "AI-Chat-Input-Editor",
    theme: defaultTheme,
    onError: console.error,
    editable: false,
    nodes: allNodes,
  }
  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className=" relative">
        <RichTextPlugin
          contentEditable={<ContentEditable className="h-auto" />}
          placeholder={
            <div className=" pointer-events-none absolute left-3 top-2"></div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <MarkdownLoaderPlugin markdown={markdown} />
    </LexicalComposer>
  )
}
