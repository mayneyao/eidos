import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { SimpleCodeEditor } from "@/packages/code-editor/src/simple-code-editor"
import type { IExtension } from "@/packages/core/meta-table/extension"
import {
  resolveLocalFileDependencies,
  type ResolvedFile,
} from "@/packages/v3/code-tools/get-deps-file"
import { useNavigate } from "react-router-dom"
import ts from "typescript/lib/typescript"

import { useAllScripts } from "@/hooks/use-all-scripts"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useExtensionByIdOrSlug } from "@/hooks/use-extension"
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
    const dynamicPrompt = useMemo(() => getDynamicPrompt(bindings), [bindings])

    const navigate = useNavigate()
    const { space } = useCurrentPathInfo()
    const { sqlite } = useSqlite()
    const allScripts = useAllScripts()
    const currentExtension = useExtensionByIdOrSlug(scriptId)

    const customImportSuggestions = useMemo(() => {
      return allScripts
        .filter((script) => script.id !== scriptId)
        .map((script) => ({
          label: `${script.slug}[${script.name}]`,
          insertText: `./${script.slug}`,
          detail: script.description,
          documentation: script.description,
        }))
    }, [allScripts, scriptId])

    const jumpToExtension = (id: string) => {
      navigate(`/${space}/extensions/${id}`)
    }

    const getExtensionBySlug = useCallback(
      async (
        slug: string
      ): Promise<{
        content: string
        ext: "ts" | "tsx"
      } | null> => {
        const res = await sqlite?.extension.getExtensionBySlug(slug)
        if (!res) {
          return null
        }
        return {
          content: res.ts_code!,
          ext: res.type === "block" ? "tsx" : "ts",
        }
      },
      [sqlite]
    )
    const {
      scriptCodeMap,
      setScriptCodeMap,
      setActiveTab,
      pendingVersionUpdateMap,
      setPendingVersionUpdate,
      setUnsavedChanges,
    } = useEditorStore()

    // Clear unsaved changes for this script on unmount
    useEffect(() => {
      return () => {
        if (scriptId) {
          setUnsavedChanges(scriptId, false)
        }
      }
    }, [scriptId, setUnsavedChanges])

    const toApplyCode = scriptId ? scriptCodeMap[scriptId] : undefined

    const handleSave = useCallback(
      async (codeToSave: string, versionToSave?: string) => {
        // Mark as saved when save is called
        if (scriptId) {
          setUnsavedChanges(scriptId, false)
        }
        if (language === "typescript") {
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
      [language, onSave, customCompile, scriptId, setUnsavedChanges]
    )

    // Determine extension based on script type: script -> .ts, block -> .tsx
    const ext = currentExtension?.type === "block" ? "tsx" : "ts"

    const getDeps = useCallback(
      async (code: string) => {
        const deps = await resolveLocalFileDependencies(
          scriptId || "current",
          code,
          ext,
          getExtensionBySlug
        )
        return deps
      },
      [scriptId, ext, getExtensionBySlug]
    )

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

    // Create the file name based on script info
    const fileName = useMemo(() => {
      return `${scriptId || "current"}.${ext}`
    }, [scriptId, ext])

    const handleEditorChange = useCallback(
      (newCode: string) => {
        if (scriptId) {
          setUnsavedChanges(scriptId, true)
        }
      },
      [scriptId, setUnsavedChanges]
    )

    // Enhanced getDeps that includes eidos types
    const getDepsWithTypes = useCallback(
      async (code: string) => {
        const deps = await getDeps(code)

        // Add eidos type definitions as a dependency
        const eidosTypeDep: ResolvedFile = {
          id: "eidos",
          content: dynamicPrompt,
          imports: [],
          ext: "ts",
        }

        return [...deps, eidosTypeDep]
      },
      [getDeps, dynamicPrompt]
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
          initialCode={value || "// Start coding here..."}
          fileName={fileName}
          language="typescript"
          className="w-full h-full"
          onChange={handleEditorChange}
          onSave={handleSave}
          theme={theme}
          getDeps={getDepsWithTypes}
          customImportSuggestions={customImportSuggestions}
          onJump={jumpToExtension}
        />
      </div>
    )
  }
)

SimpleCodeEditorWrapper.displayName = "SimpleCodeEditorWrapper"

export default SimpleCodeEditorWrapper
