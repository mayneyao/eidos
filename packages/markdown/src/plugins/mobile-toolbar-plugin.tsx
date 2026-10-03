import { useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type RangeSelection,
} from "lexical"
import { $setBlocksType } from "@lexical/selection"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list"
import type {
  CompiledMarkdownPluginToolbarItem,
  CompiledMarkdownPluginInsertion,
} from "../plugin-system/plugin-api"
import type { MarkdownEditorLabels } from "../types"

/** Uses the same Lexical commands as the desktop editor, with persistent touch targets. */
export function MobileToolbarPlugin({
  items,
  labels,
  insertions,
}: {
  items: readonly CompiledMarkdownPluginToolbarItem[]
  labels: MarkdownEditorLabels
  insertions: readonly CompiledMarkdownPluginInsertion[]
}) {
  const [editor] = useLexicalComposerContext()
  const supports = (key: keyof MarkdownEditorLabels) =>
    insertions.some((item) => item.labelKey === key)
  const selection = useRef<RangeSelection | null>(null)
  const [active, setActive] = useState<ReadonlySet<string>>(new Set())
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) =>
        editorState.read(() => {
          const current = $getSelection()
          if (!$isRangeSelection(current)) return
          selection.current = current.clone()
          setActive(
            new Set(
              items
                .filter((item) =>
                  item.isActive
                    ? item.isActive(current)
                    : item.format
                      ? current.hasFormat(item.format)
                      : false
                )
                .map((item) => item.id)
            )
          )
        })
      ),
    [editor, items]
  )
  const run = (action: () => void) => {
    editor.focus(() =>
      editor.update(() => {
        if (selection.current) $setSelection(selection.current.clone())
        action()
      })
    )
  }
  const button = (
    label: string,
    glyph: string,
    action: () => void,
    pressed?: boolean
  ) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => run(action)}
    >
      {glyph}
    </button>
  )
  return (
    <div className="eme-mobile-toolbar" role="toolbar" aria-label="Markdown">
      {button(labels.undo, "↶", () =>
        editor.dispatchCommand(UNDO_COMMAND, undefined)
      )}
      {button(labels.redo, "↷", () =>
        editor.dispatchCommand(REDO_COMMAND, undefined)
      )}
      {items.map((item) =>
        button(
          item.labelKey ? labels[item.labelKey] : (item.label ?? item.id),
          item.glyph,
          () => {
            if (item.execute) item.execute(editor)
            else if (item.format)
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)
          },
          active.has(item.id)
        )
      )}
      {supports("heading2") &&
        button(labels.heading2, "H2", () =>
          $setBlocksType($getSelection(), () => $createHeadingNode("h2"))
        )}
      {supports("quote") &&
        button(labels.quote, "❯", () =>
          $setBlocksType($getSelection(), $createQuoteNode)
        )}
      {supports("bulletList") &&
        button(labels.bulletList, "• ≡", () =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        )}
      {supports("checkList") &&
        button(labels.checkList, "☑", () =>
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
        )}
    </div>
  )
}
