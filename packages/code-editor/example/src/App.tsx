import React, { useState } from "react"

import {
  FileType,
  SimpleCodeEditor,
  type FileModel,
} from "../../src/index"
import aFileContent from "./test-files/a.ts?raw"
import bFileContent from "./test-files/b.ts?raw"
import componentContent from "./test-files/component.tsx?raw"

// Use Vite's ?raw import for test file content
const createFileModel = (
  name: string,
  content: string,
  language: "typescript" = "typescript"
): FileModel => ({
  id: name,
  name,
  path: name,
  content,
  language,
  type: FileType.File,
})

const testFiles: FileModel[] = [
  createFileModel("a.ts", aFileContent),
  createFileModel("b.ts", bFileContent),
  createFileModel("component.tsx", componentContent, "typescript"),
  createFileModel(
    "utils.ts",
    `// Utility functions file
  export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }

  export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout
    return (...args: Parameters<T>) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }

  export interface ApiResponse<T> {
    data: T
    status: number
    message: string
  }

  export class Logger {
    private prefix: string

    constructor(prefix: string) {
      this.prefix = prefix
    }

    log(message: string): void {
      console.log(\`[\${this.prefix}] \${message}\`)
    }

    error(message: string): void {
      console.error(\`[\${this.prefix}] ERROR: \${message}\`)
    }
  }`
  ),
]
console.log(testFiles)

function App() {
  const [useSimpleEditor, setUseSimpleEditor] = useState(false)
  const [activeFileId, setActiveFileId] = useState("component.tsx")
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-300">
      <div className="bg-gray-800 p-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100 m-0">
              {useSimpleEditor ? "Simplified Code Editor" : "Full Code Editor"}
            </h1>
            <p className="text-sm text-gray-400 mt-2 m-0">
              {useSimpleEditor
                ? "Simplified version with only tabs and editor area"
                : "Full version with file tree, status bar and other complete features"}
            </p>
          </div>
          <button
            onClick={() => setUseSimpleEditor(!useSimpleEditor)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Switch to {useSimpleEditor ? "Full Version" : "Simplified Version"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto flex-shrink-0">
          <h3 className="text-lg font-medium text-gray-100 mb-4 m-0">
            {useSimpleEditor ? "Feature Comparison" : "Test Files"}
          </h3>

          {/* {useSimpleEditor ? (
            <>
              <div className="bg-gray-900 p-4 rounded border border-gray-700 mb-4">
                <h4 className="text-green-400 font-medium mb-2 m-0">
                  ✅ Simplified Version Includes:
                </h4>
                <ul className="text-sm text-gray-300 m-0 pl-6">
                  <li className="mb-1">Tabs (Tabs)</li>
                  <li className="mb-1">Editor Area (EditorArea)</li>
                  <li className="mb-1">
                    Syntax highlighting and code completion
                  </li>
                  <li className="mb-1">Multi-file support</li>
                  <li className="mb-1">Tab drag and drop sorting</li>
                </ul>
              </div>

              <div className="bg-gray-900 p-4 rounded border border-gray-700">
                <h4 className="text-red-400 font-medium mb-2 m-0">
                  ❌ Simplified Version Removes:
                </h4>
                <ul className="text-sm text-gray-300 m-0 pl-6">
                  <li className="mb-1">File Tree (FileTree)</li>
                  <li className="mb-1">Status Bar (StatusBar)</li>
                  <li className="mb-1">Shortcut Help (ShortcutHelp)</li>
                  <li className="mb-1">Plugin Status (PluginStatus)</li>
                  <li className="mb-1">Keyboard shortcuts</li>
                </ul>
              </div>
            </>
          ) : ( */}
            <>
              <ul className="list-none p-0 m-0 mb-6">
                {testFiles.map((file) => (
                  <li
                    key={file.id}
                    className="p-2 rounded cursor-pointer mb-1 text-gray-300 hover:bg-gray-700 transition-colors"
                    onClick={() => setActiveFileId(file.id)}
                  >
                    📄 {file.name}
                  </li>
                ))}
              </ul>

              <div className="bg-gray-900 p-4 rounded border border-gray-700">
                <h4 className="text-teal-400 font-medium mb-2 m-0">
                  Test Features:
                </h4>
                <ul className="text-sm text-gray-300 m-0 pl-6">
                  <li className="mb-1">
                    Syntax highlighting - Keywords, strings, comments should
                    have different colors
                  </li>
                  <li className="mb-1">
                    Code completion - Typing this.userService. should show
                    method hints
                  </li>
                  <li className="mb-1">
                    Type checking - Type errors should have red wavy underlines
                  </li>
                  <li className="mb-1">
                    Cross-file references - a.ts referencing b.ts types should
                    work normally
                  </li>
                  <li className="mb-1">
                    Hover hints - Hovering over variables should show type
                    information
                  </li>
                  <li className="mb-1 text-yellow-400">
                    ESM imports - Supports libraries like lodash-es, axios,
                    date-fns, uuid
                  </li>
                  <li className="mb-1 text-yellow-400">
                    Plugin system - ESM import resolver enabled
                  </li>
                </ul>
              </div>
            </>
          {/* )} */}
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <SimpleCodeEditor
            initialCode={componentContent}
            fileName="component.tsx"
            language="typescript"
            className="w-full h-full"
            theme="vs-dark"
          />
          {/* {useSimpleEditor ? (
            <SimpleCodeEditor
              initialFiles={testFiles}
              initialOpenFiles={["a.ts", "b.ts", "utils.ts", "component.tsx"]}
              initialActiveFileId="component.tsx"
              className="w-full h-full"
            />
          ) : (
            <MultiFileEditor
              initialFiles={testFiles}
              initialOpenFiles={["a.ts", "b.ts", "utils.ts", "component.tsx"]}
              initialActiveFileId="component.tsx"
              className="w-full h-full"
            />
          )} */}
        </div>
      </div>
    </div>
  )
}

export default App
