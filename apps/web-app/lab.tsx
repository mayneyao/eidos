import { useCallback, useEffect, useState } from "react"

import { fileChecksum } from "@/lib/web/crypto"
import { CommandInputEditor } from "@/components/command-editor/Editor"

// 定义 Worker 消息类型
type PyodideMessage = {
  type: "execute" | "install"
  payload: {
    code?: string
    packages?: string[]
  }
}

type PyodideResponse = {
  type: "success" | "error"
  result?: string
  error?: string
  time?: number
}

export const LabPage = () => {
  const [worker, setWorker] = useState<Worker | null>(null)
  const [output, setOutput] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  // 初始化 Worker
  useEffect(() => {
    const pyWorker = new Worker(
      new URL("@/worker/web-worker/pyodide/pyodide.ts", import.meta.url),
      { type: "module" }
    )

    pyWorker.onmessage = (event: MessageEvent<PyodideResponse>) => {
      setIsLoading(false)
      if (event.data.type === "success") {
        setOutput(
          (prev) =>
            `${prev}\n> Output (${event.data.time}ms):\n${event.data.result}`
        )
      } else {
        setOutput((prev) => `${prev}\n> Error:\n${event.data.error}`)
      }
    }

    setWorker(pyWorker)
    return () => pyWorker.terminate()
  }, [])

  // 执行 Python 代码
  const runPythonCode = useCallback(
    (code: string) => {
      if (!worker) return

      setIsLoading(true)
      setOutput((prev) => `${prev}\n\n> Executing:\n${code}`)

      worker.postMessage({
        type: "execute",
        payload: { code },
      } as PyodideMessage)
    },
    [worker]
  )

  // 安装 Python 包
  const installPackages = useCallback(
    (packages: string[]) => {
      if (!worker) return

      setIsLoading(true)
      setOutput(
        (prev) => `${prev}\n\n> Installing packages: ${packages.join(", ")}`
      )

      worker.postMessage({
        type: "install",
        payload: { packages },
      } as PyodideMessage)
    },
    [worker]
  )

  // fileChecksum
  const handleFileUpload = async (file?: File) => {
    if (!file) {
      return
    }

    // time it takes to calculate the hash
    console.time("fileChecksum")
    const hash = await fileChecksum(file)
    console.timeEnd("fileChecksum")
    console.log("File hash:", hash)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-4">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => installPackages(["numpy"])}
          disabled={isLoading}
        >
          Install NumPy
        </button>
        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={() => runPythonCode('print("Hello from Python!")')}
          disabled={isLoading}
        >
          Run Hello World
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <textarea
            className="w-full h-[200px] p-2 font-mono border rounded"
            placeholder="Enter Python code here..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                runPythonCode(e.currentTarget.value)
              }
            }}
          />
        </div>
        <div className="flex-1">
          <pre className="w-full h-[200px] p-2 bg-gray-100 rounded overflow-auto">
            {output || "Output will appear here..."}
          </pre>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-bold mb-2">File Hash Demo:</h3>
        <input
          type="file"
          onChange={(e) => handleFileUpload(e.target.files?.[0])}
        />
      </div>
    </div>
  )
}
