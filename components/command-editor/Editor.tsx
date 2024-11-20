import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

// import "./styles.css"
import { SlashCommandMenu } from "./SlashCommandMenu"
import { SlashCommandPlugin } from "./SlashCommandPlugin"

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return <div>{children}</div>
}

export function CommandInputEditor() {
  const initialConfig = {
    namespace: "MyEditor",
    onError: (error: Error) => console.error(error),
    theme: {
      root: "ContentEditable__root",
      placeholder: "Placeholder__root",
    },
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="editor-container">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="ContentEditable__root" />
          }
          placeholder={
            <div className="Placeholder__root">输入 / 开始使用命令...</div>
          }
          ErrorBoundary={ErrorBoundary}
        />
        <HistoryPlugin />
        <SlashCommandPlugin />
        <SlashCommandMenu />
      </div>
    </LexicalComposer>
  )
}
