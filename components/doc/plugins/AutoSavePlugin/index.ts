import { useCallback, useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"

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

  useKeyPress("ctrl.s", (e) => {
    e.preventDefault()
    handleMarkdownToggle()
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
    editor.registerTextContentListener((text: string) => {
      versionRef.current++
    })
  }, [initContent, editor])

  const handleMarkdownToggle = useCallback(() => {
    if (lastSaveVersionRef.current === versionRef.current) {
    } else {
      const json = editor.getEditorState().toJSON()
      const content = JSON.stringify(json)
      onSave(content)
      lastSaveVersionRef.current = versionRef.current
    }
  }, [editor, onSave])

  useEffect(() => {
    if (props.autoSave) {
      const timer = setInterval(() => {
        handleMarkdownToggle()
      }, 1000 * 10)
      return () => {
        clearInterval(timer)
      }
    }
  }, [handleMarkdownToggle, props.autoSave])

  return null
}
