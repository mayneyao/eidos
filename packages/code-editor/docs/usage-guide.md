# Usage Guide and Examples

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Basic Usage](#basic-usage)
- [Advanced Configuration](#advanced-configuration)
- [File Management](#file-management)
- [Plugin Configuration](#plugin-configuration)
- [Integration Examples](#integration-examples)

## Quick Start

### Installation

```bash
# Install the package
pnpm add @eidos.space/code-editor

# Peer dependencies (if not already installed)
pnpm add react monaco-editor @monaco-editor/react
```

### Basic Setup

```tsx
import React from 'react'
import { MultiFileEditor, FileType, type FileModel } from '@eidos.space/code-editor'

const files: FileModel[] = [
  {
    id: 'main',
    name: 'main.ts',
    path: 'main.ts',
    content: `console.log('Hello, World!')`,
    language: 'typescript',
    type: FileType.File
  }
]

function App() {
  return (
    <div className="w-full h-screen">
      <MultiFileEditor
        initialFiles={files}
        initialOpenFiles={['main']}
        initialActiveFileId="main"
      />
    </div>
  )
}
```

## Basic Usage

### File Structure Example

```tsx
const projectFiles: FileModel[] = [
  // Root files
  {
    id: 'package-json',
    name: 'package.json',
    path: 'package.json',
    content: JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      dependencies: {
        react: '^18.0.0'
      }
    }, null, 2),
    language: 'json',
    type: FileType.File
  },
  
  // Source directory
  {
    id: 'src-dir',
    name: 'src',
    path: 'src',
    content: '',
    language: '',
    type: FileType.Directory,
    children: []
  },
  
  // Source files
  {
    id: 'index-ts',
    name: 'index.ts',
    path: 'src/index.ts',
    content: `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const root = createRoot(document.getElementById('root')!)
root.render(<App />)`,
    language: 'typescript',
    type: FileType.File,
    parent: 'src-dir'
  },
  
  {
    id: 'app-tsx',
    name: 'App.tsx',
    path: 'src/App.tsx',
    content: `import React from 'react'

export default function App() {
  return (
    <div className="app">
      <h1>Hello, React!</h1>
    </div>
  )
}`,
    language: 'typescriptreact',
    type: FileType.File,
    parent: 'src-dir'
  }
]
```

### Component Integration

```tsx
import React, { useState, useCallback } from 'react'
import { MultiFileEditor, type FileModel } from '@eidos.space/code-editor'

function CodeEditorPage() {
  const [files, setFiles] = useState<FileModel[]>(projectFiles)
  const [openFiles, setOpenFiles] = useState<string[]>(['index-ts'])
  const [activeFile, setActiveFile] = useState<string>('index-ts')

  const handleFileChange = useCallback((fileId: string, content: string) => {
    setFiles(prev => prev.map(file => 
      file.id === fileId ? { ...file, content } : file
    ))
  }, [])

  const handleSave = useCallback(() => {
    console.log('Saving files...', files)
    // Implement your save logic here
  }, [files])

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 text-white p-4">
        <h1>Code Editor</h1>
        <button 
          onClick={handleSave}
          className="bg-blue-500 px-4 py-2 rounded"
        >
          Save All
        </button>
      </header>
      
      <div className="flex-1">
        <MultiFileEditor
          initialFiles={files}
          initialOpenFiles={openFiles}
          initialActiveFileId={activeFile}
          className="w-full h-full"
        />
      </div>
    </div>
  )
}
```

## Advanced Configuration

### Custom Theme and Options

```tsx
import { MultiFileEditor } from '@eidos.space/code-editor'

function CustomEditor() {
  return (
    <MultiFileEditor
      initialFiles={files}
      initialOpenFiles={['main']}
      initialActiveFileId="main"
      autoInitialize={true}
      className="custom-editor-container"
    />
  )
}

// Custom CSS for styling
const customStyles = `
.custom-editor-container {
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
}

.custom-editor-container .monaco-editor {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}
`
```

### Plugin Configuration

```tsx
import { getPluginManager } from '@eidos.space/code-editor'

// Configure plugins before editor initialization
const pluginManager = getPluginManager()

// Configure ESM resolver
const esmPlugin = pluginManager.getPlugin('esm-import-resolver')
if (esmPlugin) {
  // Plugin is automatically configured, but you can access it if needed
  console.log('ESM plugin enabled:', esmPlugin.isEnabled())
}
```

## File Management

### Dynamic File Operations

```tsx
import React from 'react'
import { useMultiFileEditorStore, FileType } from '@eidos.space/code-editor'

function FileManager() {
  const {
    files,
    addFile,
    removeFile,
    updateFileContent,
    renameFile,
    openFile,
    closeFile
  } = useMultiFileEditorStore()

  const createNewFile = () => {
    const newFile = {
      id: `file-${Date.now()}`,
      name: 'new-file.ts',
      path: 'new-file.ts',
      content: '// New TypeScript file\n',
      language: 'typescript',
      type: FileType.File
    }
    
    addFile(newFile)
    openFile(newFile.id)
  }

  const createNewFolder = () => {
    const newFolder = {
      id: `folder-${Date.now()}`,
      name: 'new-folder',
      path: 'new-folder',
      content: '',
      language: '',
      type: FileType.Directory,
      children: []
    }
    
    addFile(newFolder)
  }

  const deleteFile = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      removeFile(fileId)
    }
  }

  return (
    <div className="file-manager">
      <div className="toolbar">
        <button onClick={createNewFile}>New File</button>
        <button onClick={createNewFolder}>New Folder</button>
      </div>
      
      <div className="file-list">
        {files.map(file => (
          <div key={file.id} className="file-item">
            <span>{file.name}</span>
            <button onClick={() => deleteFile(file.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### File Import/Export

```tsx
import React, { useRef } from 'react'
import { useMultiFileEditorStore, FileType } from '@eidos.space/code-editor'

function FileImportExport() {
  const { files, setFiles } = useMultiFileEditorStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportProject = () => {
    const projectData = {
      files: files,
      metadata: {
        name: 'My Project',
        version: '1.0.0',
        exportedAt: new Date().toISOString()
      }
    }

    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: 'application/json'
    })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'project.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target?.result as string)
        setFiles(projectData.files)
      } catch (error) {
        console.error('Failed to import project:', error)
        alert('Invalid project file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="import-export">
      <button onClick={exportProject}>
        Export Project
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={importProject}
        style={{ display: 'none' }}
      />
      
      <button onClick={() => fileInputRef.current?.click()}>
        Import Project
      </button>
    </div>
  )
}
```

## Plugin Configuration

### ESM Import Resolver Setup

```tsx
import { getPluginManager } from '@eidos.space/code-editor'

// Get the plugin manager instance
const pluginManager = getPluginManager()

// The ESM plugin is automatically initialized with default settings:
// - esmServerUrl: 'https://esm.sh'
// - enableAutoTypeResolution: true
// - packageWhitelist: [] (allow all)
// - packageBlacklist: [] (block none)

// You can check plugin status
const esmPlugin = pluginManager.getPlugin('esm-import-resolver')
console.log('ESM Plugin enabled:', esmPlugin?.isEnabled())
```

### Custom Plugin Development

```tsx
import { Plugin, getPluginManager } from '@eidos.space/code-editor'
import * as monaco from 'monaco-editor'

class CustomFormatterPlugin implements Plugin {
  name = 'Custom Formatter'
  version = '1.0.0'
  private enabled = false

  async initialize(): Promise<void> {
    // Register custom formatter
    monaco.languages.registerDocumentFormattingEditProvider('typescript', {
      provideDocumentFormattingEdits: (model) => {
        // Custom formatting logic
        const content = model.getValue()
        const formatted = this.customFormat(content)
        
        return [{
          range: model.getFullModelRange(),
          text: formatted
        }]
      }
    })

    this.enabled = true
    console.log('Custom formatter plugin initialized')
  }

  dispose(): void {
    this.enabled = false
    console.log('Custom formatter plugin disposed')
  }

  isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    if (!this.enabled) {
      this.initialize()
    }
  }

  disable(): void {
    this.dispose()
  }

  private customFormat(content: string): string {
    // Implement your custom formatting logic
    return content.replace(/;/g, ';\n')
  }
}

// Register the custom plugin
const pluginManager = getPluginManager()
const customPlugin = new CustomFormatterPlugin()
// Note: Plugin registration would need to be added to the plugin manager
```

## Integration Examples

### With React Router

```tsx
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MultiFileEditor } from '@eidos.space/code-editor'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/editor/:projectId" element={<ProjectEditor />} />
      </Routes>
    </BrowserRouter>
  )
}

