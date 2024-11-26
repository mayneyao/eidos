import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import Editor, { DiffEditor, loader, useMonaco } from "@monaco-editor/react"
import { useSize } from "ahooks"
import { debounce } from "lodash"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import ts from "typescript/lib/typescript"

import { useSpaceAppStore } from "../../store"
import { getDynamicPrompt } from "../helper"
import { useEditorStore } from "../stores/editor-store"
import scriptTypes from "./script-global-types?raw"
import reactTypes from "/node_modules/@types/react/index.d.ts?raw"

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
  customCompile?: (code: string) => Promise<string>
  theme?: "vs-dark" | "light"
  scriptId?: string
  bindings?: IScript["bindings"]
}

export const CodeEditor = forwardRef(
  (
    {
      value,
      onSave,
      language = "javascript",
      customCompile,
      theme = "light",
      scriptId,
      bindings,
    }: CodeEditorProps,
    ref
  ) => {
    const monaco = useMonaco()
    const [code, setCode] = useState<string | undefined>(value)
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>()
    const { scriptCodeMap, setScriptCodeMap, setActiveTab } = useEditorStore()

    const toApplyCode = scriptId ? scriptCodeMap[scriptId] : undefined

    useEffect(() => {
      setCode(value)
    }, [value])

    const dynamicPrompt = useMemo(() => getDynamicPrompt(bindings), [bindings])
    const handleSave = useCallback(
      async (code: string) => {
        setCode(code)
        if (language === "typescript" || language === "typescriptreact") {
          if (customCompile) {
            customCompile(code).then((jsCode) => {
              onSave?.(jsCode, code)
            })
          } else {
            const jsCode = compile(code)
            onSave?.(jsCode, code)
          }
        } else {
          onSave?.(code)
        }
      },
      [language, onSave, customCompile]
    )

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

    // parent component can call handleSave directly
    useImperativeHandle(
      ref,
      () => ({
        save: () => {
          if (code) {
            handleSave?.(code)
          }
        },
        layout: () => {
          resetEditorLayout()
        },
      }),
      [code, handleSave, resetEditorLayout]
    )

    useEffect(() => {
      if (monaco && language !== "markdown") {
        if (language === "javascript") {
          // 修改 JavaScript 的诊断选项
          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false, // 改为 false 以启用语义验证
            noSyntaxValidation: false,
          })

          monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
            moduleResolution:
              monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            allowJs: true,
            checkJs: true,
          })

          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            `${dynamicPrompt}\ndeclare const eidos: import("@eidos.space/types").Eidos;`,
            "ts:filename/eidos.d.ts"
          )
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            scriptTypes,
            "ts:filename/types.d.ts"
          )
        }
        if (language === "typescript" || language === "typescriptreact") {
          // 修改 TypeScript 的诊断选项
          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false, // 改为 false 以启用语义验证
            noSyntaxValidation: false,
          })

          const tsxConfig =
            language === "typescriptreact"
              ? {
                  jsx: monaco.languages.typescript.JsxEmit.React,
                  jsxFactory: "React.createElement",
                  jsxFragmentFactory: "React.Fragment",
                  moduleResolution:
                    monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                  module: monaco.languages.typescript.ModuleKind.ESNext,
                  reactNamespace: "React",
                  allowJs: true,
                  typeRoots: ["node_modules/@types"],
                }
              : {}

          // 添加更多编译器选项
          monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
            strict: true, // 启用严格模式
            noImplicitAny: false, // 允许隐式的 any 类型
            ...tsxConfig,
          })

          if (language === "typescriptreact") {
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
              reactTypes,
              `file:///node_modules/@react/types/index.d.ts`
            )
          }
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            `${dynamicPrompt}\ndeclare const eidos: import("@eidos.space/types").Eidos;`,
            "ts:filename/eidos.d.ts"
          )
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            scriptTypes,
            "ts:filename/types.d.ts"
          )
        }
      }
    }, [language, monaco, dynamicPrompt])

    const monacoEl = useRef<HTMLDivElement>(null)

    const size = useSize(monacoEl)

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

    const handleAcceptChanges = useCallback(() => {
      if (toApplyCode) {
        handleSave(toApplyCode)
        if (scriptId) {
          setScriptCodeMap(scriptId, "")
          setActiveTab("preview")
        }
      }
    }, [toApplyCode, handleSave, scriptId, setScriptCodeMap])

    const handleRejectChanges = useCallback(() => {
      if (scriptId) {
        setScriptCodeMap(scriptId, "")
      }
    }, [scriptId, setScriptCodeMap])

    return (
      <div className="h-full w-full relative" ref={monacoEl}>
        {toApplyCode && (
          <div className="absolute top-2 right-2 z-10 flex flex-row gap-2">
            <button
              onClick={handleAcceptChanges}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              Accept Changes
            </button>
            <button
              onClick={handleRejectChanges}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
            >
              Reject Changes
            </button>
          </div>
        )}
        {toApplyCode ? (
          <DiffEditor
            height="100%"
            width="100%"
            original={code || ""}
            modified={toApplyCode}
            theme={theme}
            options={{
              minimap: { enabled: false },
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              readOnly: false,
            }}
            language={language === "typescriptreact" ? "typescript" : language}
            onMount={(editor, monaco) => {
              const modifiedEditor = editor.getModifiedEditor()
              editorRef.current = modifiedEditor
              modifiedEditor.onKeyDown((e) => {
                if (
                  e.keyCode === monaco.KeyCode.KeyS &&
                  (e.ctrlKey || e.metaKey)
                ) {
                  e.preventDefault()
                  const code = modifiedEditor.getValue()
                  handleSave(code)
                }
              })
            }}
          />
        ) : (
          <Editor
            height="100%"
            width="100%"
            value={value}
            theme={theme}
            options={{
              minimap: { enabled: false },
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
            language={language === "typescriptreact" ? "typescript" : language}
            onChange={(value) => {
              setCode(value)
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor
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
        )}
      </div>
    )
  }
)

export default CodeEditor
