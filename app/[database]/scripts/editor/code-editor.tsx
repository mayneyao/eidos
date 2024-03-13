import { useEffect } from "react"
import eidosTypes from "@eidos.space/types/index.d.ts?raw"
import Editor, { loader, useMonaco } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

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

export const CodeEditor = ({
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
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        `${eidosTypes}\ndeclare const eidos: import("@eidos.space/types").Eidos;`,
        "ts:filename/eidos.d.ts"
      )
    }
  }, [language, monaco])
  return (
    <Editor
      height="60vh"
      value={value}
      options={{
        minimap: { enabled: false },
        wordWrap: "on",
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

export default CodeEditor
