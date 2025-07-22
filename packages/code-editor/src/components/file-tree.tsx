import React, { useState } from "react"
import { ChevronDown, ChevronRight, File, Folder, MoreVertical, Edit3, Trash2 } from "lucide-react"
import { useMultiFileEditorStore } from "../store"
import type { FileModel} from "../types";
import { FileType } from "../types"
import { FileToolbar } from "./file-toolbar"

/**
 * File tree component
 * Displays file and directory structure, supports expand/collapse and file selection
 */
export const FileTree: React.FC = () => {
  const { files, openFile, removeFile, renameFile } = useMultiFileEditorStore()
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["utils", "scripts"]))
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    fileId: string
  } | null>(null)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  // Debug info
  console.log("FileTree: files count =", files.length)
  console.log("FileTree: files =", files.map(f => ({ id: f.id, name: f.name, type: f.type })))

  // Build file tree structure
  const rootFiles = files.filter((file) => !file.path.includes("/"))
  const dirMap: Record<string, FileModel[]> = {}

  // Group files by directory
  files.forEach((file) => {
    if (file.path.includes("/")) {
      const dirPath = file.path.split("/")[0]
      if (!dirMap[dirPath]) {
        dirMap[dirPath] = []
      }
      dirMap[dirPath].push(file)
    }
  })

  const toggleDir = (dirId: string) => {
    setExpandedDirs((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(dirId)) {
        newSet.delete(dirId)
      } else {
        newSet.add(dirId)
      }
      return newSet
    })
  }

  const handleFileClick = (fileId: string) => {
    openFile(fileId)
  }

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      fileId,
    })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleRename = (fileId: string) => {
    const file = files.find((f) => f.id === fileId)
    if (file) {
      setEditingFile(fileId)
      setEditingName(file.name)
    }
    setContextMenu(null)
  }

  const handleDelete = (fileId: string) => {
    if (confirm("Are you sure you want to delete this file?")) {
      removeFile(fileId)
    }
    setContextMenu(null)
  }

  const handleConfirmRename = (fileId: string) => {
    if (editingName.trim() && editingName !== files.find((f) => f.id === fileId)?.name) {
      renameFile(fileId, editingName.trim())
    }
    setEditingFile(null)
    setEditingName("")
  }

  const handleCancelRename = () => {
    setEditingFile(null)
    setEditingName("")
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent, fileId: string) => {
    if (e.key === "Enter") {
      handleConfirmRename(fileId)
    } else if (e.key === "Escape") {
      handleCancelRename()
    }
  }

  const renderFileItem = (file: FileModel, depth: number = 0) => {
    const isDirectory = file.type === FileType.Directory
    const isExpanded = isDirectory && expandedDirs.has(file.id)
    const dirFiles = isDirectory ? dirMap[file.path] || [] : []
    const isEditing = editingFile === file.id

    return (
      <div key={file.id}>
        <div
          className={`
            flex items-center px-2 py-1 cursor-pointer select-none
            hover:bg-gray-200 dark:hover:bg-gray-700
            ${depth > 0 ? `pl-${depth * 4 + 2}` : ""}
          `}
          style={depth > 0 ? { paddingLeft: `${depth * 16 + 8}px` } : {}}
          onClick={() => isDirectory ? toggleDir(file.id) : handleFileClick(file.id)}
          onContextMenu={(e) => handleContextMenu(e, file.id)}
        >
          {isDirectory ? (
            <>
              <span className="mr-1">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
              <Folder size={16} className="mr-2 text-blue-500" />
            </>
          ) : (
            <>
              <span className="mr-1 w-4"></span>
              <File size={16} className="mr-2 text-gray-500" />
            </>
          )}

          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => handleRenameKeyDown(e, file.id)}
              onBlur={() => handleConfirmRename(file.id)}
              className="flex-1 px-1 py-0 text-sm bg-white dark:bg-gray-700 border border-blue-500 rounded"
              autoFocus
            />
          ) : (
            <span className="truncate text-sm">{file.name}</span>
          )}
        </div>

        {/* Render child files */}
        {isDirectory && isExpanded && (
          <div>
            {dirFiles
              .sort((a, b) => {
                // Directories come first
                if (a.type !== b.type) {
                  return a.type === FileType.Directory ? -1 : 1
                }
                // Sort by name
                return a.name.localeCompare(b.name)
              })
              .map((childFile) => renderFileItem(childFile, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" onClick={handleCloseContextMenu}>
      <FileToolbar />
      <div className="flex-1 p-2 overflow-y-auto">
        <div className="text-sm font-medium mb-2 px-2">Files</div>
        <div>
          {rootFiles
            .sort((a, b) => {
              // Directories come first
              if (a.type !== b.type) {
                return a.type === FileType.Directory ? -1 : 1
              }
              // Sort by name
              return a.name.localeCompare(b.name)
            })
            .map((file) => renderFileItem(file))}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={() => handleRename(contextMenu.fileId)}
          >
            <Edit3 size={14} />
            Rename
          </button>
          <button
            className="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-600"
            onClick={() => handleDelete(contextMenu.fileId)}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default FileTree
