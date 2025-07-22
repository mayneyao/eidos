import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react"
import { SimpleCodeEditor } from "@/packages/code-editor/src/simple-code-editor"
import { FileType, type FileModel } from "@/packages/code-editor/src/types"
import type { IExtension } from "@/packages/core/meta-table/extension"
import {
  resolveLocalFileDependencies,
  type ResolvedFile,
} from "@/packages/v3/code-tools/get-deps-file"
import ts from "typescript/lib/typescript"

import { useAllScripts } from "@/hooks/use-all-scripts"
import { useSqlite } from "@/hooks/use-sqlite"

import { getDynamicPrompt } from "../helper"
import { useEditorStore } from "../stores/editor-store"

function compile(source: string) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  })
  return result.outputText
}

export interface CodeEditorProps {
  value: string
  onSave?: (code: string, ts_code?: string, version?: string) => void
  language?: string
  customCompile?: (code: string) => Promise<string>
  theme?: "vs-dark" | "light"
  scriptId?: string
  bindings?: IExtension["bindings"]
}

export const SimpleCodeEditorWrapper = forwardRef(
  (
    {
      value,
      onSave,
      language = "typescript",
      customCompile,
      theme = "light",
      scriptId,
      bindings,
    }: CodeEditorProps,
    ref
  ) => {
    const [code, setCode] = useState<string | undefined>(value)
    const dynamicPrompt = useMemo(() => getDynamicPrompt(bindings), [bindings])

    const [deps, setDeps] = useState<ResolvedFile[]>()
    const { sqlite } = useSqlite()
    const allScripts = useAllScripts()

    const customImportSuggestions = useMemo(() => {
      return allScripts
        .filter((script) => script.id !== scriptId)
        .map((script) => ({
          label: `${script.slug}[${script.name}]`,
          insertText: `./${script.slug}`,
          detail: script.description,
          documentation: script.description,
        }))
    }, [allScripts])

    const getExtensionBySlug = async (slug: string) => {
      const res = await sqlite?.extension.getExtensionBySlug(slug)
      if (!res) {
        return null
      }
      return res.ts_code || null
    }
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

    const handleSave = useCallback(
      async (fileId: string, codeToSave: string, versionToSave?: string) => {
        setCode(codeToSave)
        if (language === "typescript" || language === "typescriptreact") {
          if (customCompile) {
            customCompile(codeToSave).then((jsCode) => {
              console.log({
                jsCode,
                codeToSave,
              })
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

    // parent component can call handleSave directly
    useImperativeHandle(
      ref,
      () => ({
        save: () => {
          if (code) {
            handleSave?.(scriptId!, code)
          }
        },
        layout: () => {
          // SimpleCodeEditor handles layout automatically
        },
      }),
      [code, handleSave]
    )

    const handleAcceptChanges = useCallback(() => {
      if (toApplyCode && scriptId) {
        const newVersion = pendingVersionUpdateMap[scriptId]
        handleSave(scriptId, toApplyCode, newVersion || undefined)
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

    useEffect(() => {
      const getDeps = async () => {
        const deps = await resolveLocalFileDependencies(
          scriptId || "current",
          code || "",
          getExtensionBySlug
        )
        console.warn("deps", deps)
        return deps
      }
      getDeps().then(setDeps)
    }, [code])

    const handleRejectChanges = useCallback(() => {
      if (scriptId) {
        setScriptCodeMap(scriptId, "")
        setPendingVersionUpdate(scriptId, null)
      }
    }, [scriptId, setScriptCodeMap, setPendingVersionUpdate])

    // Convert current script and all scripts to FileModel format
    const files: FileModel[] = useMemo(() => {
      const currentFile: FileModel = {
        id: scriptId || "current",
        name: `${scriptId || "current"}.ts`,
        path: `${scriptId || "current"}.ts`,
        content: code || "",
        language:
          language === "typescriptreact" ? "typescriptreact" : "typescript",
        type: FileType.File,
      }

      const depsFiles = (deps || [])
        .filter((dp) => dp.id !== scriptId)
        .map((dp) => {
          return {
            id: dp.id,
            name: `${dp.id}.ts`,
            path: `${dp.id}.ts`,
            content: dp.content,
            language: "typescript" as const,
            type: FileType.File,
          }
        })
      // const otherFiles: FileModel[] = allScripts
      //   .filter((script) => script.id !== scriptId)
      //   .map((script) => ({
      //     id: script.id,
      //     name: `${script.name || script.id}.ts`,
      //     path: `${script.name || script.id}.ts`,
      //     content: script.ts_code || script.code || "",
      //     language: "typescript" as const,
      //     type: FileType.File,
      //   }))
      const eidosType: FileModel = {
        id: `eidos`,
        name: `eidos.d.ts`,
        path: `eidos.d.ts`,
        content: dynamicPrompt,
        language: "typescript" as const,
        type: FileType.File,
      }

      return [currentFile, eidosType, ...depsFiles]
    }, [code, scriptId, language, deps])

    const handleEditorChange = useCallback(
      (fileId: string, newCode: string) => {
        if (fileId === scriptId || fileId === "current") {
          setCode(newCode)
        }
      },
      [scriptId]
    )

    return (
      <div className="h-full w-full relative">
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
        <SimpleCodeEditor
          initialFiles={files}
          initialOpenFiles={[scriptId || "current"]}
          initialActiveFileId={scriptId || "current"}
          className="w-full h-full"
          onChange={handleEditorChange}
          onSave={handleSave}
          theme={theme}
          customImportSuggestions={customImportSuggestions}
        />
      </div>
    )
  }
)

SimpleCodeEditorWrapper.displayName = "SimpleCodeEditorWrapper"

export default SimpleCodeEditorWrapper
