import type * as monaco from "monaco-editor"

/**
 * File type enumeration
 */
export enum FileType {
  File = "file",
  Directory = "directory",
}

/**
 * Supported language types (TypeScript only)
 */
export type SupportedLanguage = "typescript" | ""

/**
 * Determine file extension based on extension type
 * script → .ts, block → .tsx
 */
export function getFileExtensionFromType(extensionType: "script" | "block"): string {
  return extensionType === "block" ? ".tsx" : ".ts"
}

/**
 * Determine language type based on file path (always typescript)
 */
export function getLanguageFromPath(filePath: string): SupportedLanguage {
  // Always return typescript - JSX support is handled by file extension
  return 'typescript'
}

/**
 * File model interface
 */
export interface FileModel {
  id: string
  name: string
  path: string
  content: string
  language: SupportedLanguage
  type: FileType
  children?: FileModel[]
  parent?: string
}

/**
 * Editor state interface
 */
export interface MultiFileEditorState {
  // All files list
  files: FileModel[]
  // Currently opened file ID list
  openFiles: string[]
  // Currently active file ID
  activeFileId: string | null
  // File model mapping
  fileModels: Record<string, monaco.editor.ITextModel>

  // Set all files
  setFiles: (files: FileModel[]) => void
  // Add new file
  addFile: (file: FileModel) => void
  // Remove file
  removeFile: (fileId: string) => void
  // Update file content
  updateFileContent: (fileId: string, content: string) => void
  // Rename file
  renameFile: (fileId: string, newName: string) => void
  // Move file
  moveFile: (fileId: string, newParentId: string) => void

  // Set opened files list
  setOpenFiles: (fileIds: string[]) => void
  // Open file
  openFile: (fileId: string) => void
  // Close file
  closeFile: (fileId: string) => void
  // Set currently active file
  setActiveFileId: (fileId: string | null) => void

  // Set file model
  setFileModel: (fileId: string, model: monaco.editor.ITextModel) => void
  // Get file model
  getFileModel: (fileId: string) => monaco.editor.ITextModel | undefined
}

/**
 * Editor reference interface
 */
export interface EditorRef {
  editor: monaco.editor.IStandaloneCodeEditor | null
  save: () => void
  layout: () => void
}
