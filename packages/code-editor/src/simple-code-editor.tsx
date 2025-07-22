import React, { useEffect, useState } from "react"
import type * as monaco from "monaco-editor"

import { EditorArea } from "./components/editor-area"
import { setupMonacoEnvironment } from "./monaco-setup"
import { useMultiFileEditorStore } from "./store"
import { type FileModel } from "./types"

// Configure Monaco Environment and Workers (async initialization)
let monacoInitPromise: Promise<typeof monaco> | null = null

// Ensure initialization only happens once
if (!monacoInitPromise) {
  monacoInitPromise = setupMonacoEnvironment()
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
  theme?: "vs-dark" | "light"
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

  // Listen for file content changes and call onChange callback
  useEffect(() => {
    if (onChange && initialActiveFileId) {
      const activeFile = files.find((f) => f.id === initialActiveFileId)
      if (activeFile) {
        onChange(initialActiveFileId, activeFile.content)
      }
    }
  }, [files, initialActiveFileId, onChange])

  return (
    <div className="flex-1 h-full">
      <EditorArea
        theme={theme}
        onSave={(code) => onSave?.(activeFileId!, code)}
      />
    </div>
  )
}

export default SimpleCodeEditor
