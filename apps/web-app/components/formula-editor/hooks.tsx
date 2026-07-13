import { useEffect, useRef, useState } from "react"
import { completionStatus } from "@codemirror/autocomplete"
import type { EditorView } from "codemirror"

import type { Udf, UiColumn } from "./completions"

export interface UseEditorProps {
  editorRef: React.RefObject<HTMLDivElement>
  editorViewRef: React.MutableRefObject<EditorView | null>
  initializedRef: React.MutableRefObject<boolean>
  value: string
  onChange: (value: string) => void
  onSave?: (value: string) => void
  onEsc?: () => void
  columns?: UiColumn[]
  udfs?: Udf[]
  createEditorView: (
    element: HTMLElement,
    value: string,
    onChange: (value: string) => void,
    onSave?: (value: string) => void,
    uiColumns?: UiColumn[],
    udfs?: Udf[],
    language?: string,
    onEsc?: () => void,
    height?: string,
    onCurrentTokenChange?: (
      token: { text: string; type: string } | null
    ) => void,
    onArrowUp?: () => void,
    onArrowDown?: () => void,
    onEnter?: () => void,
    placeholder?: string,
    disableAutocompletion?: boolean,
    disabled?: boolean
  ) => EditorView
  language?: string
  theme?: "light" | "dark"
  height?: string
  onCurrentTokenChange?: (token: { text: string; type: string } | null) => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onEnter?: () => void
  onAiComplete?: (prompt: string) => void
  placeholder?: string
  disableAutocompletion?: boolean
  disabled?: boolean
}

/**
 * Custom hook to manage the CodeMirror editor instance
 */
