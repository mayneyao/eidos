import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type * as monaco from "monaco-editor"

import { EditorArea } from "./components/editor-area"
import { setupMonacoEnvironment } from "./monaco-setup"
import {
  getPluginManager,
  type ImportSuggestion,
} from "./plugins/plugin-manager"
import { FileType, type FileModel, type SupportedLanguage } from "./types"

// Configure Monaco Environment and Workers (async initialization)
let monacoInitPromise: Promise<typeof monaco> | null = null

// Ensure initialization only happens once
if (!monacoInitPromise) {
  monacoInitPromise = setupMonacoEnvironment()
}

export interface ResolvedFile {
  id: string
  content: string
  imports: string[]
}

export interface SimpleCodeEditorProps {
  /** Initial code content */
  initialCode?: string
  /** File language */
  language?: string
  /** File name/ID */
  fileName?: string
  /** Whether to auto-initialize editor */
  autoInitialize?: boolean
  /** Custom class name */
  className?: string
  /** Code content change callback */
  onChange?: (content: string) => void
  onSave?: (content: string) => void
  onJump?: (path: string) => void
  /** Function to resolve dependencies from code */
  getDeps?: (code: string) => Promise<ResolvedFile[]>
  theme?: "vs-dark" | "light"
  /** Custom import suggestions for auto-completion */
  customImportSuggestions?: ImportSuggestion[]
}

/**
 * Simple code editor component
 * Handles single code content with internal dependency resolution
 * Uses getDeps to dynamically discover and load dependencies
 */
export const SimpleCodeEditor: React.FC<SimpleCodeEditorProps> = ({
  initialCode = "",
  language = "typescript",
  fileName = "main.ts",
  autoInitialize = true,
  className = "w-full h-full",
  onChange,
  onSave,
  theme = "light",
  customImportSuggestions = [],
  getDeps,
  onJump,
}) => {
  const [isInitialized, setIsInitialized] = useState(false)

  // Internal state to manage dynamically discovered dependencies
  const [dependencies, setDependencies] = useState<FileModel[]>([])

  const getDepFiles = useCallback(
    async (code: string) => {
      if (getDeps) {
        const deps = await getDeps(code)
        const depsFiles = (deps || []).map((dp) => {
          return {
            id: dp.id,
            name: `${dp.id}.ts`,
            path: `${dp.id}.ts`,
            content: dp.content,
            language: "typescript" as const,
            type: FileType.File,
          }
        })
        return depsFiles
      }
      return []
    },
    [getDeps]
  )

  // Initialize Monaco Editor
  useEffect(() => {
    if (!autoInitialize) return

    console.log("=== Starting Monaco editor initialization ===")

    monacoInitPromise
      ?.then(() => {
        console.log("✅ Monaco Editor initialization complete")
        setIsInitialized(true)
      })
      .catch((error) => {
        console.error("❌ Failed to initialize Monaco Editor:", error)
      })
  }, [autoInitialize])

  // Check dependencies for initial code when editor is initialized
  useEffect(() => {
    if (isInitialized && initialCode.trim()) {
      console.log("🔍 Checking dependencies for initial code")

      // Resolve dependencies for initial code
      getDepFiles(initialCode)
        .then((newDeps) => {
          if (newDeps.length > 0) {
            console.log(
              `📦 Found ${newDeps.length} initial dependencies:`,
              newDeps.map((d) => d.id)
            )
            setDependencies(newDeps)
          }
        })
        .catch((error) => {
          console.error("❌ Failed to resolve initial dependencies:", error)
        })
    }
  }, [isInitialized, initialCode, getDepFiles])

  // Update custom import suggestions when they change
  useEffect(() => {
    if (customImportSuggestions.length > 0) {
      console.log(
        "Updating custom import suggestions:",
        customImportSuggestions.length
      )

      // Wait for Monaco to be initialized before updating plugin
      monacoInitPromise
        ?.then(() => {
          const pluginManager = getPluginManager()
          const esmPlugin = pluginManager.getPlugin("esm-import-resolver")

          if (esmPlugin && esmPlugin.isEnabled()) {
            // Type assertion to access the updateCustomImportSuggestions method
            const typedPlugin = esmPlugin as any
            if (
              typeof typedPlugin.updateCustomImportSuggestions === "function"
            ) {
              typedPlugin.updateCustomImportSuggestions(customImportSuggestions)
              console.log("✅ Custom import suggestions updated successfully")
            }
          }
        })
        .catch((error) => {
          console.error("❌ Failed to update custom import suggestions:", error)
        })
    }
  }, [customImportSuggestions])

  // Enhanced onChange handler with internal dependency resolution
  const handleChange = useCallback(
    async (code: string) => {
      onChange?.(code)

      // 始终尝试解析依赖（如果没有提供 getDeps 会使用测试依赖）
      try {
        const newDeps = await getDepFiles(code)

        if (newDeps.length > 0) {
          // Check for new dependencies not yet resolved
          setDependencies((prevDeps) => {
            const existingIds = new Set(prevDeps.map((f) => f.id))
            const trulyNewDeps = newDeps.filter(
              (dep) => !existingIds.has(dep.id)
            )

            if (trulyNewDeps.length > 0) {
              console.log(
                `📦 Adding ${trulyNewDeps.length} new dependency files:`,
                trulyNewDeps.map((d) => d.id)
              )
              return [...prevDeps, ...trulyNewDeps]
            }
            return prevDeps
          })
        }
      } catch (error) {
        console.error("Failed to resolve dependencies:", error)
      }
    },
    [onChange, getDepFiles]
  )

  // Enhanced onSave handler
  const handleSave = useCallback(
    (code: string) => {
      console.log(`SimpleCodeEditor: Saving code`)
      onSave?.(code)
    },
    [onSave]
  )

  // Create current file model from the initial code content
  // Note: Using initialCode directly ensures the editor updates when the prop changes
  const currentFile = useMemo(() => {
    return {
      id: fileName,
      name: fileName,
      path: fileName,
      content: initialCode,
      language: "typescript" as SupportedLanguage,
      type: FileType.File,
    }
  }, [fileName, initialCode])

  // Show loading state while Monaco is initializing
  if (!isInitialized) {
    return (
      <div className={className}>
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Initializing editor...</p>
            <div className="mt-4 text-xs text-gray-400">
              <p>File: {fileName}</p>
              <p>Dependencies: {dependencies.length}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Debug: log current state
  console.log(`🔍 SimpleCodeEditor render:`, {
    fileName,
    initialCodeLength: initialCode.length,
    dependencies: dependencies.length,
    isInitialized,
  })

  return (
    <div className={className}>
      <EditorArea
        currentFile={currentFile}
        dependencies={dependencies}
        theme={theme}
        onSave={(_, code) => handleSave(code)}
        onChange={(_, code) => handleChange(code)}
        onFileJump={onJump}
      />
    </div>
  )
}

export default SimpleCodeEditor
