import type { InitialConfigType } from "@lexical/react/LexicalComposer"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

import defaultTheme from "@/components/doc/themes/default"

// Mermaid language support is handled by Shiki, no need for Prism import
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
