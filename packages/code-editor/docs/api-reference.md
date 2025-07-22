# API Reference

## 📋 Table of Contents

- [Components](#components)
- [Hooks](#hooks)
- [Types](#types)
- [Store](#store)
- [Utilities](#utilities)
- [Plugin APIs](#plugin-apis)

## Components

### MultiFileEditor

The main editor component that provides a complete multi-file editing experience.

```typescript
interface MultiFileEditorProps {
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
```

**Usage:**
```tsx
<MultiFileEditor
  initialFiles={files}
  initialOpenFiles={['file1', 'file2']}
  initialActiveFileId="file1"
  autoInitialize={true}
  className="w-full h-screen"
/>
```

### SimpleCodeEditor

A lightweight single-file editor component.

```typescript
interface SimpleCodeEditorProps {
  /** File content */
  content: string
  /** Programming language */
  language: SupportedLanguage
  /** Content change handler */
  onChange?: (content: string) => void
  /** Editor theme */
  theme?: 'vs-dark' | 'vs-light'
  /** Custom class name */
  className?: string
  /** Monaco editor options */
  options?: monaco.editor.IStandaloneEditorConstructionOptions
}
```

**Usage:**
```tsx
<SimpleCodeEditor
  content="console.log('Hello')"
  language="typescript"
  onChange={handleContentChange}
  theme="vs-dark"
  className="h-96"
/>
```

### FileTree

File system navigation component.

```typescript
interface FileTreeProps {
  /** Custom class name */
  className?: string
  /** Show file toolbar */
  showToolbar?: boolean
  /** File selection handler */
  onFileSelect?: (fileId: string) => void
  /** File context menu handler */
  onContextMenu?: (fileId: string, event: React.MouseEvent) => void
}
```

### Tabs

Tab management component for open files.

```typescript
interface TabsProps {
  /** Custom class name */
  className?: string
  /** Tab close handler */
  onTabClose?: (fileId: string) => void
  /** Tab reorder handler */
  onTabReorder?: (fromIndex: number, toIndex: number) => void
}
```

### EditorArea

Monaco Editor integration component.

```typescript
interface EditorAreaProps {
  /** Editor theme */
  theme?: 'vs-dark' | 'vs-light'
  /** Custom class name */
  className?: string
  /** Editor ready handler */
  onEditorReady?: (editor: monaco.editor.IStandaloneCodeEditor) => void
}
```

## Hooks

### useKeyboardShortcuts

Provides keyboard shortcut functionality.

```typescript
function useKeyboardShortcuts(): void
```

**Supported Shortcuts:**
- `Ctrl/Cmd + S`: Save current file
- `Ctrl/Cmd + W`: Close current tab
- `Ctrl/Cmd + Tab`: Next tab
- `Ctrl/Cmd + Shift + Tab`: Previous tab
- `Ctrl/Cmd + 1-9`: Switch to tab by index
- `F2`: Rename file
- `Alt + Shift + F`: Format document

### useMultiFileEditorStore

Access to the global editor state store.

```typescript
function useMultiFileEditorStore(): MultiFileEditorState
```

## Types

### FileModel

Represents a file or directory in the editor.

```typescript
interface FileModel {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Full path */
  path: string
  /** File content */
  content: string
  /** Programming language */
  language: SupportedLanguage
  /** File or directory */
  type: FileType
  /** Child files (for directories) */
  children?: FileModel[]
  /** Parent directory ID */
  parent?: string
}
```

### FileType

Enumeration for file types.

```typescript
enum FileType {
  File = "file",
  Directory = "directory"
}
```

### SupportedLanguage

Supported programming languages.

```typescript
type SupportedLanguage = "typescript" | "typescriptreact" | ""
```

### MultiFileEditorState

Complete editor state interface.

```typescript
interface MultiFileEditorState {
  // State
  files: FileModel[]
  openFiles: string[]
  activeFileId: string | null
  fileModels: Record<string, monaco.editor.ITextModel>

  // File management
  setFiles: (files: FileModel[]) => void
  addFile: (file: FileModel) => void
  removeFile: (fileId: string) => void
  updateFileContent: (fileId: string, content: string) => void
  renameFile: (fileId: string, newName: string) => void
  moveFile: (fileId: string, newParentId: string) => void

  // Tab management
  setOpenFiles: (fileIds: string[]) => void
  openFile: (fileId: string) => void
  closeFile: (fileId: string) => void
  setActiveFileId: (fileId: string | null) => void

  // Model management
  setFileModel: (fileId: string, model: monaco.editor.ITextModel) => void
  getFileModel: (fileId: string) => monaco.editor.ITextModel | undefined
}
```

## Store

### useMultiFileEditorStore

Zustand store for managing editor state.

**File Operations:**
```typescript
const { addFile, removeFile, updateFileContent, renameFile } = useMultiFileEditorStore()

// Add a new file
addFile({
  id: 'new-file',
  name: 'new.ts',
  path: 'new.ts',
  content: '',
  language: 'typescript',
  type: FileType.File
})

// Update file content
updateFileContent('file-id', 'new content')

// Rename file
renameFile('file-id', 'renamed.ts')

// Remove file
removeFile('file-id')
```

**Tab Operations:**
```typescript
const { openFile, closeFile, setActiveFileId } = useMultiFileEditorStore()

// Open a file
openFile('file-id')

// Close a file
closeFile('file-id')

// Set active file
setActiveFileId('file-id')
```

**Model Operations:**
```typescript
const { setFileModel, getFileModel } = useMultiFileEditorStore()

// Set Monaco model for a file
setFileModel('file-id', monacoModel)

// Get Monaco model for a file
const model = getFileModel('file-id')
```

## Utilities

### getLanguageFromPath

Determines language from file path.

```typescript
function getLanguageFromPath(filePath: string): SupportedLanguage
```

**Examples:**
```typescript
getLanguageFromPath('file.ts')    // 'typescript'
getLanguageFromPath('file.tsx')   // 'typescriptreact'
getLanguageFromPath('file.js')    // 'typescript' (fallback)
```

### createModelSafely

Safe Monaco model creation with error handling.

```typescript
function createModelSafely(
  content: string,
  language: string,
  uri: monaco.Uri
): monaco.editor.ITextModel
```

### setupMonacoEnvironment

Initializes Monaco Editor environment.

```typescript
function setupMonacoEnvironment(): Promise<typeof monaco>
```

## Plugin APIs

### Plugin Interface

Base interface for all plugins.

```typescript
interface Plugin {
  name: string
  version: string
  initialize(): Promise<void>
  dispose(): void
  isEnabled(): boolean
  enable(): void
  disable(): void
}
```

### PluginManager

Manages plugin lifecycle.

```typescript
class PluginManager {
  async initialize(): Promise<void>
  dispose(): void
  getPlugin(name: string): Plugin | undefined
  getAllPlugins(): Plugin[]
  isInitialized(): boolean
}
```

**Usage:**
```typescript
import { getPluginManager } from '@eidos.space/code-editor'

const pluginManager = getPluginManager()
const esmPlugin = pluginManager.getPlugin('esm-import-resolver')

if (esmPlugin) {
  console.log('ESM plugin enabled:', esmPlugin.isEnabled())
}
```

### ESM Import Resolver Plugin

Provides intelligent import resolution.

```typescript
class ESMImportResolverPlugin implements Plugin {
  setupModelListeners(model: monaco.editor.ITextModel): void
}
```

**Features:**
- Import auto-completion
- Hover information for packages
- Type definition fetching
- Code actions for import resolution

### Language Providers

Monaco language service providers.

**Completion Provider:**
```typescript
monaco.languages.registerCompletionItemProvider('typescript', {
  triggerCharacters: ['.', '"', "'"],
  provideCompletionItems: async (model, position) => {
    // Return completion suggestions
  }
})
```

**Hover Provider:**
```typescript
monaco.languages.registerHoverProvider('typescript', {
  provideHover: async (model, position) => {
    // Return hover information
  }
})
```

**Code Action Provider:**
```typescript
monaco.languages.registerCodeActionProvider('typescript', {
  provideCodeActions: async (model, range, context) => {
    // Return code actions
  }
})
```
