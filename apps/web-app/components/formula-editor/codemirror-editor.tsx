import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { autocompletion } from "@codemirror/autocomplete"
import { javascript } from "@codemirror/lang-javascript"
import { sql } from "@codemirror/lang-sql"
import type { LanguageSupport } from "@codemirror/language"
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language"
import { Compartment, EditorSelection, EditorState } from "@codemirror/state"
import { keymap, placeholder } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { EditorView, basicSetup } from "codemirror"

import type { Udf, UiColumn } from "./completions"
import { sqlCompletions } from "./completions"
import { useEditor } from "./hooks"

const syntaxHighlightingTheme = HighlightStyle.define([
  {
    tag: tags.keyword,
    color: "var(--token-function-color)",
    fontWeight: "bold",
  },
  {
    tag: tags.function(tags.variableName),
    color: "var(--token-function-color)",
    fontWeight: "bold",
  },
  {
    tag: tags.name,
    color: "var(--token-property-color)",
  },
  {
    tag: tags.string,
    color: "var(--token-property-color)",
  },
  {
    tag: tags.number,
    color: "var(--token-property-color)",
  },
  {
    tag: tags.comment,
    color: "var(--token-comment-color)",
    fontStyle: "italic",
  },
  {
    tag: tags.operator,
    color: "var(--token-operator-color)",
  },
  {
    tag: tags.variableName,
    color: "var(--token-variable-color)",
  },
  {
    tag: tags.punctuation,
    color: "var(--token-punctuation-color)",
  },
])

const editableCompartments = new WeakMap<EditorView, Compartment>()

function getLanguageSupport(language: string): LanguageSupport {
  switch (language.toLowerCase()) {
    case "sql":
      return sql({
        upperCaseKeywords: true,
      })
    case "javascript":
    case "js":
      return javascript()
    default:
      return sql()
  }
}

/**
 * Creates a CodeMirror editor view with the specified configuration
 */
function createEditorView(
  element: HTMLElement,
  value: string,
  onChange: (value: string) => void,
  onSave?: (value: string) => void,
  uiColumns?: UiColumn[],
  udfs?: Udf[],
  language: string = "sql",
  onEsc?: () => void,
  height?: string,
  onCurrentTokenChange?: (token: { text: string; type: string } | null) => void,
  onArrowUp?: () => void,
  onArrowDown?: () => void,
  onEnter?: () => void,
  placeholderText?: string,
  disableAutocompletion?: boolean,
  disabled: boolean = false
): EditorView {
  const editableCompartment = new Compartment()
  const conditionExtensions = !disableAutocompletion
    ? [
        getLanguageSupport(language),
        autocompletion({
          override: [
            (context) => sqlCompletions(context, uiColumns || [], udfs || []),
          ],
        }),
      ]
    : []

  const view = new EditorView({
    doc: value,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      syntaxHighlighting(syntaxHighlightingTheme),
      editableCompartment.of([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
      placeholderText ? placeholder(placeholderText) : [],
      ...conditionExtensions,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString())
        }

        if (update.selectionSet && onCurrentTokenChange) {
          const pos = update.state.selection.main.head
          const tree = syntaxTree(update.state)
          const node = tree.resolveInner(pos, -1)

          if (node) {
            const from = node.from
            const to = node.to
            const text = update.state.doc.sliceString(from, to)
            onCurrentTokenChange({
              text,
              type: node.name,
            })
          } else {
            onCurrentTokenChange(null)
          }
        }
      }),
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            if (onSave) {
              onSave(view.state.doc.toString())
            }
            return true
          },
        },
      ]),
      keymap.of([
        {
          key: "Escape",
          run: () => {
            if (onEsc) {
              onEsc()
            }
            return true
          },
        },
      ]),
      EditorView.theme({
        "&": {
          height: height || "100px",
          border: "1px solid var(--border)",
          borderRadius: "0.375rem 0.375rem 0 0",
          backgroundColor: "var(--secondary)",
        },
        "&.cm-focused": {
          outline: "none",
          boxShadow: "none",
        },
        ".cm-scroller": {
          fontFamily: "monospace",
        },
        ".cm-gutters": {
          display: "none",
        },
        ".cm-content": {
          color: "var(--foreground)",
        },
        "&.cm-focused .cm-cursor": {
          borderLeftColor: "var(--foreground)",
        },
        ".cm-selectionBackground": {
          backgroundColor: "color-mix(in hsl, var(--accent) 20%, transparent)",
        },
        "&.cm-focused .cm-selectionBackground": {
          backgroundColor: "color-mix(in hsl, var(--accent) 30%, transparent)",
        },
        ".cm-placeholder": {
          color: "var(--muted-foreground)",
          fontStyle: "italic",
        },
      }),
    ],
    parent: element,
  })

  editableCompartments.set(view, editableCompartment)

  return view
}

export interface CodeMirrorFormulaEditorProps {
  value: string
  language?: string
  onChange: (value: string) => void
  onSave?: (value: string) => void
  udfs?: Udf[]
  columns?: UiColumn[]
  onEsc?: () => void
  height?: string
  onCurrentTokenChange?: (token: { text: string; type: string } | null) => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onEnter?: () => void
  onAiComplete?: (prompt: string) => void
  placeholder?: string
  disableAutocompletion?: boolean
  onAiPromptModeChange?: (isAiPromptMode: boolean) => void
  isGeneratingFormula?: boolean
  disabled?: boolean
}

/**
 * Expose a focus method to the parent component using forwardRef.
 */
export interface CodeMirrorFormulaEditorRef {
  focus: () => void
  insertText: (text: string) => void
  getCurrentToken: () => { text: string; type: string } | null
}

export const CodeMirrorFormulaEditor = forwardRef<
  CodeMirrorFormulaEditorRef,
  CodeMirrorFormulaEditorProps
>(
  (
    {
      value,
      onChange,
      onSave,
      language = "sql",
      udfs = [],
      columns = [],
      onEsc,
      height,
      onCurrentTokenChange,
      onArrowUp,
      onArrowDown,
      onEnter,
      onAiComplete,
      placeholder,
      disableAutocompletion,
      onAiPromptModeChange,
      isGeneratingFormula = false,
      disabled = false,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null)
    const editorViewRef = useRef<EditorView | null>(null)
    const initializedRef = useRef<boolean>(false)

    // Expose a focus method via ref which sets the cursor to the end of the editor
    useImperativeHandle(ref, () => ({
      focus() {
        if (editorViewRef.current) {
          const view = editorViewRef.current
          const endPos = view.state.doc.length
          try {
            const docLength = view.state.doc.length
            if (endPos < 0 || endPos > docLength) {
              console.warn("Attempted to set cursor outside document bounds", {
                endPos,
                docLength,
              })
              return
            }
            view.dispatch({
              selection: EditorSelection.cursor(endPos),
            })
            view.focus()
          } catch (error) {
            console.error("Error setting cursor position:", error)
          }
        }
      },
      insertText(text: string) {
        if (editorViewRef.current) {
          const view = editorViewRef.current
          const cursor = view.state.selection.main.head
          try {
            const docLength = view.state.doc.length
            if (cursor < 0 || cursor > docLength) {
              console.warn("Attempted to set cursor outside document bounds", {
                cursor,
                docLength,
              })
              return
            }
            view.dispatch({
              changes: { from: cursor, insert: text },
              selection: EditorSelection.cursor(cursor + text.length),
            })
            view.focus()
          } catch (error) {
            console.error("Error setting cursor position:", error)
          }
        }
      },
      getCurrentToken() {
        try {
          if (editorViewRef.current) {
            const view = editorViewRef.current
            const pos = view.state.selection.main.head

            if (pos < 0 || pos > view.state.doc.length) {
              console.warn("Invalid cursor position in getCurrentToken", {
                pos,
                docLength: view.state.doc.length,
              })
              return null
            }

            const tree = syntaxTree(view.state)
            const node = tree.resolveInner(pos, -1)

            if (node) {
              const from = node.from
              const to = node.to
              const text = view.state.doc.sliceString(from, to)
              return {
                text,
                type: node.name,
              }
            }
          }
          return null
        } catch (error) {
          console.error("Error in getCurrentToken:", error)
          return null
        }
      },
    }))

    const { isAiPromptMode } = useEditor({
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
      language,
      height,
      onCurrentTokenChange,
      onArrowUp,
      onArrowDown,
      onEnter,
      onAiComplete,
      placeholder,
      disableAutocompletion,
      disabled,
    })

    useEffect(() => {
      const view = editorViewRef.current
      const editableCompartment = view
        ? editableCompartments.get(view)
        : undefined
      if (!view || !editableCompartment) return
      view.dispatch({
        effects: editableCompartment.reconfigure([
          EditorState.readOnly.of(disabled),
          EditorView.editable.of(!disabled),
        ]),
      })
      view.dom.setAttribute("aria-disabled", String(disabled))
    }, [disabled])

    useEffect(() => {
      if (onAiPromptModeChange) {
        onAiPromptModeChange(isAiPromptMode)
      }
    }, [isAiPromptMode])

    return (
      <div className="w-full relative">
        <div ref={editorRef} className="w-full" />
        {isAiPromptMode && !isGeneratingFormula && (
          <div className="absolute bottom-0 left-2 text-xs text-muted-foreground p-1 bg-secondary rounded">
            AI Mode (Shift+Enter to complete)
          </div>
        )}
        {isGeneratingFormula && (
          <div className="absolute bottom-0 left-2 text-xs text-muted-foreground p-1 bg-secondary rounded flex items-center gap-1">
            <span className="animate-spin h-3 w-3 border-2 border-muted-foreground border-t-transparent rounded-full"></span>
            <span>Generating formula...</span>
          </div>
        )}
      </div>
    )
  }
)
