import React, { useState } from "react"
import { Edit3, FolderPlus, Plus, Trash2 } from "lucide-react"

import { getLanguageFromFileName, useMultiFileEditorStore } from "../store"
import type { FileModel, SupportedLanguage } from "../types"
import { FileType } from "../types"

/**
 * File toolbar component
 * Provides create, delete, rename file functionality
 */
export const FileToolbar: React.FC = () => {
  const { addFile, removeFile, renameFile } = useMultiFileEditorStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createType, setCreateType] = useState<FileType>(FileType.File)
  const [newFileName, setNewFileName] = useState("")

  const handleCreateFile = () => {
    setCreateType(FileType.File)
    setShowCreateDialog(true)
  }

  const handleCreateFolder = () => {
    setCreateType(FileType.Directory)
    setShowCreateDialog(true)
  }

  const handleConfirmCreate = () => {
    if (!newFileName.trim()) return

    const fileName = newFileName.trim()
    const fileId = fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "-")

    const newFile: FileModel = {
      id: fileId,
      name: fileName,
      path: fileName,
      content: createType === FileType.File ? "" : "",
      language:
        createType === FileType.File
          ? ((getLanguageFromFileName(fileName) === "typescript"
              ? "typescript"
              : "") as SupportedLanguage)
          : ("" as SupportedLanguage),
      type: createType,
    }

    addFile(newFile)
    setShowCreateDialog(false)
    setNewFileName("")
  }

  const handleCancelCreate = () => {
    setShowCreateDialog(false)
    setNewFileName("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmCreate()
    } else if (e.key === "Escape") {
      handleCancelCreate()
    }
  }

  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <button
          onClick={handleCreateFile}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="New File"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={handleCreateFolder}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="New Folder"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {/* Create file/folder dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg w-80">
            <h3 className="text-lg font-medium mb-4">
              {createType === FileType.File ? "New File" : "New Folder"}
            </h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                createType === FileType.File
                  ? "Enter file name (e.g., example.ts)"
                  : "Enter folder name"
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleCancelCreate}
                className="px-3 py-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreate}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={!newFileName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileToolbar
