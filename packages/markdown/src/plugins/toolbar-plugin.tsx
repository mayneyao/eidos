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
import type { CompiledMarkdownPluginToolbarItem } from "../plugin-system/plugin-api"
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
  items,
  labels,
}: {
  items: readonly CompiledMarkdownPluginToolbarItem[]
  labels: MarkdownEditorLabels
}) {
  const [editor] = useLexicalComposerContext()
  const { ariaKeys, label: shortcutLabel } = useMarkdownShortcuts()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef(0)
  const updateFrameRef = useRef(0)
  const [visible, setVisible] = useState(false)
  const [activeItems, setActiveItems] = useState<ReadonlySet<string>>(
    () => new Set()
  )

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

    setActiveItems(
      new Set(
        items
          .filter((item) =>
            item.isActive
              ? item.isActive(selection)
              : item.format
                ? selection.hasFormat(item.format)
                : false
          )
          .map((item) => item.id)
      )
    )
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
  }, [editor, items])

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
      {items.map((item) => {
        const label = item.labelKey ? labels[item.labelKey] : item.label
        if (!label) return null
        return (
          <ToolbarButton
            key={`${item.pluginId}:${item.id}`}
            active={activeItems.has(item.id)}
            ariaKeyShortcuts={
              item.shortcutId ? ariaKeys(item.shortcutId) : undefined
            }
            label={label}
            shortcut={
              item.shortcutId ? shortcutLabel(item.shortcutId) : undefined
            }
            onClick={() => {
              if (item.execute) item.execute(editor)
              else if (item.format) {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)
              }
            }}
          >
            {item.glyph}
          </ToolbarButton>
        )
      })}
    </div>
  )
}
