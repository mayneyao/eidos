import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
import ts from "typescript/lib/typescript"

import { useSpaceAppStore } from "../../store"
import scriptTypes from "./script-global-types?raw"

function compile(source: string) {
  const result = ts.transpileModule(source, {
    // set compiler options as es6
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  })
  return result.outputText
}

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

export interface CodeEditorProps {
  value: string
  onSave?: (code: string, ts_code?: string) => void
  language?: string
}

export const CodeEditor = forwardRef(
  ({ value, onSave, language = "javascript" }: CodeEditorProps, ref) => {
    const monaco = useMonaco()
    const [code, setCode] = useState<string | undefined>(value)

    useEffect(() => {
      setCode(value)
    }, [value])

    const handleSave = useCallback(
      (code: string) => {
        setCode(code)
        if (language === "typescript") {
          const jsCode = compile(code)
          onSave?.(jsCode, code)
        } else {
          onSave?.(code)
        }
      },
      [language, onSave]
    )

    // parent component can call handleSave directly
    useImperativeHandle(
      ref,
      () => ({
        save: () => {
          if (code) {
            handleSave?.(code)
          }
        },
      }),
      [code, handleSave]
    )

    useEffect(() => {
      if (monaco && language !== "markdown") {
        if (language === "javascript") {
          // validation settings
          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: false,
          })

          // compiler options
          monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
          })

          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            `${eidosTypes}\ndeclare const eidos: import("@eidos.space/types").Eidos;`,
            "ts:filename/eidos.d.ts"
          )
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            scriptTypes,
            "ts:filename/types.d.ts"
          )
        }
        if (language === "typescript") {
          // validation settings
          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: false,
          })
          // compiler options
          monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
          })
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            `${eidosTypes}\ndeclare const eidos: import("@eidos.space/types").Eidos;`,
            "ts:filename/eidos.d.ts"
          )
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            scriptTypes,
            "ts:filename/types.d.ts"
          )
        }
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

    const { isRightPanelOpen: isAiOpen, isExtAppOpen } = useSpaceAppStore()
    useEffect(() => {
      resetEditorLayout()
    }, [size, resetEditorLayout, isAiOpen, isExtAppOpen])

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
          onChange={(value) => {
            setCode(value)
          }}
          onMount={(editor, monaco) => {
            editor.onKeyDown((e) => {
              if (
                e.keyCode === monaco.KeyCode.KeyS &&
                (e.ctrlKey || e.metaKey)
              ) {
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
)

export default CodeEditor
