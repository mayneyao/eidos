import { useCallback, useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useDebounceFn, useKeyPress } from "ahooks"

interface AutoSavePluginProps {
  onSave: (markdown: string) => void
  initContent?: string
}

const DefaultState = {
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
}

export function AutoSavePlugin(props: AutoSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { onSave, initContent } = props
  const versionRef = useRef(0)
  const lastSaveVersionRef = useRef(0)

  const handleSave = useCallback(() => {
    if (!editor.isEditable()) return
    if (lastSaveVersionRef.current === versionRef.current) {
    } else {
      const json = editor.getEditorState().toJSON()
      const content = JSON.stringify(json)
      onSave(content)
      lastSaveVersionRef.current = versionRef.current
    }
  }, [editor, onSave])

  const { run: debounceSave } = useDebounceFn(handleSave, {
    wait: 500,
  })

  useKeyPress("ctrl.s", (e) => {
    e.preventDefault()
    handleSave()
  })

  useEffect(() => {
    editor.update(() => {
      //   $convertFromMarkdownString(initContent ?? "", allTransformers)
      let state = JSON.stringify(DefaultState)
      if (initContent) {
        try {
          state = initContent
        } catch (error) {
        } finally {
          const parsedState = editor.parseEditorState(state)
          editor.setEditorState(parsedState)
        }
      } else {
        const parsedState = editor.parseEditorState(state)
        editor.setEditorState(parsedState)
      }
    })
  }, [editor, initContent])

  useEffect(() => {
    const unRegister = editor.registerTextContentListener((text: string) => {
      versionRef.current++
      editor.update(() => {
        debounceSave()
      })
    })
    return () => {
      unRegister()
    }
  }, [editor, debounceSave])

  return null
}
