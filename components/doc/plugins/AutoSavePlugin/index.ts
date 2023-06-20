import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import { useCallback, useEffect } from "react"


interface AutoSavePluginProps {
  onSave: (markdown: string) => void
  initContent?: string
}

export function AutoSavePlugin(props: AutoSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { onSave, initContent } = props
  useKeyPress("ctrl.s", (e) => {
    e.preventDefault()
    handleMarkdownToggle()
  })

  useEffect(() => {
    editor.update(() => {
      //   $convertFromMarkdownString(initContent ?? "", allTransformers)
      let state
      try {
        state = JSON.parse(initContent ?? "{}")
      } catch (error) {}
      if (state) {
        const parsedState = editor.parseEditorState(state)
        editor.setEditorState(parsedState)
      }
    })
  }, [initContent, editor])

  const handleMarkdownToggle = useCallback(() => {
    editor.update(() => {
      //   const markdown = $convertToMarkdownString(allTransformers)
      //   onSave(markdown)
      const json = editor.getEditorState().toJSON()
      onSave(JSON.stringify(json))
    })
  }, [editor, onSave])

  return null
}
