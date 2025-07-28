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
import type { IExtension } from "@/packages/core/meta-table/extension"
import Editor, { DiffEditor, loader, useMonaco } from "@monaco-editor/react"
import { useSize } from "ahooks"
import debounce from "lodash/debounce"
import * as monaco from "monaco-editor"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import ts from "typescript/lib/typescript"

import { useSpaceAppStore } from "../../store"
import { getDynamicPrompt } from "../helper"
import { useEditorStore } from "../stores/editor-store"
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
  onSave?: (code: string, ts_code?: string, version?: string) => void
  language?: string
  customCompile?: (code: string) => Promise<string>
  theme?: "vs-dark" | "light"
  scriptId?: string
  bindings?: IExtension["bindings"]
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
    const {
      scriptCodeMap,
      setScriptCodeMap,
      setActiveTab,
      pendingVersionUpdateMap,
      setPendingVersionUpdate,
    } = useEditorStore()

    const toApplyCode = scriptId ? scriptCodeMap[scriptId] : undefined

    useEffect(() => {
      setCode(value)
    }, [value])

    const dynamicPrompt = useMemo(() => getDynamicPrompt(bindings), [bindings])
    const handleSave = useCallback(
      async (codeToSave: string, versionToSave?: string) => {
        setCode(codeToSave)
        if (language === "typescript") {
          if (customCompile) {
            customCompile(codeToSave).then((jsCode) => {
              onSave?.(jsCode, codeToSave, versionToSave)
            })
          } else {
            const jsCode = compile(codeToSave)
            onSave?.(jsCode, codeToSave, versionToSave)
          }
        } else {
          onSave?.(codeToSave, undefined, versionToSave)
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
        if (language === "python") {
          monaco.languages.register({ id: "python" })
          monaco.languages.setMonarchTokensProvider("python", {
            keywords: [
              "False",
              "None",
              "True",
              "and",
              "as",
              "assert",
              "async",
              "await",
              "break",
              "class",
              "continue",
              "def",
              "del",
              "elif",
              "else",
              "except",
              "finally",
              "for",
              "from",
              "global",
              "if",
              "import",
              "in",
              "is",
              "lambda",
              "nonlocal",
              "not",
              "or",
              "pass",
              "raise",
              "return",
              "try",
              "while",
              "with",
              "yield",
            ],
            tokenizer: {
              root: [
                [
                  /[a-zA-Z_]\w*/,
                  {
                    cases: {
                      "@keywords": "keyword",
                      "@default": "identifier",
                    },
                  },
                ],
                [/#.*$/, "comment"],
                [/".*?"/, "string"],
                [/'.*?'/, "string"],
                [/\d+/, "number"],
              ],
            },
          })
        }

        if (language === "javascript") {
          monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
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
            dynamicPrompt,
            "ts:filename/eidos.d.ts"
          )
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            scriptTypes,
            "ts:filename/types.d.ts"
          )
        }
        if (language === "typescript") {
          monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
          })

          // Always enable JSX support
          const jsxConfig = {
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

          monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ESNext,
            allowNonTsExtensions: true,
            strict: true,
            noImplicitAny: false,
            ...jsxConfig,
          })

          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            dynamicPrompt,
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
      if (toApplyCode && scriptId) {
        const newVersion = pendingVersionUpdateMap[scriptId]
        handleSave(toApplyCode, newVersion || undefined)
        setScriptCodeMap(scriptId, "")
        setPendingVersionUpdate(scriptId, null)
        setActiveTab("preview")
      }
    }, [
      toApplyCode,
      handleSave,
      scriptId,
      setScriptCodeMap,
      setActiveTab,
      pendingVersionUpdateMap,
      setPendingVersionUpdate,
    ])

    const handleRejectChanges = useCallback(() => {
      if (scriptId) {
        setScriptCodeMap(scriptId, "")
        setPendingVersionUpdate(scriptId, null)
      }
    }, [scriptId, setScriptCodeMap, setPendingVersionUpdate])

    return (
      <div className="h-full w-full relative" ref={monacoEl}>
        <style>
          {`
            .monaco-editor .monaco-editor-background,
            .monaco-editor .margin {
              background-color: var(--custom-editor-background, ${theme === "light" ? "#ffffff" : "#1e1e1e"}) !important;
            }
          `}
        </style>
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
            language="typescript" // Always use typescript language
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
            language="typescript" // Always use typescript language
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
