/**
 * Editor Area Plugin Usage Examples
 * 展示如何使用编辑器区域插件，就像 Lexical 的 RichTextPlugin 一样
 */

import React, { useState } from 'react'
import { 
  SimpleCodeEditor,
  EditorAreaPlugin,
  ESMImportResolverPlugin,
  TailwindCSSPlugin,
  type FileModel
} from '../src/index'

// 示例 1: 基础编辑器区域插件使用
export const BasicEditorAreaExample: React.FC = () => {
  const [currentFile] = useState<FileModel>({
    id: 'main',
    name: 'main.ts',
    path: 'main.ts',
    content: `// 基础编辑器区域插件示例
import React from 'react'

export function HelloWorld() {
  return <div>Hello, Pluggable World!</div>
}`,
    language: 'typescript',
    type: 0 // FileType.File
  })

  return (
    <div className="h-96 w-full border rounded">
      <h2 className="text-lg font-semibold mb-4">基础编辑器区域插件</h2>
      
      <SimpleCodeEditor>
        {/* 编辑器区域现在是一个插件！ */}
        <EditorAreaPlugin
          enabled={true}
          currentFile={currentFile}
          theme="light"
          onSave={(fileId, code) => {
            console.log(`Saved ${fileId}:`, code)
          }}
          onChange={(fileId, code) => {
            console.log(`Changed ${fileId}:`, code.length, 'characters')
          }}
        />
        
        {/* 其他插件 */}
        <ESMImportResolverPlugin enabled={true} />
        <TailwindCSSPlugin enabled={true} />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 2: 自定义编辑器配置
export const CustomizedEditorExample: React.FC = () => {
  const [currentFile] = useState<FileModel>({
    id: 'custom',
    name: 'custom.ts',
    path: 'custom.ts',
    content: `// 自定义编辑器配置示例
// 这个编辑器有自定义的字体大小、主题和选项

interface CustomConfig {
  fontSize: number
  theme: 'dark' | 'light'
  showMinimap: boolean
}

const config: CustomConfig = {
  fontSize: 16,
  theme: 'dark',
  showMinimap: false
}

export default config`,
    language: 'typescript',
    type: 0
  })

  return (
    <div className="h-96 w-full border rounded">
      <h2 className="text-lg font-semibold mb-4">自定义编辑器配置</h2>
      
      <SimpleCodeEditor>
        <EditorAreaPlugin
          enabled={true}
          currentFile={currentFile}
          theme="vs-dark"
          editorOptions={{
            fontSize: 16,
            minimap: { enabled: false },
            wordWrap: 'on',
            lineNumbers: 'on',
            folding: true,
            renderWhitespace: 'boundary',
            tabSize: 4,
            insertSpaces: true
          }}
          showDebugInfo={true}
          onSave={(fileId, code) => {
            console.log(`Custom editor saved ${fileId}`)
          }}
        />
        
        <ESMImportResolverPlugin enabled={true} />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 3: Diff 模式编辑器
export const DiffEditorExample: React.FC = () => {
  const [currentFile] = useState<FileModel>({
    id: 'diff',
    name: 'diff.ts',
    path: 'diff.ts',
    content: `// 原始代码
function oldFunction() {
  console.log('This is the old version')
  return 'old'
}`,
    language: 'typescript',
    type: 0
  })

  const diffCode = `// 修改后的代码
function newFunction() {
  console.log('This is the new version')
  console.log('Added new functionality')
  return 'new'
}`

  return (
    <div className="h-96 w-full border rounded">
      <h2 className="text-lg font-semibold mb-4">Diff 模式编辑器</h2>
      
      <SimpleCodeEditor>
        <EditorAreaPlugin
          enabled={true}
          currentFile={currentFile}
          diffCode={diffCode}
          theme="light"
          editorOptions={{
            readOnly: false,
            minimap: { enabled: false }
          }}
          onSave={(fileId, code) => {
            console.log(`Diff editor saved ${fileId}`)
          }}
        />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 4: 多文件编辑器（带依赖）
export const MultiFileEditorExample: React.FC = () => {
  const [currentFileId, setCurrentFileId] = useState('main')
  
  const files: FileModel[] = [
    {
      id: 'main',
      name: 'main.ts',
      path: 'main.ts',
      content: `import { utils } from './utils'
import { constants } from './constants'

export function main() {
  console.log(constants.APP_NAME)
  return utils.formatMessage('Hello World')
}`,
      language: 'typescript',
      type: 0
    },
    {
      id: 'utils',
      name: 'utils.ts',
      path: 'utils.ts',
      content: `export const utils = {
  formatMessage(msg: string): string {
    return \`[APP] \${msg}\`
  },
  
  getCurrentTime(): Date {
    return new Date()
  }
}`,
      language: 'typescript',
      type: 0
    },
    {
      id: 'constants',
      name: 'constants.ts',
      path: 'constants.ts',
      content: `export const constants = {
  APP_NAME: 'Pluggable Editor',
  VERSION: '1.0.0',
  DEBUG: true
}`,
      language: 'typescript',
      type: 0
    }
  ]

  const currentFile = files.find(f => f.id === currentFileId) || files[0]
  const dependencies = files.filter(f => f.id !== currentFileId)

  return (
    <div className="h-96 w-full border rounded">
      <h2 className="text-lg font-semibold mb-4">多文件编辑器（带依赖）</h2>
      
      {/* 文件选择器 */}
      <div className="mb-2 flex gap-2">
        {files.map(file => (
          <button
            key={file.id}
            onClick={() => setCurrentFileId(file.id)}
            className={`px-3 py-1 rounded text-sm ${
              currentFileId === file.id 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {file.name}
          </button>
        ))}
      </div>
      
      <SimpleCodeEditor>
        <EditorAreaPlugin
          enabled={true}
          currentFile={currentFile}
          dependencies={dependencies}
          theme="light"
          onSave={(fileId, code) => {
            console.log(`Multi-file editor saved ${fileId}`)
          }}
          onFileJump={(fileId) => {
            console.log(`Jump to file: ${fileId}`)
            setCurrentFileId(fileId)
          }}
          editorOptions={{
            minimap: { enabled: true },
            fontSize: 14
          }}
        />
        
        <ESMImportResolverPlugin 
          enabled={true}
          enableAutoTypeResolution={true}
        />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 5: 条件渲染编辑器
export const ConditionalEditorExample: React.FC = () => {
  const [showEditor, setShowEditor] = useState(true)
  const [editorMode, setEditorMode] = useState<'code' | 'preview'>('code')
  
  const [currentFile] = useState<FileModel>({
    id: 'conditional',
    name: 'conditional.tsx',
    path: 'conditional.tsx',
    content: `import React from 'react'

export const ConditionalComponent: React.FC = () => {
  return (
    <div className="p-4 bg-blue-100 rounded">
      <h1>条件渲染示例</h1>
      <p>这个编辑器可以被动态启用/禁用</p>
    </div>
  )
}`,
    language: 'typescript',
    type: 0
  })

  return (
    <div className="h-96 w-full border rounded">
      <h2 className="text-lg font-semibold mb-4">条件渲染编辑器</h2>
      
      {/* 控制面板 */}
      <div className="mb-2 flex gap-4 items-center">
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={showEditor}
            onChange={(e) => setShowEditor(e.target.checked)}
          />
          显示编辑器
        </label>
        
        <div className="flex gap-2">
          <button
            onClick={() => setEditorMode('code')}
            className={`px-3 py-1 rounded text-sm ${
              editorMode === 'code' ? 'bg-green-500 text-white' : 'bg-gray-200'
            }`}
          >
            代码模式
          </button>
          <button
            onClick={() => setEditorMode('preview')}
            className={`px-3 py-1 rounded text-sm ${
              editorMode === 'preview' ? 'bg-green-500 text-white' : 'bg-gray-200'
            }`}
          >
            预览模式
          </button>
        </div>
      </div>
      
      <SimpleCodeEditor>
        {/* 编辑器插件可以被条件性启用/禁用 */}
        <EditorAreaPlugin
          enabled={showEditor && editorMode === 'code'}
          currentFile={currentFile}
          theme="light"
          onSave={(fileId, code) => {
            console.log(`Conditional editor saved ${fileId}`)
          }}
        />
        
        {/* 其他插件也可以条件性启用 */}
        <ESMImportResolverPlugin enabled={showEditor} />
        <TailwindCSSPlugin enabled={showEditor} />
      </SimpleCodeEditor>
      
      {/* 预览模式 */}
      {editorMode === 'preview' && (
        <div className="h-full bg-gray-50 p-4 flex items-center justify-center">
          <div className="text-center text-gray-600">
            <h3 className="text-lg font-medium">预览模式</h3>
            <p className="mt-2">这里可以显示代码的预览结果</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default BasicEditorAreaExample