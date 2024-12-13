import { useCallback, useEffect, useRef } from "react"
import { $convertToMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useDebounceFn, useKeyPress } from "ahooks"

import { useSqlite } from "@/hooks/use-sqlite"

import { allTransformers } from "../const"

interface AutoSavePluginProps {
  docId: string
  disableManuallySave?: boolean
  isEditable?: boolean
}

export const DefaultState = {
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

// this plugin is just used for eidos doc not a general plugin
export function EidosAutoSavePlugin(props: AutoSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { docId } = props
  const lock = useRef(false)
  const { updateDoc, getDoc } = useSqlite()

  useEffect(() => {
    editor.setEditable(Boolean(props.isEditable))
  }, [editor, props.isEditable])

  const handleSave = useCallback(async () => {
    if (!editor.isEditable()) return
    const json = editor.getEditorState().toJSON()
    const content = JSON.stringify(json)
    editor.update(async () => {
      const markdown = $convertToMarkdownString(allTransformers)
      await updateDoc(docId, content, markdown)
    })
  }, [docId, editor, updateDoc])

  useKeyPress(["ctrl.s", "meta.s"], (e) => {
    e.preventDefault()
    if (props.disableManuallySave) {
      return
    }
    handleSave()
  })

  useEffect(() => {
    lock.current = true
    getDoc(docId).then((initContent) => {
      let state = JSON.stringify(DefaultState)
      if (initContent) {
        try {
          state = initContent
        } catch (error) {
        } finally {
          editor.update(() => {
            const parsedState = editor.parseEditorState(state)
            editor.setEditorState(parsedState)
            lock.current = false
          })
        }
      } else {
        editor.update(() => {
          const parsedState = editor.parseEditorState(state)
          editor.setEditorState(parsedState)
          lock.current = false
        })
      }
    })
  }, [editor, docId, getDoc])

  const { run: debounceSave } = useDebounceFn(updateDoc, {
    wait: 500,
  })

  useEffect(() => {
    const unRegister = editor.registerUpdateListener(
      ({ editorState, prevEditorState, tags }) => {
        if (lock.current) {
          return
        }
        editor.update(() => {
          const json = editorState.toJSON()
          const oldJson = prevEditorState.toJSON()
          const content = JSON.stringify(json)
          const oldContent = JSON.stringify(oldJson)
          if (content === oldContent) {
            return
          }
          const markdown = $convertToMarkdownString(allTransformers)
          debounceSave(docId, content, markdown)
        })
      }
    )
    return () => {
      unRegister()
    }
  }, [editor, debounceSave, docId])

  return null
}
