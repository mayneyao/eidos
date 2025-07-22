import React, { useEffect, useState } from "react"
import type * as monaco from "monaco-editor"

import { EditorArea } from "./components/editor-area"
import { FileTree } from "./components/file-tree"
import { PluginStatus } from "./components/plugin-status"
import { ShortcutHelp } from "./components/shortcut-help"
import { StatusBar } from "./components/status-bar"
import { Tabs } from "./components/tabs"
import { useKeyboardShortcuts } from "./hooks/use-keyboard-shortcuts"
import { setupMonacoEnvironment } from "./monaco-setup"
import { useMultiFileEditorStore } from "./store"
import { type FileModel } from "./types"

// Configure Monaco Environment and Workers (async initialization)
let monacoInitPromise: Promise<typeof monaco> | null = null

// Ensure initialization only happens once
if (!monacoInitPromise) {
  monacoInitPromise = setupMonacoEnvironment()
}

export interface MultiFileEditorProps {
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
}

/**
 * Multi-file editor component
 * Provides VSCode-like multi-file editing experience
 */
export const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
  initialFiles = [],
  initialOpenFiles = [],
  initialActiveFileId,
  autoInitialize = true,
  className = "w-full h-full",
}) => {
  const { setFiles, setOpenFiles, setActiveFileId } = useMultiFileEditorStore()
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize editor
  useEffect(() => {
    if (!autoInitialize) return

    console.log("=== Starting multi-file editor initialization ===")

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

  // Set up keyboard shortcuts
  useKeyboardShortcuts()

  return (
    <div className={`${className} flex flex-col bg-gray-50 dark:bg-gray-900`}>
      <div className="flex-1 flex overflow-hidden">
        {/* File tree sidebar */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800">
          <FileTree />
        </div>

        {/* Editor main area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
          {/* Tabs */}
          <Tabs />

          {/* Editor area */}
          <div className="flex-1 overflow-hidden">
            <EditorArea theme="vs-dark" onSave={() => {}} />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Shortcut help */}
      <ShortcutHelp />

      {/* Plugin status */}
      <PluginStatus />
    </div>
  )
}

export default MultiFileEditor