function ProjectEditor() {
  const { projectId } = useParams()
  const [files, setFiles] = useState<FileModel[]>([])
  
  useEffect(() => {
    // Load project files
    loadProject(projectId).then(setFiles)
  }, [projectId])

  return (
    <div className="h-screen">
      <MultiFileEditor
        initialFiles={files}
        initialOpenFiles={files.slice(0, 3).map(f => f.id)}
        initialActiveFileId={files[0]?.id}
      />
    </div>
  )
}
```

### With State Persistence

```tsx
import React, { useEffect } from 'react'
import { MultiFileEditor, useMultiFileEditorStore } from '@eidos.space/code-editor'

function PersistentEditor() {
  const { files, openFiles, activeFileId, setFiles, setOpenFiles, setActiveFileId } = useMultiFileEditorStore()

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('editor-state')
    if (savedState) {
      const { files, openFiles, activeFileId } = JSON.parse(savedState)
      setFiles(files)
      setOpenFiles(openFiles)
      setActiveFileId(activeFileId)
    }
  }, [])

  // Save state to localStorage on changes
  useEffect(() => {
    const state = { files, openFiles, activeFileId }
    localStorage.setItem('editor-state', JSON.stringify(state))
  }, [files, openFiles, activeFileId])

  return (
    <MultiFileEditor
      autoInitialize={files.length > 0}
      className="w-full h-full"
    />
  )
}
```
