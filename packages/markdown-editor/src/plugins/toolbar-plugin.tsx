import { useCallback, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from "lexical"

import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import type { MarkdownEditorLabels } from "../types"

function ToolbarButton({
  active = false,
  ariaKeyShortcuts,
  label,
  shortcut,
  children,
  onClick,
}: {
  active?: boolean
  ariaKeyShortcuts?: string
  label: string
  shortcut?: string
  children: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className="eme-toolbar-button"
      aria-label={label}
      aria-keyshortcuts={ariaKeyShortcuts}
      aria-pressed={active || undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function FloatingToolbarPlugin({
  labels,
}: {
  labels: MarkdownEditorLabels
}) {
  const [editor] = useLexicalComposerContext()
  const { ariaKeys, label: shortcutLabel } = useMarkdownShortcuts()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef(0)
  const updateFrameRef = useRef(0)
  const [visible, setVisible] = useState(false)
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [strikethrough, setStrikethrough] = useState(false)
  const [highlight, setHighlight] = useState(false)
  const [inlineCode, setInlineCode] = useState(false)

  const updateToolbar = useCallback(() => {
    const selection = $getSelection()
    const root = editor.getRootElement()
    const domSelection = window.getSelection()
    const hasTextSelection =
      editor.isEditable() &&
      root !== null &&
      $isRangeSelection(selection) &&
      !selection.isCollapsed() &&
      selection.getTextContent().length > 0 &&
      domSelection !== null &&
      domSelection.rangeCount > 0 &&
      domSelection.anchorNode !== null &&
      root.contains(domSelection.anchorNode)

    if (!hasTextSelection || !$isRangeSelection(selection) || !domSelection) {
      setVisible(false)
      return
    }

    setBold(selection.hasFormat("bold"))
    setItalic(selection.hasFormat("italic"))
    setStrikethrough(selection.hasFormat("strikethrough"))
    setHighlight(selection.hasFormat("highlight"))
    setInlineCode(selection.hasFormat("code"))
    setVisible(true)

    const range = domSelection.getRangeAt(0)
    const selectionRect = range.getBoundingClientRect()
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = window.requestAnimationFrame(() => {
      const toolbar = toolbarRef.current
      if (!toolbar) return
      const toolbarRect = toolbar.getBoundingClientRect()
      const inset = 8
      let top = selectionRect.top - toolbarRect.height - inset
      if (top < inset) top = selectionRect.bottom + inset
      const centeredLeft =
        selectionRect.left + selectionRect.width / 2 - toolbarRect.width / 2
      const left = Math.min(
        Math.max(inset, centeredLeft),
        window.innerWidth - toolbarRect.width - inset
      )
      toolbar.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`
    })
  }, [editor])

  const updateFromEditorState = useCallback(() => {
    editor.getEditorState().read(updateToolbar)
  }, [editor, updateToolbar])

  const scheduleToolbarUpdate = useCallback(() => {
    window.cancelAnimationFrame(updateFrameRef.current)
    updateFrameRef.current = window.requestAnimationFrame(updateFromEditorState)
  }, [updateFromEditorState])

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) =>
      editorState.read(updateToolbar)
    )
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar()
        return false
      },
      COMMAND_PRIORITY_LOW
    )
    const unregisterEditable = editor.registerEditableListener(() =>
      updateFromEditorState()
    )

    document.addEventListener("selectionchange", scheduleToolbarUpdate)
    window.addEventListener("resize", scheduleToolbarUpdate)
    document.addEventListener("scroll", scheduleToolbarUpdate, true)
    return () => {
      unregisterUpdate()
      unregisterSelection()
      unregisterEditable()
      document.removeEventListener("selectionchange", scheduleToolbarUpdate)
      window.removeEventListener("resize", scheduleToolbarUpdate)
      document.removeEventListener("scroll", scheduleToolbarUpdate, true)
      window.cancelAnimationFrame(animationFrameRef.current)
      window.cancelAnimationFrame(updateFrameRef.current)
    }
  }, [editor, scheduleToolbarUpdate, updateToolbar])

  return (
    <div
      ref={toolbarRef}
      className="eme-floating-toolbar"
      data-visible={visible ? "true" : "false"}
      role="toolbar"
      aria-label="Text formatting"
      aria-hidden={!visible}
    >
      <ToolbarButton
        active={bold}
        ariaKeyShortcuts={ariaKeys("format.bold")}
        label={labels.bold}
        shortcut={shortcutLabel("format.bold")}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        active={italic}
        ariaKeyShortcuts={ariaKeys("format.italic")}
        label={labels.italic}
        shortcut={shortcutLabel("format.italic")}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        I
      </ToolbarButton>
      <ToolbarButton
        active={strikethrough}
        label={labels.strikethrough}
        onClick={() =>
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
        }
      >
        S
      </ToolbarButton>
      <ToolbarButton
        active={highlight}
        label={labels.highlight}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "highlight")}
      >
        ==
      </ToolbarButton>
      <ToolbarButton
        active={inlineCode}
        label={labels.inlineCode}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
      >
        &lt;/&gt;
      </ToolbarButton>
    </div>
  )
}
