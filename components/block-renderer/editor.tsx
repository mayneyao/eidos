import { useEffect, useState } from "react"

import { compileCode } from "@/lib/v3/compiler"

import { BlockRenderer } from "./block-renderer"

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
  useEffect(() => {
    setTimeout(() => {
      compile()
    }, 300)
  }, [code])

  return (
    <div className="h-fit w-full flex flex-col">
      {/* a button to re render the preview */}
      <button onClick={compile}>run</button>
      <BlockRenderer code={code} compiledCode={compiledCode} />
    </div>
  )
}
