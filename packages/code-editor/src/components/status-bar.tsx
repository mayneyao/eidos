import React from "react"
import { useMultiFileEditorStore } from "../store"
import { FileType } from "../types"

/**
 * Status bar component
 * Displays current file information and editor status
 */
export const StatusBar: React.FC = () => {
  const { files, activeFileId, openFiles } = useMultiFileEditorStore()

  // Get currently active file
  const activeFile = activeFileId
    ? files.find((f) => f.id === activeFileId && f.type === FileType.File)
    : null

  // Statistics
  const totalFiles = files.filter((f) => f.type === FileType.File).length
  const totalDirectories = files.filter((f) => f.type === FileType.Directory).length
  const openFileCount = openFiles.length

  return (
    <div className="h-7 bg-blue-600 dark:bg-blue-700 text-white text-xs flex items-center justify-between px-4 border-t border-blue-500 dark:border-blue-600">
      <div className="flex items-center space-x-3">
        {/* Current file info */}
        {activeFile && (
          <div className="flex items-center space-x-2">
            <span className="font-medium text-white">{activeFile.name}</span>
            <span className="text-blue-200 opacity-70">{'>'}</span>
            <span className="text-blue-100 capitalize">{activeFile.language}</span>
          </div>
        )}
        {!activeFile && (
          <span className="text-blue-200">No file selected</span>
        )}
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* File statistics */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-blue-100">
          <span className="flex items-center space-x-1">
            <span>{totalFiles}</span>
            <span className="text-blue-200 hidden xs:inline">Files</span>
            <span className="text-blue-200 xs:hidden">F</span>
          </span>
          <span className="text-blue-300 hidden sm:inline">•</span>
          <span className="flex items-center space-x-1 hidden sm:flex">
            <span>{totalDirectories}</span>
            <span className="text-blue-200">Folders</span>
          </span>
          <span className="text-blue-300 hidden sm:inline">•</span>
          <span className="flex items-center space-x-1">
            <span>{openFileCount}</span>
            <span className="text-blue-200 hidden xs:inline">Open</span>
            <span className="text-blue-200 xs:hidden">O</span>
          </span>
        </div>

        {/* Editor info */}
        <div className="text-blue-200 hidden md:block">
          Multi-file Editor
        </div>
      </div>
    </div>
  )
}

export default StatusBar
