/**
 * 解耦插件系统使用示例
 * 展示如何使用新的解耦插件组件系统
 */

import React from 'react'
import { 
  SimpleCodeEditor,
  ESMImportResolverPlugin,
  TailwindCSSPlugin,
  ExamplePlugin
} from '../src/index'

// 示例 1: 使用具体插件组件（推荐方式）
export const DecoupledPluginExample: React.FC = () => {
  const initialCode = `
import React from 'react'
import { useState } from 'react'

export function MyComponent() {
  const [count, setCount] = useState(0)
  
  return (
    <div className="p-4 bg-blue-500 text-white">
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  )
}
`

  const customImportSuggestions = [
    {
      label: 'my-custom-lib',
      insertText: 'my-custom-lib',
      detail: 'Custom Library',
      documentation: 'My awesome custom library'
    }
  ]

  return (
    <div className="h-96 w-full">
      <h2 className="text-lg font-semibold mb-4">解耦插件系统示例</h2>
      
      <SimpleCodeEditor 
        initialCode={initialCode}
        language="typescript"
        theme="light"
      >
        {/* ESM 导入解析插件 */}
        <ESMImportResolverPlugin
          enabled={true}
          enableAutoTypeResolution={true}
          esmServerUrl="https://esm.sh"
          customImportSuggestions={customImportSuggestions}
          packageWhitelist={['react', 'lodash', 'axios']}
        />
        
        {/* TailwindCSS 自动补全插件 */}
        <TailwindCSSPlugin
          enabled={true}
          customClasses={['btn', 'card', 'hero']}
          tailwindConfig={{
            theme: {
              colors: {
                primary: '#3B82F6',
                secondary: '#10B981'
              }
            }
          }}
        />
        
        {/* 示例插件 */}
        <ExamplePlugin
          enabled={true}
          customMessage="Hello from decoupled system!"
          triggerKey="demo"
        />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 2: 最小化配置（使用默认设置）
export const MinimalPluginExample: React.FC = () => {
  return (
    <div className="h-96 w-full">
      <h2 className="text-lg font-semibold mb-4">最小化配置示例</h2>
      
      <SimpleCodeEditor 
        initialCode="// 输入 'react' 试试自动补全\nimport "
        language="typescript"
      >
        {/* 只启用 ESM 插件，使用默认配置 */}
        <ESMImportResolverPlugin />
      </SimpleCodeEditor>
    </div>
  )
}

// 示例 3: 无插件组件（向后兼容）
export const BackwardCompatibleExample: React.FC = () => {
  return (
    <div className="h-96 w-full">
      <h2 className="text-lg font-semibold mb-4">向后兼容示例</h2>
      
      {/* 不使用任何插件组件，系统会自动启用默认的 ESM 解析器 */}
      <SimpleCodeEditor 
        initialCode="import React from 'react'"
        language="typescript"
        customImportSuggestions={[
          {
            label: 'legacy-lib',
            insertText: 'legacy-lib',
            detail: 'Legacy Library'
          }
        ]}
      />
    </div>
  )
}

// 示例 4: 程序化插件管理
export const ProgrammaticPluginExample: React.FC = () => {
  const [pluginsEnabled, setPluginsEnabled] = React.useState({
    esm: true,
    tailwind: true,
    example: false
  })

  return (
    <div className="h-96 w-full">
      <h2 className="text-lg font-semibold mb-4">程序化插件管理</h2>
      
      {/* 插件控制面板 */}
      <div className="mb-4 space-x-4">
        <label>
          <input 
            type="checkbox" 
            checked={pluginsEnabled.esm}
            onChange={(e) => setPluginsEnabled(prev => ({ ...prev, esm: e.target.checked }))}
          />
          ESM 解析器
        </label>
        <label>
          <input 
            type="checkbox" 
            checked={pluginsEnabled.tailwind}
            onChange={(e) => setPluginsEnabled(prev => ({ ...prev, tailwind: e.target.checked }))}
          />
          TailwindCSS
        </label>
        <label>
          <input 
            type="checkbox" 
            checked={pluginsEnabled.example}
            onChange={(e) => setPluginsEnabled(prev => ({ ...prev, example: e.target.checked }))}
          />
          示例插件
        </label>
      </div>
      
      <SimpleCodeEditor 
        initialCode="// 动态切换插件试试\nimport React from 'react'"
        language="typescript"
      >
        {/* 根据状态动态启用插件 */}
        {pluginsEnabled.esm && <ESMImportResolverPlugin />}
        {pluginsEnabled.tailwind && <TailwindCSSPlugin />}
        {pluginsEnabled.example && (
          <ExamplePlugin 
            customMessage="动态启用的插件！"
            triggerKey="dynamic"
          />
        )}
      </SimpleCodeEditor>
    </div>
  )
}

export default DecoupledPluginExample