import React from 'react'
import { 
  SimpleCodeEditor, 
  ESMImportResolverPlugin,
  AutocompletionPlugin,
  FormatterPlugin,
  type ESMImportResolverProps
} from '@/packages/code-editor/src'

// Example 1: Basic usage with ESM plugin enabled
export const BasicEditorExample: React.FC = () => {
  const [code, setCode] = React.useState(`
import { useState } from "react";
import lodash from "lodash";

export function Example() {
  const [count, setCount] = useState(0);
  return <div>Count: {count}</div>;
}
`)

  return (
    <div style={{ height: '400px', width: '100%' }}>
      <SimpleCodeEditor
        initialCode={code}
        onChange={setCode}
        theme="light"
        fileName="example.tsx"
      >
        {/* Enable ESM Import Resolver Plugin */}
        <ESMImportResolverPlugin
          enableAutoTypeResolution={true}
          packageWhitelist={['react', 'lodash']}
          customImportSuggestions={[
            {
              label: 'my-custom-lib',
              insertText: './my-custom-lib',
              detail: 'My custom library'
            }
          ]}
        />
      </SimpleCodeEditor>
    </div>
  )
}

// Example 2: Editor with multiple plugins configured
export const AdvancedEditorExample: React.FC = () => {
  const [code, setCode] = React.useState(`
// TypeScript example with advanced features
type User = {
  id: number;
  name: string;
};

const users: User[] = [];
`)

  const customImportSuggestions = [
    {
      label: 'axios',
      insertText: 'axios',
      detail: 'HTTP client',
      documentation: 'Promise based HTTP client for the browser and node.js'
    },
    {
      label: '@types/node',
      insertText: '@types/node', 
      detail: 'Node.js type definitions'
    }
  ]

  return (
    <div style={{ height: '500px', width: '100%' }}>
      <SimpleCodeEditor
        initialCode={code}
        onChange={setCode}
        theme="vs-dark"
        fileName="advanced.ts"
      >
        {/* ESM Import Resolver with custom configuration */}
        <ESMImportResolverPlugin
          enableAutoTypeResolution={true}
          esmServerUrl="https://cdn.skypack.dev"
          packageBlacklist={['dangerous-package']}
          customImportSuggestions={customImportSuggestions}
        />
        
        {/* Future plugins (not yet implemented but ready for use) */}
        <AutocompletionPlugin
          enabled={true}
          suggestions={['console.log', 'console.error', 'console.warn']}
          triggerCharacters={['.']}
        />
        
        <FormatterPlugin
          enabled={true}
          formatOnSave={true}
          formatOnType={false}
        />
      </SimpleCodeEditor>
    </div>
  )
}

// Example 3: Minimal editor without any plugins
export const MinimalEditorExample: React.FC = () => {
  const [code, setCode] = React.useState('// No plugins enabled')

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <SimpleCodeEditor
        initialCode={code}
        onChange={setCode}
        theme="light"
        fileName="minimal.js"
      >
        {/* No plugins - editor works with basic functionality only */}
      </SimpleCodeEditor>
    </div>
  )
}

// Example 4: Dynamic plugin configuration
export const DynamicPluginExample: React.FC = () => {
  const [code, setCode] = React.useState('import React from "react";')
  const [enableESM, setEnableESM] = React.useState(true)
  const [enableAutoComplete, setEnableAutoComplete] = React.useState(false)

  return (
    <div>
      <div style={{ marginBottom: '10px' }}>
        <label>
          <input 
            type="checkbox" 
            checked={enableESM} 
            onChange={(e) => setEnableESM(e.target.checked)}
          />
          Enable ESM Import Resolver
        </label>
        <label style={{ marginLeft: '20px' }}>
          <input 
            type="checkbox" 
            checked={enableAutoComplete} 
            onChange={(e) => setEnableAutoComplete(e.target.checked)}
          />
          Enable Autocompletion
        </label>
      </div>
      
      <div style={{ height: '400px', width: '100%' }}>
        <SimpleCodeEditor
          initialCode={code}
          onChange={setCode}
          theme="light"
          fileName="dynamic.tsx"
        >
          {/* Conditionally render plugins based on state */}
          {enableESM && (
            <ESMImportResolverPlugin
              enableAutoTypeResolution={true}
            />
          )}
          
          {enableAutoComplete && (
            <AutocompletionPlugin
              enabled={true}
              suggestions={['React.useState', 'React.useEffect']}
            />
          )}
        </SimpleCodeEditor>
      </div>
    </div>
  )
}

export default {
  BasicEditorExample,
  AdvancedEditorExample,
  MinimalEditorExample,
  DynamicPluginExample
}