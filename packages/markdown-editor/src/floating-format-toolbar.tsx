import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type BaseSelection,
  type TextFormatType,
} from "lexical"

import { sanitizeMarkdownHref } from "./url"

interface ToolbarState {
  bold: boolean
  code: boolean
  italic: boolean
  link: boolean
  strikethrough: boolean
  left: number
  top: number
  visible: boolean
}

const HIDDEN_TOOLBAR: ToolbarState = {
  bold: false,
  code: false,
  italic: false,
  link: false,
  strikethrough: false,
  left: 0,
  top: 0,
  visible: false,
}

function selectionLink() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const anchor = selection.anchor.getNode()
  const focus = selection.focus.getNode()
  const candidates = [anchor, anchor.getParent(), focus, focus.getParent()]
  return candidates.find($isLinkNode) ?? null
}

export function FloatingFormatToolbarPlugin({
  surfaceRef,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>
}) {
  const [editor] = useLexicalComposerContext()
  const [state, setState] = useState<ToolbarState>(HIDDEN_TOOLBAR)
  const [editingLink, setEditingLink] = useState(false)
  const [linkValue, setLinkValue] = useState("")
  const [linkError, setLinkError] = useState(false)
  const savedSelectionRef = useRef<BaseSelection | null>(null)

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      if (editor.isComposing()) return
      const selection = $getSelection()
      const root = editor.getRootElement()
      const surface = surfaceRef.current
      const nativeSelection = window.getSelection()
      if (
        !$isRangeSelection(selection) ||
        selection.isCollapsed() ||
        !selection.getTextContent() ||
        !root ||
        !surface ||
        !nativeSelection ||
        nativeSelection.isCollapsed ||
        !root.contains(nativeSelection.anchorNode) ||
        nativeSelection.rangeCount === 0
      ) {
        if (!editingLink) setState(HIDDEN_TOOLBAR)
        return
      }

      savedSelectionRef.current = selection.clone()
      const range = nativeSelection.getRangeAt(0)
      const rangeRect = range.getBoundingClientRect?.()
      const surfaceRect = surface.getBoundingClientRect()
      const center = rangeRect
        ? rangeRect.left - surfaceRect.left + rangeRect.width / 2
        : surface.clientWidth / 2
      const top = rangeRect
        ? rangeRect.top - surfaceRect.top - 44
        : Math.max(0, surface.scrollTop)
      setState({
        bold: selection.hasFormat("bold"),
        code: selection.hasFormat("code"),
        italic: selection.hasFormat("italic"),
        link: selectionLink() !== null,
        strikethrough: selection.hasFormat("strikethrough"),
        left: Math.max(86, Math.min(surface.clientWidth - 86, center)),
        top: Math.max(0, top),
        visible: true,
      })
    })
  }, [editingLink, editor, surfaceRef])

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(updateToolbar),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            updateToolbar()
            return false
          },
          COMMAND_PRIORITY_LOW
        ),
        editor.registerRootListener((root, previousRoot) => {
          previousRoot?.removeEventListener("mouseup", updateToolbar)
          previousRoot?.removeEventListener("keyup", updateToolbar)
          root?.addEventListener("mouseup", updateToolbar)
          root?.addEventListener("keyup", updateToolbar)
        })
      ),
    [editor, updateToolbar]
  )

  const restoreSelection = useCallback(() => {
    const savedSelection = savedSelectionRef.current
    if (savedSelection) $setSelection(savedSelection.clone())
  }, [])

  const format = (formatType: TextFormatType) => {
    editor.update(restoreSelection)
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, formatType)
    editor.focus()
  }

  const editLink = () => {
    if (state.link) {
      editor.update(restoreSelection)
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
      editor.focus()
      return
    }
    setLinkError(false)
    setLinkValue("")
    setEditingLink(true)
  }

  const submitLink = () => {
    const href = sanitizeMarkdownHref(linkValue)
    if (href === "about:blank") {
      setLinkError(true)
      return
    }
    editor.update(restoreSelection)
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, href)
    setEditingLink(false)
    editor.focus()
  }

  if (!state.visible) return null

  return (
    <div
      aria-label="Text formatting"
      className="eidos-md-format-toolbar"
      role="toolbar"
      style={{ left: state.left, top: state.top }}
    >
      {editingLink ? (
        <form
          className="eidos-md-link-form"
          onSubmit={(event) => {
            event.preventDefault()
            submitLink()
          }}
        >
          <input
            aria-invalid={linkError || undefined}
            aria-label="Link URL"
            autoFocus
            onChange={(event) => {
              setLinkError(false)
              setLinkValue(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                setEditingLink(false)
                editor.focus()
              }
            }}
            placeholder="Paste link…"
            value={linkValue}
          />
          <button type="submit">Apply</button>
        </form>
      ) : (
        <>
          <FormatButton
            active={state.bold}
            label="Bold"
            onClick={() => format("bold")}
          >
            <strong>B</strong>
          </FormatButton>
          <FormatButton
            active={state.italic}
            label="Italic"
            onClick={() => format("italic")}
          >
            <em>I</em>
          </FormatButton>
          <FormatButton
            active={state.strikethrough}
            label="Strikethrough"
            onClick={() => format("strikethrough")}
          >
            <span className="eidos-md-format-strike">S</span>
          </FormatButton>
          <FormatButton
            active={state.code}
            label="Inline code"
            onClick={() => format("code")}
          >
            &lt;/&gt;
          </FormatButton>
          <FormatButton active={state.link} label="Link" onClick={editLink}>
            ↗
          </FormatButton>
        </>
      )}
    </div>
  )
}

function FormatButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="eidos-md-format-button"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      {children}
    </button>
  )
}
