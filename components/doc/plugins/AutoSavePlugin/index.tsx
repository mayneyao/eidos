import { useCallback, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useDebounceFn, useKeyPress } from "ahooks"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AutoSavePluginProps {
  onSave: (markdown: string) => void
  initContent?: string
  autoSave?: boolean
}

export function AutoSavePlugin(props: AutoSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { onSave, initContent } = props
  const versionRef = useRef(0)
  const lastSaveVersionRef = useRef(0)
  const [content, setContent] = useState<string>("")

  const handleSave = useCallback(() => {
    if (!editor.isEditable) return
    if (lastSaveVersionRef.current === versionRef.current) {
    } else {
      const json = editor.getEditorState().toJSON()
      const content = JSON.stringify(json)
      onSave(content)
      lastSaveVersionRef.current = versionRef.current
    }
  }, [editor, onSave])

  const { run: debounceSave } = useDebounceFn(handleSave, {
    wait: 3000,
  })

  useKeyPress("ctrl.s", (e) => {
    e.preventDefault()
    handleSave()
  })

  useEffect(() => {
    editor.update(() => {
      //   $convertFromMarkdownString(initContent ?? "", allTransformers)
      let state: any
      try {
        state = JSON.parse(initContent ?? "{}")
      } catch (error) {}
      if (initContent && state) {
        setTimeout(() => {
          const parsedState = editor.parseEditorState(state)
          editor.setEditorState(parsedState)
        }, 0)
      }
    })
    const unRegister = editor.registerTextContentListener((text: string) => {
      versionRef.current++
      editor.update(() => {
        debounceSave()
      })
    })
    return () => {
      unRegister()
    }
  }, [initContent, editor, debounceSave])

  const handleImport = () => {
    editor.update(() => {
      const parsedState = editor.parseEditorState(content)
      editor.setEditorState(parsedState)
    })
  }

  return null
  // import editor state in dev mode
  return (
    <div>
      <Input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button onClick={handleImport}>import</Button>
    </div>
  )
}