export function useEditor({
  editorRef,
  editorViewRef,
  initializedRef,
  value,
  onChange,
  onSave,
  onEsc,
  columns,
  udfs,
  createEditorView,
  language = "sql",
  theme = "light",
  height = "100px",
  onCurrentTokenChange,
  onArrowUp,
  onArrowDown,
  onEnter,
  onAiComplete,
  placeholder,
  disableAutocompletion,
  disabled = false,
}: UseEditorProps) {
  // Track completion state
  const [isCompletionActive, setIsCompletionActive] = useState(false)
  // Track AI prompt mode
  const [isAiPromptMode, setIsAiPromptMode] = useState(false)

  // Add a flag to track if the editor is destroyed
  const isDestroyedRef = useRef(false)

  // Initialize editor
  useEffect(() => {
    if (
      editorRef.current &&
      !initializedRef.current &&
      typeof window !== "undefined"
    ) {
      isDestroyedRef.current = false

      const view = createEditorView(
        editorRef.current,
        value,
        onChange,
        onSave,
        columns,
        udfs,
        language,
        onEsc,
        height,
        onCurrentTokenChange,
        onArrowUp,
        onArrowDown,
        onEnter,
        placeholder,
        // Disable autocompletion if explicitly requested or if in AI prompt mode
        disableAutocompletion ||
          (Boolean(onAiComplete) && value.trim().startsWith("//")),
        disabled
      )
      editorViewRef.current = view
      initializedRef.current = true

      // Set up a more reliable completion detection using state polling
      const checkCompletionStatus = () => {
        if (editorViewRef.current && !isDestroyedRef.current) {
          const isActive =
            completionStatus(editorViewRef.current.state) !== null
          if (isActive !== isCompletionActive) {
            setIsCompletionActive(isActive)
          }
        }
      }

      // Check initially
      checkCompletionStatus()

      // Set up interval to check regularly - use a shorter interval for better responsiveness
      const intervalId = setInterval(checkCompletionStatus, 50)

      // Always return a cleanup function
      return () => {
        clearInterval(intervalId)
        isDestroyedRef.current = true
        if (editorViewRef.current) {
          try {
            editorViewRef.current.destroy()
          } catch (error) {
            console.error("Error destroying editor:", error)
          }
          editorViewRef.current = null
          initializedRef.current = false
        }
      }
    }

    // Return a cleanup function even if we didn't initialize
    return () => {
      isDestroyedRef.current = true
      if (editorViewRef.current) {
        try {
          editorViewRef.current.destroy()
        } catch (error) {
          console.error("Error destroying editor:", error)
        }
        editorViewRef.current = null
        initializedRef.current = false
      }
    }
  }, [])

  // Handle external value changes
  useEffect(() => {
    if (
      editorViewRef.current &&
      initializedRef.current &&
      !isDestroyedRef.current &&
      editorViewRef.current.state.doc.toString() !== value
    ) {
      const currentCursor = editorViewRef.current.state.selection.main

      // Create a valid selection that's within the bounds of the new document
      const validSelection = {
        anchor: Math.min(currentCursor.anchor, value.length),
        head: Math.min(currentCursor.head, value.length),
      }

      const transaction = editorViewRef.current.state.update({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: value,
        },
        selection: validSelection,
      })

      editorViewRef.current.dispatch(transaction)
    }
  }, [value])

  // Check if content starts with // to enable AI prompt mode
  useEffect(() => {
    if (
      editorViewRef.current &&
      initializedRef.current &&
      !isDestroyedRef.current
    ) {
      const content = editorViewRef.current.state.doc.toString()
      const newAiPromptMode =
        Boolean(onAiComplete) && content.trim().startsWith("//")

      if (newAiPromptMode !== isAiPromptMode) {
        setIsAiPromptMode(newAiPromptMode)

        // If we're entering or exiting AI prompt mode, we need to recreate the editor
        // to enable/disable autocompletion appropriately
        if (editorRef.current) {
          // Save current state
          const currentValue = content
          const currentCursor = editorViewRef.current.state.selection.main

          // Check if editor was focused before recreation
          const editorElement = editorViewRef.current.dom
          const wasFocused =
            document.activeElement === editorElement ||
            editorElement.contains(document.activeElement)

          // Destroy current editor
          editorViewRef.current.destroy()

          // Create new editor with appropriate autocompletion setting
          const view = createEditorView(
            editorRef.current,
            currentValue,
            onChange,
            onSave,
            columns,
            udfs,
            language,
            onEsc,
            height,
            onCurrentTokenChange,
            onArrowUp,
            onArrowDown,
            onEnter,
            placeholder,
            // Disable autocompletion if explicitly requested or if in AI prompt mode
            disableAutocompletion || newAiPromptMode,
            disabled
          )

          // Restore cursor position
          const validHead = Math.min(currentCursor.head, currentValue.length)
          view.dispatch({
            selection: { anchor: validHead, head: validHead },
          })

          editorViewRef.current = view

          // Restore focus if the editor was focused before
          if (wasFocused) {
            // Use a single focus attempt with a small delay to avoid disrupting IME
            try {
              // Single focus attempt with slight delay to let DOM stabilize
              setTimeout(() => {
                console.log("focusing")
                if (view && !isDestroyedRef.current) {
                  view.focus()
                }
              }, 10)
            } catch (error) {
              console.error("Error restoring focus:", error)
            }
          }
        }
      }
    }
  }, [value, isAiPromptMode])

  // Add event listeners for ArrowUp and ArrowDown with improved completion detection
  useEffect(() => {
    if (
      editorViewRef.current &&
      (onArrowUp || onArrowDown || onEnter || onAiComplete)
    ) {
      const editorDOM = editorViewRef.current.dom

      const handleKeyDown = (event: KeyboardEvent) => {
        // More reliable check for active completions
        const currentCompletionActive =
          editorViewRef.current &&
          completionStatus(editorViewRef.current.state) !== null

        // Handle Shift+Enter for AI completion in AI prompt mode
        if (
          event.key === "Enter" &&
          event.shiftKey &&
          isAiPromptMode &&
          onAiComplete
        ) {
          event.preventDefault()
          event.stopPropagation()

          // Get the prompt text (remove the leading //)
          const promptText = editorViewRef.current?.state.doc.toString().trim()
          const cleanPrompt = promptText?.startsWith("//")
            ? promptText.substring(2).trim()
            : promptText

          onAiComplete(cleanPrompt || "")
          return false
        }

        // Skip custom key handling if completion is active and not in AI prompt mode
        if (currentCompletionActive && !isAiPromptMode) {
          return true
        }

        if (event.key === "ArrowUp" && onArrowUp) {
          event.preventDefault()
          event.stopPropagation()
          onArrowUp()
          return false
        }

        if (event.key === "ArrowDown" && onArrowDown) {
          event.preventDefault()
          event.stopPropagation()
          onArrowDown()
          return false
        }

        if (event.key === "Enter" && !event.shiftKey && onEnter) {
          event.preventDefault()
          event.stopPropagation()
          onEnter()
          return false
        }
      }

      editorDOM.addEventListener("keydown", handleKeyDown, { capture: true })

      return () => {
        editorDOM.removeEventListener("keydown", handleKeyDown, {
          capture: true,
        })
      }
    }
  }, [
    editorViewRef.current,
    onArrowUp,
    onArrowDown,
    onEnter,
    onAiComplete,
    isAiPromptMode,
  ])

  // Update editor theme
  useEffect(() => {
    if (
      editorViewRef.current &&
      initializedRef.current &&
      !isDestroyedRef.current
    ) {
      try {
        // Theme update logic
      } catch (error) {
        console.error("Error updating editor theme:", error)
      }
    }
  }, [theme])

  return {
    isAiPromptMode,
  }
}
