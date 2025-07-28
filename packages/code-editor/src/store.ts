import { create } from "zustand"
import type * as monaco from "monaco-editor"
import type { FileModel, MultiFileEditorState } from "./types";
import { FileType } from "./types"

/**
 * Multi-file editor state management
 */
export const useMultiFileEditorStore = create<MultiFileEditorState>((set, get) => ({
  files: [],
  openFiles: [],
  activeFileId: null,
  fileModels: {},

  setFiles: (files: FileModel[]) => set({ files }),

  addFile: (file: FileModel) =>
    set((state) => ({
      files: [...state.files, file],
    })),

  removeFile: (fileId: string) =>
    set((state) => {
      // Remove from file list
      const newFiles = state.files.filter((f) => f.id !== fileId)

      // Remove from open files list
      const newOpenFiles = state.openFiles.filter((id) => id !== fileId)

      // If the deleted file is currently active, switch to another file
      let newActiveFileId = state.activeFileId
      if (state.activeFileId === fileId) {
        newActiveFileId = newOpenFiles.length > 0 ? newOpenFiles[0] : null
      }

      // Clean up file model
      const fileModel = state.fileModels[fileId]
      if (fileModel) {
        fileModel.dispose()
        const { [fileId]: removed, ...remainingModels } = state.fileModels
        return {
          files: newFiles,
          openFiles: newOpenFiles,
          activeFileId: newActiveFileId,
          fileModels: remainingModels,
        }
      }

      return {
        files: newFiles,
        openFiles: newOpenFiles,
        activeFileId: newActiveFileId,
      }
    }),

  updateFileContent: (fileId: string, content: string) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.id === fileId ? { ...file, content } : file
      ),
    })),

  renameFile: (fileId: string, newName: string) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.id === fileId
          ? {
            ...file,
            name: newName,
            path: file.path.replace(file.name, newName),
          }
          : file
      ),
    })),

  moveFile: (fileId: string, newParentId: string) =>
    set((state) => {
      const file = state.files.find((f) => f.id === fileId)
      if (!file) return state

      const newParent = state.files.find((f) => f.id === newParentId)
      if (!newParent || newParent.type !== FileType.Directory) return state

      const newPath = `${newParent.path}/${file.name}`

      return {
        files: state.files.map((f) =>
          f.id === fileId
            ? {
              ...f,
              path: newPath,
              parent: newParentId,
            }
            : f
        ),
      }
    }),

  setOpenFiles: (fileIds: string[]) => set({ openFiles: fileIds }),

  openFile: (fileId: string) =>
    set((state) => {
      if (state.openFiles.includes(fileId)) {
        // File is already open, just activate it
        return { activeFileId: fileId }
      }

      // Add to open files list and activate
      return {
        openFiles: [...state.openFiles, fileId],
        activeFileId: fileId,
      }
    }),

  closeFile: (fileId: string) =>
    set((state) => {
      const newOpenFiles = state.openFiles.filter((id) => id !== fileId)

      // If the closed file is currently active, switch to another file
      let newActiveFileId = state.activeFileId
      if (state.activeFileId === fileId) {
        if (newOpenFiles.length > 0) {
          // Find the current file's position in the list, switch to adjacent file
          const currentIndex = state.openFiles.indexOf(fileId)
          if (currentIndex > 0) {
            newActiveFileId = newOpenFiles[currentIndex - 1]
          } else {
            newActiveFileId = newOpenFiles[0]
          }
        } else {
          newActiveFileId = null
        }
      }

      return {
        openFiles: newOpenFiles,
        activeFileId: newActiveFileId,
      }
    }),

  setActiveFileId: (fileId: string | null) => set({ activeFileId: fileId }),

  setFileModel: (fileId: string, model: monaco.editor.ITextModel) =>
    set((state) => ({
      fileModels: {
        ...state.fileModels,
        [fileId]: model,
      },
    })),

  getFileModel: (fileId: string) => {
    const state = get()
    return state.fileModels[fileId]
  },
}))

/**
 * Get file display name
 */
export function getFileDisplayName(file: FileModel): string {
  return file.name
}

/**
 * Get file full path
 */
export function getFileFullPath(file: FileModel): string {
  return file.path
}

/**
 * Get language type based on file extension
 */
export function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript' // Both .ts and .tsx use typescript language
    case 'js':
      return 'javascript'
    case 'jsx':
      return 'javascriptreact'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'css':
      return 'css'
    case 'scss':
      return 'scss'
    case 'html':
      return 'html'
    case 'py':
      return 'python'
    default:
      return 'plaintext'
  }
}
