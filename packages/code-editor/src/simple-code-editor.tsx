import React, { useCallback, useEffect, useState } from "react"
import type * as monaco from "monaco-editor"

import { EditorArea } from "./components/editor-area"
import { setupMonacoEnvironment } from "./monaco-setup"
import {
  getPluginManager,
  type ImportSuggestion,
} from "./plugins/plugin-manager"
import { useMultiFileEditorStore } from "./store"
import { FileType, type FileModel } from "./types"

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
  /** Initial file list */
  initialFiles?: FileModel[]
  /** Initial open file ID list */
  initialOpenFiles?: string[]
  /** Initial active file ID */
  initialActiveFileId?: string
  /** Whether to auto-initialize editor */
  autoInitialize?: boolean
  /** Custom class name */
  className?: string
  /** File content change callback */
  onChange?: (fileId: string, content: string) => void
  onSave?: (fileId: string, content: string) => void
  onFileJump?: (path: string) => void
  getDeps?: (code: string) => Promise<ResolvedFile[]>
  theme?: "vs-dark" | "light"
  /** Custom import suggestions for auto-completion */
  customImportSuggestions?: ImportSuggestion[]
}

/**
 * Simplified multi-file editor component
 * Only includes EditorArea and Tabs, without file tree, status bar and other components
 */
export const SimpleCodeEditor: React.FC<SimpleCodeEditorProps> = ({
  initialFiles = [],
  initialOpenFiles = [],
  initialActiveFileId,
  autoInitialize = true,
  className = "w-full h-full",
  onChange,
  onSave,
  theme = "light",
  customImportSuggestions = [],
  onFileJump,
  getDeps,
}) => {
  const {
    files,
    setFiles,
    setOpenFiles,
    setActiveFileId,
    activeFileId,
    updateFileContent,
  } = useMultiFileEditorStore()
  const [isInitialized, setIsInitialized] = useState(false)

  const getDepFiles = useCallback(
    async (code: string) => {
      if (getDeps) {
        const deps = await getDeps(code)
        const depsFiles = (deps || [])
          .filter((dp) => dp.id !== activeFileId)
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
        return depsFiles
      }
    },
    [activeFileId, getDeps]
  )

  // Initialize editor
  useEffect(() => {
    if (!autoInitialize) return

    console.log("=== Starting simplified code editor initialization ===")

    // Set files immediately, don't wait for Monaco initialization
    if (initialFiles.length > 0) {
      console.log("Setting initial files:", initialFiles.length)
      setFiles(initialFiles)
    }

    // Set initial open files
    if (initialOpenFiles.length > 0) {
      console.log("Setting initial open files:", initialOpenFiles)
      setOpenFiles(initialOpenFiles)
    }

    // Set initial active file
    if (initialActiveFileId) {
      console.log("Setting initial active file:", initialActiveFileId)
      setActiveFileId(initialActiveFileId)
    }

    // Ensure Monaco Editor is initialized
    monacoInitPromise
      ?.then(() => {
        console.log("✅ Monaco Editor initialization complete")
        setIsInitialized(true)
      })
      .catch((error) => {
        console.error("❌ Failed to initialize Monaco Editor:", error)
      })
  }, [
    autoInitialize,
    initialFiles,
    initialOpenFiles,
    initialActiveFileId,
    setFiles,
    setOpenFiles,
    setActiveFileId,
  ])

  // // Listen for file content changes and call onChange callback
  // useEffect(() => {
  //   if (onChange && initialActiveFileId) {
  //     const activeFile = files.find((f) => f.id === initialActiveFileId)
  //     if (activeFile) {
  //       onChange(initialActiveFileId, activeFile.content)
  //     }
  //   }
  // }, [files, initialActiveFileId, onChange])

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

  const handleSave = useCallback(
    (code: string) => {
      onSave?.(activeFileId!, code)
    },
    [activeFileId]
  )
  const handleChange = useCallback(
    (code: string) => {
      onChange?.(activeFileId!, code)
      
    },
    [activeFileId]
  )

  // Dynamic dependency resolution when code changes
  useEffect(() => {
    if (!activeFileId || !getDeps) return

    const activeFile = files.find(f => f.id === activeFileId)
    if (!activeFile) return

    const resolveDependencies = async () => {
      try {
        const depFiles = await getDepFiles(activeFile.content)
        if (depFiles && depFiles.length > 0) {
          // Add new dependency files to the store
          const existingFileIds = new Set(files.map(f => f.id))
          const newFiles = depFiles.filter(f => !existingFileIds.has(f.id))
          
          if (newFiles.length > 0) {
            setFiles([...files, ...newFiles])
            console.log(`Added ${newFiles.length} dependency files`)
          }
        }
      } catch (error) {
        console.error("Failed to resolve dependencies:", error)
      }
    }

    resolveDependencies()
  }, [activeFileId, files, getDepFiles, setFiles, getDeps])

  return (
    <div className="flex-1 h-full">
      <EditorArea
        theme={theme}
        onSave={handleSave}
        onChange={handleChange}
        onFileJump={onFileJump}
      />
    </div>
  )
}

export default SimpleCodeEditor
