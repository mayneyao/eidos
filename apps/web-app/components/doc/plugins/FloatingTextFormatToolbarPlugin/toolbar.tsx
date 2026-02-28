import { useCallback, useEffect, useRef, useState } from "react"
import { TOGGLE_LINK_COMMAND } from "@lexical/link"
import { mergeRegister } from "@lexical/utils"
import { useKeyPress } from "ahooks"
import {
  $getRoot,
  $getSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
} from "lexical"
import {
  Baseline,
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link,
  SparkleIcon,
  SparklesIcon,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"

import { getDOMRangeRect } from "../../utils/getDOMRangeRect"
import { getMarkdownFromSelection } from "../../utils/selection"
import { setFloatingElemPosition } from "../../utils/setFloatingElemPosition"
import { INSERT_AI_COMMAND } from "../AIToolsPlugin"
import { ColorPicker } from "./color-picker"

export function TextFormatFloatingToolbar({
  editor,
  anchorElem,
  isLink,
  isBold,
  isItalic,
  isUnderline,
  isCode,
  isStrikethrough,
  isSubscript,
  isSuperscript,
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  isBold: boolean
  isCode: boolean
  isItalic: boolean
  isLink: boolean
  isStrikethrough: boolean
  isSubscript: boolean
  isSuperscript: boolean
  isUnderline: boolean
}): JSX.Element {
  const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null)

  const [content, setContent] = useState("")

  const insertLink = useCallback(() => {
    if (!isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://")
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    }
  }, [editor, isLink])

  function mouseMoveListener(e: MouseEvent) {
    if (
      popupCharStylesEditorRef?.current &&
      (e.buttons === 1 || e.buttons === 3)
    ) {
      if (popupCharStylesEditorRef.current.style.pointerEvents !== "none") {
        const x = e.clientX
        const y = e.clientY
        const elementUnderMouse = document.elementFromPoint(x, y)

        if (!popupCharStylesEditorRef.current.contains(elementUnderMouse)) {
          // Mouse is not over the target element => not a normal click, but probably a drag
          popupCharStylesEditorRef.current.style.pointerEvents = "none"
        }
      }
    }
  }
  function mouseUpListener(e: MouseEvent) {
    if (popupCharStylesEditorRef?.current) {
      if (popupCharStylesEditorRef.current.style.pointerEvents !== "auto") {
        popupCharStylesEditorRef.current.style.pointerEvents = "auto"
      }
    }
  }

  useEffect(() => {
    if (popupCharStylesEditorRef?.current) {
      document.addEventListener("mousemove", mouseMoveListener)
      document.addEventListener("mouseup", mouseUpListener)

      return () => {
        document.removeEventListener("mousemove", mouseMoveListener)
        document.removeEventListener("mouseup", mouseUpListener)
      }
    }
  }, [popupCharStylesEditorRef])

  const updateTextFormatFloatingToolbar = useCallback(() => {
    const selection = $getSelection()

    const text = selection?.getTextContent()
    text && setContent(text)
    const popupCharStylesEditorElem = popupCharStylesEditorRef.current
    const nativeSelection = window.getSelection()

    if (popupCharStylesEditorElem === null) {
      return
    }

    const rootElement = editor.getRootElement()
    if (
      selection !== null &&
      nativeSelection !== null &&
      !nativeSelection.isCollapsed &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode)
    ) {
      const rangeRect = getDOMRangeRect(nativeSelection, rootElement)

      setFloatingElemPosition(
        rangeRect,
        popupCharStylesEditorElem,
        anchorElem,
        isLink
      )
    }
  }, [editor, anchorElem, isLink])

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement

    const update = () => {
      editor.getEditorState().read(() => {
        updateTextFormatFloatingToolbar()
      })
    }

    window.addEventListener("resize", update)
    if (scrollerElem) {
      scrollerElem.addEventListener("scroll", update)
    }

    return () => {
      window.removeEventListener("resize", update)
      if (scrollerElem) {
        scrollerElem.removeEventListener("scroll", update)
      }
    }
  }, [editor, updateTextFormatFloatingToolbar, anchorElem])

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateTextFormatFloatingToolbar()
    })
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateTextFormatFloatingToolbar()
        })
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateTextFormatFloatingToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, updateTextFormatFloatingToolbar])

  useKeyPress("alt.i", (e) => {
    e.preventDefault()
    e.stopPropagation()
    editor.dispatchCommand(INSERT_AI_COMMAND, content)
  })

  return (
    <div
      ref={popupCharStylesEditorRef}
      className="floating-text-format-popup bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
    >
      {editor.isEditable() && (
        <div className="flex items-center gap-0.5 p-1">
          <div
            className={cn(
              "flex cursor-pointer items-center justify-center gap-1 px-2 py-1.5 rounded-md",
              "text-primary hover:bg-primary/10 transition-colors"
            )}
            onMouseDownCapture={(e) => {
              e.preventDefault()
              e.stopPropagation()
              editor.dispatchCommand(INSERT_AI_COMMAND, content)
            }}
            title="AI Tools (Alt+I)"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">AI</span>
          </div>

          <div className="w-px h-4 bg-border mx-1" />

          <div className="flex items-center gap-0.5">
            <Toggle
              size="sm"
              type="button"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
              }}
              pressed={isBold}
              aria-label="Bold"
              className="h-7 w-7 p-0"
            >
              <Bold className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              size="sm"
              type="button"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
              }}
              pressed={isItalic}
              aria-label="Italic"
              className="h-7 w-7 p-0"
            >
              <Italic className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              size="sm"
              type="button"
              onClick={(e) => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
              }}
              pressed={isUnderline}
              aria-label="Underline"
              className="h-7 w-7 p-0"
            >
              <Underline className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              size="sm"
              type="button"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
              }}
              pressed={isStrikethrough}
              aria-label="Strikethrough"
              className="h-7 w-7 p-0"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              size="sm"
              type="button"
              onClick={() => {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")
              }}
              pressed={isCode}
              aria-label="Code"
              className="h-7 w-7 p-0"
            >
              <Code className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              size="sm"
              type="button"
              onClick={insertLink}
              pressed={isLink}
              aria-label="Link"
              className="h-7 w-7 p-0"
            >
              <Link className="h-3.5 w-3.5" />
            </Toggle>
          </div>

          <div className="w-px h-4 bg-border mx-1" />

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
                <Baseline className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <ColorPicker activeEditor={editor} />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}
