'use client'

import { useEffect } from "react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin"
import { $getRoot, $getSelection, EditorState, LexicalEditor } from "lexical"

const theme = {
  // Theme styling goes here
}

// Lexical React plugins are React components, which makes them
// highly composable. Furthermore, you can lazy load plugins if
// desired, so you don't pay the cost for plugins until you
// actually use them.
function MyCustomAutoFocusPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Focus the editor when the effect fires!
    editor.focus()
  }, [editor])

  return null
}

// Catch any errors that occur during Lexical updates and log them
// or throw them as needed. If you don't throw them, Lexical will
// try to recover gracefully without losing user data.
function onError(error: any) {
  console.error(error)
}

export function DocEditor() {
  const initialConfig = {
    namespace: "MyEditor",
    theme,
    onError,
  }
  // When the editor changes, you can get notified via the
  // LexicalOnChangePlugin!
  function onChange(
    editorState: EditorState,
    editor: LexicalEditor,
    tags: Set<string>
  ) {
    editorState.read(() => {
      // Read the contents of the EditorState here.
      const root = $getRoot()
      const selection = $getSelection()

      console.log(root, selection)
    })
  }
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <PlainTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={<div>Enter some text...</div>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <OnChangePlugin onChange={onChange} />
      <HistoryPlugin />
      <MyCustomAutoFocusPlugin />
    </LexicalComposer>
  )
}
