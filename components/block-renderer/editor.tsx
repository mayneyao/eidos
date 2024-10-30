import { useState } from "react"

import { compileCode } from "@/lib/v3/compiler"

import { Preview } from "./preview"

interface EditorProps {
  initialCode?: string
}

export const Editor: React.FC<EditorProps> = ({ initialCode = "" }) => {
  const [code, setCode] = useState(initialCode)
  const [compiledCode, setCompiledCode] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const compile = () => {
    compileCode(code)
      .then(({ code }) => {
        setCompiledCode(code)
      })
      .catch((err) => {
        setError(err.message)
      })
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 p-2 w-full h-full">
      <div className="flex-1 flex flex-col gap-4 h-full">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="输入 React/TypeScript 组件代码..."
          className="w-full h-full p-2 font-mono text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          onClick={compile}
        >
          Run
        </button>
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
            {error}
          </div>
        )}
      </div>
      <div className="flex-1 border border-gray-200 rounded-lg">
        <Preview code={code} compiledCode={compiledCode} />
      </div>
    </div>
  )
}
