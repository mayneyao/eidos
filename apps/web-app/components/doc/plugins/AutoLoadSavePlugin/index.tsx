import { useCallback, useEffect, useRef } from "react"
import { $convertToMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useDebounceFn, useKeyPress } from "ahooks"

import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
  type EidosDataEventChannelMsg,
} from "@/lib/const"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { allTransformers } from "../const"

interface AutoLoadSavePluginProps {
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

export function AutoLoadSavePlugin(props: AutoLoadSavePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { docId, disableManuallySave, isEditable } = props
  const lock = useRef(false)
  const { updateDoc, getDoc } = useSqlite()
  // Track last saved content to detect external changes
  const lastSavedContentRef = useRef<string>("")

  const loadInitialContent = useCallback(async () => {
    lock.current = true
    const initContent = await getDoc(docId)

    let state = JSON.stringify(DefaultState)
    if (initContent) {
      try {
        state = initContent
        lastSavedContentRef.current = initContent
      } catch (error) {
        console.error("Error parsing content:", error)
      }
    }

    editor.update(() => {
      const parsedState = editor.parseEditorState(state)
      editor.setEditorState(parsedState)
      editor.setEditable(Boolean(isEditable))
      lock.current = false
    })
  }, [editor, docId, getDoc, isEditable])

  useEffect(() => {
    loadInitialContent()
  }, [loadInitialContent])

  const handleSave = useCallback(async () => {
    if (!editor.isEditable()) return

    editor.update(async () => {
      const json = editor.getEditorState().toJSON()
      const content = JSON.stringify(json)
      const markdown = $convertToMarkdownString(allTransformers)
      await updateDoc(docId, content, markdown)
      // Update last saved content after successful save
      lastSavedContentRef.current = content
    })
  }, [docId, editor, updateDoc])

  useKeyPress(["ctrl.s", "meta.s"], (e) => {
    e.preventDefault()
    if (disableManuallySave) return
    handleSave()
  })

  const { run: debounceSave } = useDebounceFn(updateDoc, { wait: 500 })

  useEffect(() => {
    const unRegister = editor.registerUpdateListener(
      ({ editorState, prevEditorState }) => {
        if (lock.current) return

        editor.update(() => {
          const json = editorState.toJSON()
          const oldJson = prevEditorState.toJSON()
          const content = JSON.stringify(json)
          const oldContent = JSON.stringify(oldJson)

          if (content === oldContent) return

          const markdown = $convertToMarkdownString(allTransformers)
          debounceSave(docId, content, markdown)
          // Update last saved content
          lastSavedContentRef.current = content
        })
      }
    )
    return () => unRegister()
  }, [editor, debounceSave, docId])

  // Listen for external document updates via BroadcastChannel
  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data

      if (type !== EidosDataEventChannelMsgType.MetaTableUpdateSignalType)
        return

      const { table, _new, type: updateType } = payload

      // Only care about eidos__docs table updates for current docId
      if (table !== "eidos__docs") return
      if (!_new || _new.id !== docId) return
      if (
        updateType !== DataUpdateSignalType.Update &&
        updateType !== DataUpdateSignalType.Insert
      ) {
        return
      }

      console.log(
        `[AutoLoadSavePlugin] External update detected for doc ${docId}`
      )

      // Fetch latest content from database
      const latestContent = await getDoc(docId)
      if (!latestContent) return

      // Compare with last saved content (not current editor state)
      // This avoids triggering refresh for our own edits
      if (latestContent === lastSavedContentRef.current) {
        console.log(`[AutoLoadSavePlugin] Content matches last saved, skipping`)
        return
      }

      console.log(
        `[AutoLoadSavePlugin] Content differs from last saved, refreshing`
      )

      // Content is different from what we last saved - external update
      // Check if user has typed new content since last save
      const currentContent = JSON.stringify(editor.getEditorState().toJSON())
      const hasUnsavedChanges = currentContent !== lastSavedContentRef.current

      if (hasUnsavedChanges) {
        console.log(
          `[AutoLoadSavePlugin] Unsaved changes exist, skipping auto-refresh`
        )
        // Update lastSavedContentRef to the external content so we don't refresh again
        lastSavedContentRef.current = latestContent
        // TODO: Could show a toast notification here
        return
      }

      // No unsaved changes - safe to refresh
      loadInitialContent()
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [docId, loadInitialContent, editor, getDoc])

  return null
}
