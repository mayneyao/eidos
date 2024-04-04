import { useEffect } from "react"
import Editor, { loader, useMonaco } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

import { useCurrentUiColumns, useUiColumns } from "@/hooks/use-ui-columns"

import formulaTypes from "./formula.d.ts?raw"
import { getDynamicallyTypes } from "./helper"

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker()
    }
    return new editorWorker()
  },
}

loader.config({ monaco })

loader.init().then(/* ... */)

export const FormulaEditor = ({
  value,
  onChange,
  onSave,
  language = "javascript",
}: {
  value: string
  language: string
  onChange: (value: string) => void
  onSave?: (value: string) => void
}) => {
  const monaco = useMonaco()

  const { uiColumns } = useCurrentUiColumns()
  const handleSave = (code: string) => {
    onSave?.(code)
  }

  useEffect(() => {
    if (monaco && language !== "markdown") {
      // validation settings
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      })
      // compiler options
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2015,
        allowNonTsExtensions: true,
      })
      const dType = `${formulaTypes}\ndeclare function typeof(x: any): string;\n${getDynamicallyTypes(uiColumns)}`
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        dType,
        "ts:filename/formula.d.ts"
      )
    }
  }, [language, monaco, uiColumns])
  return (
    <Editor
      className="rounded-md border border-gray-200"
      height="100px"
      value={value}
      options={{
        minimap: { enabled: false },
        wordWrap: "on",
        lineNumbers: "off",
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
      language={language}
      onChange={(value, e) => onChange(value || "")}
      onMount={(editor, monaco) => {
        editor.onKeyDown((e) => {
          if (e.keyCode === monaco.KeyCode.KeyS && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            const code = editor.getValue()
            handleSave(code)
          }
        })
      }}
    />
  )
}

export default FormulaEditor
