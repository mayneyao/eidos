import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

import defaultTheme from "@/components/doc/themes/default"

import { AllNodes } from "../../nodes"
import { MarkdownLoaderPlugin } from "../MarkdownLoaderPlugin"

export const AIContentEditor = ({ markdown }: { markdown: string }) => {
  const initialConfig: InitialConfigType = {
    namespace: "AI-Chat-Input-Editor",
    theme: defaultTheme,
    onError: console.error,
    editable: false,
    nodes: AllNodes,
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
