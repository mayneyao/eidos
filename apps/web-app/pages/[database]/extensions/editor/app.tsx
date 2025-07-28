import React, { useState } from "react"
import {
  FileType,
  MultiFileEditor,
  SimpleCodeEditor,
  type FileModel,
} from "@/packages/code-editor/src"

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
  // createFileModel("a.ts", aFileContent),
  // createFileModel("b.ts", bFileContent),
  createFileModel("component.tsx", componentContent, "typescript"),
  //   createFileModel(
  //     "utils.ts",
  //     `// Utility functions file
  // export function formatDate(date: Date): string {
  //   return date.toISOString().split('T')[0]
  // }

  // export function debounce<T extends (...args: any[]) => any>(
  //   func: T,
  //   wait: number
  // ): (...args: Parameters<T>) => void {
  //   let timeout: NodeJS.Timeout
  //   return (...args: Parameters<T>) => {
  //     clearTimeout(timeout)
  //     timeout = setTimeout(() => func(...args), wait)
  //   }
  // }

  // export interface ApiResponse<T> {
  //   data: T
  //   status: number
  //   message: string
  // }

  // export class Logger {
  //   private prefix: string

  //   constructor(prefix: string) {
  //     this.prefix = prefix
  //   }

  //   log(message: string): void {
  //     console.log(\`[\${this.prefix}] \${message}\`)
  //   }

  //   error(message: string): void {
  //     console.error(\`[\${this.prefix}] ERROR: \${message}\`)
  //   }
  // }`
  //   ),
]
console.log(testFiles)

function App() {
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-300">
      <SimpleCodeEditor
        initialFiles={testFiles}
        initialOpenFiles={["component.tsx"]}
        // initialOpenFiles={["a.ts", "b.ts", "component.tsx", "utils.ts"]}
        initialActiveFileId="component.tsx"
        className="w-full h-full"
      />
    </div>
  )
}

export default App
