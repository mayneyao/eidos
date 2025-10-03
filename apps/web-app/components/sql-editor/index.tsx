"use client"

import { forwardRef, useMemo, type KeyboardEventHandler } from "react"
import { formatSql } from "@/packages/core/sqlite/helper"
import {
  acceptCompletion,
  completionStatus,
  startCompletion,
} from "@codemirror/autocomplete"
import { defaultKeymap, insertTab } from "@codemirror/commands"
import { sql, type SQLNamespace } from "@codemirror/lang-sql"
import { indentUnit, type LanguageSupport } from "@codemirror/language"
import { keymap } from "@codemirror/view"
import CodeMirror, {
  EditorView,
  type Extension,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror"
import { toast } from "sonner"

import sqliteFunctionList from "./function-tooltip.json"
import { functionTooltip } from "./function-tooltips"
import { KEY_BINDING } from "./key-matcher"
import createSQLTableNameHighlightPlugin from "./sql-tablename-highlight"
import { sqliteDialect } from "./sqlite-dialect"
import SqlStatementHighlightPlugin from "./statement-highlight"
import useCodeEditorTheme from "./use-editor-theme"
import { createVariableHighlightPlugin } from "./variable-highlight-plugin"

interface SqlEditorProps {
  highlightVariable?: boolean

  /**
   * Comma seprated variable name list
   */
  variableList?: string

  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
  schema?: SQLNamespace
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  fontSize?: number
  onFontSizeChanged?: (fontSize: number) => void
  onCursorChange?: (
    pos: number,
    lineNumber: number,
    columnNumber: number
  ) => void
}

const SqlEditor = forwardRef<ReactCodeMirrorRef, SqlEditorProps>(
  function SqlEditor(
    {
      value,
      onChange,
      schema,
      onKeyDown,
      onCursorChange,
      readOnly,
      fontSize,
      onFontSizeChanged,
      variableList,
      highlightVariable,
    }: SqlEditorProps,
    ref
  ) {
    const theme = useCodeEditorTheme({ fontSize })

    const tableNameHighlightPlugin = useMemo(() => {
      if (schema) {
        return createSQLTableNameHighlightPlugin(Object.keys(schema))
      }
      return createSQLTableNameHighlightPlugin([])
    }, [schema])

    const keyExtensions = useMemo(() => {
      return keymap.of([
        {
          key: KEY_BINDING.run.toCodeMirrorKey(),
          preventDefault: true,
          run: () => true,
        },
        {
          key: "Tab",
          preventDefault: true,
          run: (target) => {
            if (completionStatus(target.state) === "active") {
              acceptCompletion(target)
            } else {
              insertTab(target)
            }
            return true
          },
        },
        {
          key: "Ctrl-Space",
          mac: "Cmd-i",
          preventDefault: true,
          run: startCompletion,
        },
        {
          key: "Ctrl-=",
          mac: "Cmd-=",
          preventDefault: true,
          run: () => {
            if (onFontSizeChanged) {
              const newFontSize = Math.min(2, (fontSize ?? 1) + 0.2)
              onFontSizeChanged(newFontSize)
              toast.info(
                `Change code editor font size to ${Math.floor(newFontSize * 100)}%`,
                { duration: 1000, id: "font-size" }
              )
            }
            return true
          },
        },
        {
          key: "Ctrl--",
          mac: "Cmd--",
          preventDefault: true,
          run: () => {
            if (onFontSizeChanged) {
              const newFontSize = Math.max(0.4, (fontSize ?? 1) - 0.2)
              onFontSizeChanged(newFontSize)
              toast.info(
                `Change code editor font size to ${Math.floor(newFontSize * 100)}%`,
                { duration: 1000, id: "font-size" }
              )
            }
            return true
          },
        },
        {
          key: "Shift-Alt-f",
          run: (view) => {
            const currentValue = view.state.doc.toString()
            try {
              const formatted = formatSql(currentValue)
              view.dispatch({
                changes: {
                  from: 0,
                  to: view.state.doc.length,
                  insert: formatted,
                },
              })
              return true
            } catch (error) {
              console.error("Failed to format SQL:", error)
              return false
            }
          },
        },
        ...defaultKeymap,
      ])
    }, [fontSize, onFontSizeChanged])

    const extensions = useMemo(() => {
      let sqlDialect: LanguageSupport | undefined = undefined
      let tooltipExtension: Extension | undefined = undefined

      sqlDialect = sql({
        dialect: sqliteDialect,
        schema,
      })
      tooltipExtension = functionTooltip(sqliteFunctionList)

      return [
        EditorView.baseTheme({
          "& .cm-line": {
            borderLeft: "3px solid transparent",
            paddingLeft: "10px",
          },
          "& .cm-focused": {
            outline: "none !important",
            border: "none !important",
            borderStyle: "none !important",
          },
          "&.cm-focused": {
            outline: "none !important",
            border: "none !important",
            borderStyle: "none !important",
          },
        }),
        keyExtensions,
        indentUnit.of("  "),
        highlightVariable
          ? createVariableHighlightPlugin({
              variables: variableList ?? "",
              language: sqlDialect,
            })
          : undefined,
        sqlDialect,
        tooltipExtension,
        tableNameHighlightPlugin,
        SqlStatementHighlightPlugin,
        EditorView.updateListener.of((state) => {
          const pos = state.state.selection.main.head
          const line = state.state.doc.lineAt(pos)
          const lineNumber = line.number
          const columnNumber = pos - line.from
          if (onCursorChange) onCursorChange(pos, lineNumber, columnNumber)
        }),
      ].filter(Boolean) as Extension[]
    }, [
      onCursorChange,
      keyExtensions,
      schema,
      tableNameHighlightPlugin,
      variableList,
      highlightVariable,
    ])

    return (
      <CodeMirror
        ref={ref}
        autoFocus={!readOnly}
        readOnly={readOnly}
        onKeyDown={onKeyDown}
        basicSetup={{
          defaultKeymap: false,
          drawSelection: false,
        }}
        theme={theme}
        indentWithTab={false}
        value={value}
        height="100%"
        onChange={onChange}
        style={{
          fontSize: 20,
          height: "100%",
        }}
        extensions={extensions}
      />
    )
  }
)

export default SqlEditor
