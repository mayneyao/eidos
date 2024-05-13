import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import eidosTypes from "@eidos.space/types/index.d.ts?raw"
import Editor, { loader, useMonaco } from "@monaco-editor/react"
import { useSize } from "ahooks"
import { debounce } from "lodash"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"

import { useSpaceAppStore } from "../../store"

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
  const monacoEl = useRef<HTMLDivElement>(null)
  const size = useSize(monacoEl)

  const resetEditorLayout = useCallback(() => {
    monaco?.editor.getEditors().forEach((editor) => {
      editor.layout({ width: 0, height: 0 })
      if (!editor || !monacoEl?.current) {
        return
      }
      const rect = monacoEl.current?.getBoundingClientRect()
      if (rect) {
        editor.layout({ width: rect.width, height: rect.height })
      }
    })
  }, [monaco?.editor])

  useLayoutEffect(() => {
    const debounced = debounce(resetEditorLayout, 100)
    debounced()
    window.addEventListener("resize", debounced)
    return () => window.removeEventListener("resize", debounced)
  }, [resetEditorLayout])

  useEffect(() => {
    resetEditorLayout()
  }, [size, resetEditorLayout])

  return (
    <div className="h-full w-full" ref={monacoEl}>
      <Editor
        height="100%"
        width="100%"
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
    </div>
  )
}

export default CodeEditor
