/**
 * Updated Code Editor Usage Examples
 * 展示修改后的 SimpleCodeEditor 如何使用插件化的编辑器区域
 */

import React, { useState } from 'react'
import { 
  SimpleCodeEditor,
  EditorAreaPlugin,
  ESMImportResolverPlugin,
  TailwindCSSPlugin
} from '../src/index'

// 示例 1: 基础用法 - 必须显式提供 EditorAreaPlugin
export const BasicUsageExample: React.FC = () => {
  const [code, setCode] = useState(`// 基础用法示例
// 现在必须显式提供 EditorAreaPlugin，就像 LexicalComposer 一样

import React from 'react'

export function BasicComponent() {
  return <div>显式插件架构</div>
}`)

  const currentFile = {
    id: 'basic',
    name: 'basic.ts',
    path: 'basic.ts',
    content: code,
    language: 'typescript' as const,
    type: 0 // FileType.File
  }

  return (
    <div className="h-96 w-full border rounded p-4">
      <h2 className="text-lg font-semibold mb-4">基础用法示例</h2>
      
      {/* 现在必须显式提供 EditorAreaPlugin！ */}
      <SimpleCodeEditor>
        <EditorAreaPlugin
          enabled={true}
          currentFile={currentFile}
          theme="light"
          onChange={(fileId, code) => setCode(code)}
          onSave={(fileId, code) => console.log('Saved:', code)}
        />
        <ESMImportResolverPlugin enabled={true} />
        <TailwindCSSPlugin enabled={true} />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 2: 高级配置编辑器
export const AdvancedConfigExample: React.FC = () => {
  const [code, setCode] = useState(`// 高级配置示例
import React from 'react'

export function AdvancedComponent() {
  return <div>高级编辑器配置</div>
}`)

  const currentFile = {
    id: 'advanced',
    name: 'advanced.ts',
    path: 'advanced.ts',
    content: code,
    language: 'typescript' as const,
    type: 0
  }

  return (
    <div className="h-96 w-full border rounded p-4">
      <h2 className="text-lg font-semibold mb-4">高级配置编辑器</h2>
      
      <SimpleCodeEditor>
        {/* 高级配置的编辑器区域插件 */}
        <EditorAreaPlugin
          enabled={true}
          currentFile={currentFile}
          theme="vs-dark"
          editorOptions={{
            fontSize: 16,
            minimap: { enabled: false },
            wordWrap: 'on',
            lineNumbers: 'relative',
            folding: true,
            renderWhitespace: 'boundary'
          }}
          showDebugInfo={true}
          onChange={(fileId, code) => setCode(code)}
          onSave={(fileId, code) => console.log('Advanced editor saved:', code)}
        />
        
        {/* 其他插件 */}
        <ESMImportResolverPlugin enabled={true} />
        <TailwindCSSPlugin enabled={true} />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 3: 条件性编辑器区域
export const ConditionalEditorAreaExample: React.FC = () => {
  const [showEditor, setShowEditor] = useState(true)
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple')
  
  const [code, setCode] = useState(`// 条件性编辑器区域示例
export function ConditionalExample() {
  return <div>可以动态切换编辑器模式</div>
}`)

  const currentFile = {
    id: 'conditional',
    name: 'conditional.ts',
    path: 'conditional.ts',
    content: code,
    language: 'typescript' as const,
    type: 0
  }

  return (
    <div className="h-96 w-full border rounded p-4">
      <h2 className="text-lg font-semibold mb-4">条件性编辑器区域</h2>
      
      {/* 控制面板 */}
      <div className="mb-4 flex gap-4 items-center">
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
            onClick={() => setEditorMode('simple')}
            className={`px-3 py-1 rounded text-sm ${
              editorMode === 'simple' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}
          >
            简单模式
          </button>
          <button
            onClick={() => setEditorMode('advanced')}
            className={`px-3 py-1 rounded text-sm ${
              editorMode === 'advanced' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}
          >
            高级模式
          </button>
        </div>
      </div>
      
      <SimpleCodeEditor>
        {/* 条件性渲染编辑器区域插件 */}
        <EditorAreaPlugin
          enabled={showEditor}
          currentFile={currentFile}
          theme={editorMode === 'advanced' ? 'vs-dark' : 'light'}
          editorOptions={{
            fontSize: editorMode === 'advanced' ? 16 : 14,
            minimap: { enabled: editorMode === 'advanced' },
            wordWrap: 'on',
            lineNumbers: editorMode === 'advanced' ? 'on' : 'off',
            folding: editorMode === 'advanced'
          }}
          showDebugInfo={editorMode === 'advanced'}
          onChange={(fileId, code) => setCode(code)}
          onSave={(fileId, code) => console.log('Conditional editor saved:', code)}
        />
        
        {/* 插件也可以条件性启用 */}
        <ESMImportResolverPlugin enabled={showEditor && editorMode === 'advanced'} />
        <TailwindCSSPlugin enabled={showEditor} />
      </SimpleCodeEditor>
      
      {/* 当编辑器被禁用时显示占位符 */}
      {!showEditor && (
        <div className="h-full bg-gray-100 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg">编辑器已禁用</p>
            <p className="text-sm mt-2">勾选"显示编辑器"来启用</p>
          </div>
        </div>
      )}
    </div>
  )
}

// 示例 4: 多编辑器布局
export const MultiEditorLayoutExample: React.FC = () => {
  const [leftCode, setLeftCode] = useState(`// 左侧编辑器
export const LeftComponent = () => {
  return <div>左侧内容</div>
}`)

  const [rightCode, setRightCode] = useState(`// 右侧编辑器
export const RightComponent = () => {
  return <div>右侧内容</div>
}`)

  const leftFile = {
    id: 'left',
    name: 'left.tsx',
    path: 'left.tsx',
    content: leftCode,
    language: 'typescript' as const,
    type: 0
  }

  const rightFile = {
    id: 'right',
    name: 'right.tsx',
    path: 'right.tsx',
    content: rightCode,
    language: 'typescript' as const,
    type: 0
  }

  return (
    <div className="h-96 w-full border rounded p-4">
      <h2 className="text-lg font-semibold mb-4">多编辑器布局示例</h2>
      
      <div className="flex gap-4 h-full">
        {/* 左侧编辑器 */}
        <div className="flex-1">
          <h3 className="text-sm font-medium mb-2">左侧编辑器</h3>
          <SimpleCodeEditor>
            <EditorAreaPlugin
              enabled={true}
              currentFile={leftFile}
              theme="light"
              editorOptions={{ fontSize: 12 }}
              onChange={(fileId, code) => setLeftCode(code)}
              onSave={(fileId, code) => console.log('Left editor saved:', code)}
            />
            <ESMImportResolverPlugin enabled={true} />
          </SimpleCodeEditor>
        </div>
        
        {/* 右侧编辑器 */}
        <div className="flex-1">
          <h3 className="text-sm font-medium mb-2">右侧编辑器</h3>
          <SimpleCodeEditor>
            <EditorAreaPlugin
              enabled={true}
              currentFile={rightFile}
              theme="vs-dark"
              editorOptions={{ fontSize: 12 }}
              onChange={(fileId, code) => setRightCode(code)}
              onSave={(fileId, code) => console.log('Right editor saved:', code)}
            />
            <TailwindCSSPlugin enabled={true} />
          </SimpleCodeEditor>
        </div>
      </div>
    </div>
  )
}

// 示例 5: 自定义编辑器替换（概念验证）
export const CustomEditorReplacementExample: React.FC = () => {
  const [useCustomEditor, setUseCustomEditor] = useState(false)
  const [code, setCode] = useState(`// 自定义编辑器替换示例
// 可以完全替换编辑器区域为自定义实现`)

  // 简单的自定义编辑器组件
  const CustomTextEditor: React.FC<{ value: string; onChange: (value: string) => void }> = ({ 
    value, 
    onChange 
  }) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-full p-4 font-mono text-sm border rounded resize-none"
      placeholder="自定义文本编辑器..."
    />
  )

  return (
    <div className="h-96 w-full border rounded p-4">
      <h2 className="text-lg font-semibold mb-4">自定义编辑器替换示例</h2>
      
      <div className="mb-4">
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={useCustomEditor}
            onChange={(e) => setUseCustomEditor(e.target.checked)}
          />
          使用自定义编辑器替换 Monaco
        </label>
      </div>
      
      <SimpleCodeEditor
        initialCode={code}
        onChange={setCode}
      >
        {/* 条件性渲染：Monaco 编辑器区域插件 或 自定义编辑器 */}
        {!useCustomEditor ? (
          <EditorAreaPlugin
            enabled={true}
            theme="light"
            editorOptions={{ fontSize: 14 }}
          />
        ) : (
          // 这里展示了如何完全替换编辑器区域
          // 注意：这只是概念验证，实际实现需要更复杂的集成
          <CustomTextEditor value={code} onChange={setCode} />
        )}
        
        {/* 其他插件只在使用 Monaco 时有效 */}
        <ESMImportResolverPlugin enabled={!useCustomEditor} />
        <TailwindCSSPlugin enabled={!useCustomEditor} />
      </SimpleCodeEditor>
    </div>
  )
}

export default BackwardCompatibleExample