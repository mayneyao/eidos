import { forwardRef, useCallback, useEffect, useMemo } from "react"
import {
  ESMImportResolverPlugin,
  SimpleCodeEditor,
  TailwindCSSPlugin,
} from "@/packages/code-editor/src"
import { FileType, type FileModel } from "@/packages/code-editor/src/types"
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
import buttonRaw from "@/components/ui/button?raw"
import { twConfig } from "@/components/block-renderer/tailwind-config"

import { getDynamicPrompt } from "../helper"
import { useEditorStore } from "../stores/editor-store"

// import accordionDts from "./built-in-types/accordion.d.mts?raw"
// import alertDialogDts from "./built-in-types/alert-dialog.d.mts?raw"
// built-in dependencies
// import buttonDts from "./built-in-types/button.d.mts?raw"
// import cardDts from "./built-in-types/card.d.mts?raw"
// import dropdownMenuDts from "./built-in-types/dropdown-menu.d.mts?raw"
// import inputDts from "./built-in-types/input.d.mts?raw"
// import navigationMenuDts from "./built-in-types/navigation-menu.d.mts?raw"
// import popoverDts from "./built-in-types/popover.d.mts?raw"

// const builtInDependencies: FileModel[] = [
//   {
//     id: "button",
//     name: "button",
//     path: "components/ui/button.tsx",
//     content: buttonDts,
//     language: "typescript",
//     type: FileType.File,
//   },
//   {
//     id: "alert-dialog",
//     name: "alert-dialog",
//     path: "components/ui/alert-dialog.tsx",
//     content: alertDialogDts,
//     language: "typescript",
//     type: FileType.File,
//   },
// ]

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

    // Stable memoization for customImportSuggestions to prevent unnecessary plugin reinitialization
    const customImportSuggestions = useMemo(() => {
      const suggestions = allScripts
        .filter((script) => script.id !== scriptId)
        .map((script) => ({
          label: `${script.slug}[${script.name}]`,
          insertText: `./${script.slug}`,
          detail: script.description,
          documentation: script.description,
        }))

      // if currentExtension is a block, addd @/components/ui/*
      if (currentExtension?.type === "block") {
        suggestions.push({
          label: "@/components/ui/button",
          insertText: "@/components/ui/button",
          detail: "Tailwind CSS components",
          documentation: "Tailwind CSS components",
        })
      }
      // Create a stable hash to avoid recreating when content is the same
      const suggestionHash = suggestions
        .map((s) => `${s.label}:${s.insertText}`)
        .join("|")
      return { suggestions, hash: suggestionHash }
    }, [allScripts, scriptId])

    // Use only the suggestions array for the component
    const stableSuggestions = customImportSuggestions.suggestions

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
        console.warn({ slug })
        // fetch from local file
        let _slug = slug
        if (slug.startsWith("@/components/ui")) {
          _slug = slug.replace("@/components/ui", "components/ui")
        }
        const res = await sqlite?.extension.getExtensionBySlug(_slug)
        console.warn({ res, slug, _slug })
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
        console.warn({ deps })
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
          diffCode={toApplyCode}
          language="typescript"
          className="w-full h-full"
          onChange={handleEditorChange}
          onSave={handleSave}
          theme={theme}
          getDeps={getDepsWithTypes}
          onJump={jumpToExtension}
          // builtInDependencies={builtInDependencies}
        >
          {/* ESM Import Resolver Plugin with dynamic configuration */}
          <ESMImportResolverPlugin
            enableAutoTypeResolution={true}
            customImportSuggestions={stableSuggestions}
            enableAutoPackageDownload={true}
            downloadProductionOnly={true}
            downloadWithTypes={true}
            esmServerUrl="https://esm.sh"
          />
          {/* Tailwind CSS Autocomplete Plugin with custom configuration */}
          <TailwindCSSPlugin
            enabled={true}
            tailwindConfig={twConfig as any} // Type assertion for Tailwind config compatibility
            customClasses={[
              // Add any additional custom classes specific to your project
              "custom-gradient",
              "hero-section",
              "card-hover",
              "animate-fade-in",
            ]}
          />
        </SimpleCodeEditor>
      </div>
    )
  }
)

SimpleCodeEditorWrapper.displayName = "SimpleCodeEditorWrapper"

export default SimpleCodeEditorWrapper
