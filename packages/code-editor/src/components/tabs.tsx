import React, { useState } from "react"
import { X } from "lucide-react"
import { useMultiFileEditorStore } from "../store"
import { FileType } from "../types"

/**
 * Tab component
 * Displays currently open file tabs, supports switching and closing
 */
export const Tabs: React.FC = () => {
  const {
    files,
    openFiles,
    activeFileId,
    setActiveFileId,
    closeFile,
    setOpenFiles,
  } = useMultiFileEditorStore()
  const [draggedTab, setDraggedTab] = useState<string | null>(null)
  const [dragOverTab, setDragOverTab] = useState<string | null>(null)

  // Get open file information
  const openFileModels = openFiles
    .map((fileId) => files.find((f) => f.id === fileId))
    .filter((file) => file && file.type === FileType.File)

  if (openFileModels.length === 0) {
    return null
  }

  const handleTabClick = (fileId: string) => {
    setActiveFileId(fileId)
  }

  const handleTabClose = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation()
    closeFile(fileId)
  }

  const handleTabKeyDown = (e: React.KeyboardEvent, fileId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setActiveFileId(fileId)
    }
  }

  // Drag-related handler functions
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    setDraggedTab(fileId)
    e.dataTransfer.effectAllowed = "move"
    // Set a transparent drag image
    const img = new Image()
    e.dataTransfer.setDragImage(img, 0, 0)
  }

  const handleDragOver = (e: React.DragEvent, fileId: string) => {
    e.preventDefault()
    if (draggedTab !== fileId) {
      setDragOverTab(fileId)
    }
  }

  const handleDragLeave = () => {
    setDragOverTab(null)
  }

  const handleDrop = (e: React.DragEvent, targetFileId: string) => {
    e.preventDefault()
    if (!draggedTab || draggedTab === targetFileId) {
      setDraggedTab(null)
      setDragOverTab(null)
      return
    }

    // Reorder tabs
    const newOpenFiles = [...openFiles]
    const draggedIndex = newOpenFiles.indexOf(draggedTab)
    const targetIndex = newOpenFiles.indexOf(targetFileId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOpenFiles.splice(draggedIndex, 1)
      newOpenFiles.splice(targetIndex, 0, draggedTab)
      setOpenFiles(newOpenFiles)
    }

    setDraggedTab(null)
    setDragOverTab(null)
  }

  const handleDragEnd = () => {
    setDraggedTab(null)
    setDragOverTab(null)
  }

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {openFileModels.map((file) => {
        if (!file) return null

        const isActive = file.id === activeFileId
        const isDragging = draggedTab === file.id
        const isDragOver = dragOverTab === file.id

        return (
          <div
            key={file.id}
            draggable
            className={`
              flex items-center px-3 py-2 border-r border-gray-200 dark:border-gray-700
              cursor-pointer select-none min-w-0 max-w-48 transition-all duration-150
              ${
                isActive
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }
              ${isDragging ? "opacity-50 scale-95" : ""}
              ${isDragOver ? "border-l-2 border-l-blue-500" : ""}
            `}
            onClick={() => handleTabClick(file.id)}
            onKeyDown={(e) => handleTabKeyDown(e, file.id)}
            onDragStart={(e) => handleDragStart(e, file.id)}
            onDragOver={(e) => handleDragOver(e, file.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, file.id)}
            onDragEnd={handleDragEnd}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
          >
            {/* File name */}
            <span className="truncate text-sm font-medium">
              {file.name}
            </span>

            {/* Close button */}
            <button
              className={`
                ml-2 p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600
                ${isActive ? "text-gray-500 dark:text-gray-400" : "text-gray-400 dark:text-gray-500"}
              `}
              onClick={(e) => handleTabClose(e, file.id)}
              aria-label={`Close ${file.name}`}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default Tabs
