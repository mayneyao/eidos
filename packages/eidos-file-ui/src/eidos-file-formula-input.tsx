import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { autocompletion } from "@codemirror/autocomplete"
import { sql } from "@codemirror/lang-sql"
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language"
import { Compartment, EditorSelection, EditorState } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { basicSetup } from "codemirror"

import {
  eidosFileFormulaCompletionSource,
  type EidosFileFormulaCompletion,
} from "./eidos-file-formula-completions"

const formulaHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.function(tags.variableName)],
    color: "var(--eidos-file-code-function)",
    fontWeight: "600",
  },
  {
    tag: [tags.name, tags.variableName, tags.string, tags.number],
    color: "var(--eidos-file-code-property)",
  },
  { tag: tags.operator, color: "var(--eidos-file-code-operator)" },
  { tag: tags.punctuation, color: "var(--eidos-file-code-punctuation)" },
  {
    tag: tags.comment,
    color: "var(--muted-foreground)",
    fontStyle: "italic",
  },
])

export interface EidosFileFormulaInputRef {
  focus: () => void
  insertText: (text: string, cursorOffset?: number) => void
}

export interface EidosFileFormulaInputProps {
  value: string
  completions: readonly EidosFileFormulaCompletion[]
  disabled?: boolean
  height?: string
  placeholder?: string
  onChange: (value: string) => void
  onEscape?: () => void
  onSave?: () => void
  onCurrentTokenChange?: (token: string | null) => void
}

export const EidosFileFormulaInput = forwardRef<
  EidosFileFormulaInputRef,
  EidosFileFormulaInputProps
>(
  (
    {
      value,
      completions,
      disabled = false,
      height = "100px",
      placeholder: placeholderText = "Enter a Formula expression",
      onChange,
      onEscape,
      onSave,
      onCurrentTokenChange,
    },
    forwardedRef
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const editableCompartmentRef = useRef(new Compartment())
    const completionCompartmentRef = useRef(new Compartment())
    const onChangeRef = useRef(onChange)
    const onEscapeRef = useRef(onEscape)
    const onSaveRef = useRef(onSave)
    const onCurrentTokenChangeRef = useRef(onCurrentTokenChange)

    onChangeRef.current = onChange
    onEscapeRef.current = onEscape
    onSaveRef.current = onSave
    onCurrentTokenChangeRef.current = onCurrentTokenChange

    useImperativeHandle(forwardedRef, () => ({
      focus() {
        const view = viewRef.current
        if (!view) return
        const cursor = view.state.doc.length
        view.dispatch({ selection: EditorSelection.cursor(cursor) })
        view.focus()
      },
      insertText(text: string, cursorOffset = 0) {
        const view = viewRef.current
        if (!view || view.state.readOnly) return
        const selection = view.state.selection.main
        const cursor = Math.max(
          selection.from,
          selection.from + text.length + cursorOffset
        )
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: EditorSelection.cursor(cursor),
          scrollIntoView: true,
        })
        view.focus()
      },
    }))

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const view = new EditorView({
        parent: container,
        doc: value,
        extensions: [
          basicSetup,
          sql({ upperCaseKeywords: true }),
          syntaxHighlighting(formulaHighlightStyle),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "Formula expression",
            "aria-multiline": "true",
            autocapitalize: "off",
            autocomplete: "off",
            spellcheck: "false",
          }),
          editableCompartmentRef.current.of([
            EditorState.readOnly.of(disabled),
            EditorView.editable.of(!disabled),
          ]),
          completionCompartmentRef.current.of(
            autocompletion({
              override: [eidosFileFormulaCompletionSource(completions)],
              activateOnTyping: true,
              icons: true,
            })
          ),
          placeholder(placeholderText),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                if (!view.state.readOnly) onSaveRef.current?.()
                return true
              },
            },
            {
              key: "Mod-Enter",
              run: () => {
                if (!view.state.readOnly) onSaveRef.current?.()
                return true
              },
            },
            {
              key: "Escape",
              run: () => {
                onEscapeRef.current?.()
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
            if (update.selectionSet || update.docChanged) {
              const position = update.state.selection.main.head
              const node = syntaxTree(update.state).resolveInner(position, -1)
              const token =
                node.to > node.from
                  ? update.state.doc.sliceString(node.from, node.to)
                  : null
              onCurrentTokenChangeRef.current?.(token)
            }
          }),
          EditorView.theme({
            "&": {
              height,
              border: "1px solid var(--input)",
              borderRadius: "calc(var(--radius) - 2px)",
              backgroundColor:
                "color-mix(in srgb, var(--muted) 42%, var(--background))",
              color: "var(--foreground)",
              fontSize: "12px",
            },
            "&.cm-focused": {
              outline: "1px solid var(--ring)",
              outlineOffset: "1px",
            },
            ".cm-scroller": {
              fontFamily:
                '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
              lineHeight: "1.55",
            },
            ".cm-content": {
              padding: "9px 10px",
              caretColor: "var(--foreground)",
            },
            ".cm-line": { padding: "0" },
            ".cm-gutters": { display: "none" },
            ".cm-cursor": { borderLeftColor: "var(--foreground)" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor:
                "color-mix(in srgb, var(--ring) 24%, transparent)",
            },
            ".cm-placeholder": {
              color: "var(--muted-foreground)",
              fontStyle: "normal",
            },
            ".cm-tooltip": {
              border: "1px solid var(--border)",
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              boxShadow:
                "0 8px 24px color-mix(in srgb, var(--foreground) 12%, transparent)",
            },
            ".cm-tooltip-autocomplete > ul": { maxHeight: "180px" },
            ".cm-tooltip-autocomplete > ul > li": {
              minHeight: "28px",
              padding: "5px 8px",
            },
            ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
              backgroundColor: "var(--accent)",
              color: "var(--accent-foreground)",
            },
          }),
        ],
      })
      viewRef.current = view
      return () => {
        view.destroy()
        viewRef.current = null
      }
      // The editor is intentionally created once; callback refs and
      // compartments keep its external contract current without focus churn.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      const view = viewRef.current
      if (!view || view.state.doc.toString() === value) return
      const selection = view.state.selection.main
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: EditorSelection.cursor(
          Math.min(selection.head, value.length)
        ),
      })
    }, [value])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        effects: completionCompartmentRef.current.reconfigure(
          autocompletion({
            override: [eidosFileFormulaCompletionSource(completions)],
            activateOnTyping: true,
            icons: true,
          })
        ),
      })
    }, [completions])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        effects: editableCompartmentRef.current.reconfigure([
          EditorState.readOnly.of(disabled),
          EditorView.editable.of(!disabled),
        ]),
      })
      view.dom.setAttribute("aria-disabled", String(disabled))
    }, [disabled])

    return <div ref={containerRef} className="eidos-file-formula-input" />
  }
)

EidosFileFormulaInput.displayName = "EidosFileFormulaInput"
