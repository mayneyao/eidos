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
    const currentDocId = docId
    lock.current = true
    try {
      const initContent = await getDoc(docId)

      // If we've already switched to another document, ignore this result
      if (currentDocId !== docId) return

      let state = JSON.stringify(DefaultState)
      if (initContent) {
        try {
          state = initContent
        } catch (error) {
          console.error("Error parsing content:", error)
        }
      }

      editor.update(() => {
        // Double check docId inside the update lock
        if (currentDocId !== docId) return

        // Avoid calling setEditorState if content is already identical to minimize disruption
        // and preserve cursor/focus.
        const currentContent = JSON.stringify(editor.getEditorState().toJSON())
        if (currentContent === state && lastSavedContentRef.current === state) {
          lock.current = false
          return
        }

        const parsedState = editor.parseEditorState(state)
        editor.setEditorState(parsedState)
        lastSavedContentRef.current = state
        lock.current = false
      })
    } catch (error) {
      console.error("Error loading content:", error)
      if (currentDocId === docId) {
        lock.current = false
      }
    }
  }, [editor, docId, getDoc])

  const { run: debounceSave } = useDebounceFn(updateDoc, { wait: 500 })

  useEffect(() => {
    // CRITICAL: Synchronously lock and cancel pending saves when switching docs.
    // This prevents a pending save from doc A being applied to doc B if the
    // transition happens during the debounce window.
    lock.current = true
    debounceSave.cancel()
    lastSavedContentRef.current = ""

    loadInitialContent()
  }, [docId, loadInitialContent, debounceSave])

  useEffect(() => {
    editor.setEditable(Boolean(isEditable))
  }, [editor, isEditable])

  const handleSave = useCallback(async () => {
    if (!editor.isEditable()) return
    if (disableManuallySave) return

    // Cancel any pending debounced save to avoid racing
    debounceSave.cancel()

    const editorState = editor.getEditorState()
    const content = JSON.stringify(editorState.toJSON())

    // Skip if nothing changed since last confirmed save
    if (content === lastSavedContentRef.current) return

    let markdown = ""
    editorState.read(() => {
      markdown = $convertToMarkdownString(allTransformers)
    })

    await updateDoc(docId, content, markdown)
    // Note: We don't update lastSavedContentRef.current here.
    // The BroadcastChannel listener will update it once the DB write is confirmed.
  }, [docId, editor, updateDoc, debounceSave, disableManuallySave])

  useKeyPress(["ctrl.s", "meta.s"], (e) => {
    e.preventDefault()
    handleSave()
  })

  useEffect(() => {
    const unRegister = editor.registerUpdateListener(
      ({ editorState, prevEditorState }) => {
        if (lock.current) return

        const json = editorState.toJSON()
        const oldJson = prevEditorState.toJSON()
        const content = JSON.stringify(json)
        const oldContent = JSON.stringify(oldJson)

        if (content === oldContent) return

        let markdown = ""
        editorState.read(() => {
          markdown = $convertToMarkdownString(allTransformers)
        })

        debounceSave(docId, content, markdown)
        // CRITICAL: Removed pre-emptive update of lastSavedContentRef.current here.
        // Updating it here causes a race condition where older in-flight changes
        // can trigger a "refresh" because the current state matches the ref
        // but the DB update is an older version.
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

      // If database matches current editor state, no need to refresh,
      // just update our reference to match.
      const currentContent = JSON.stringify(editor.getEditorState().toJSON())
      if (latestContent === currentContent) {
        console.log(`[AutoLoadSavePlugin] DB matches editor, skipping refresh`)
        lastSavedContentRef.current = latestContent
        return
      }

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
      // currentContent already defined above
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
