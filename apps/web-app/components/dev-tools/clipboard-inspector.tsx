"use client"

import { useState, useEffect } from "react"

interface ClipboardData {
  text?: string
  html?: string
  image?: string
  files?: File[]
  types: string[]
}

export function ClipboardInspector() {
  const [clipboardData, setClipboardData] = useState<ClipboardData>({
    types: [],
  })

  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const clipboardItems = await navigator.clipboard.read()
        const data: ClipboardData = { types: [] }

        for (const item of clipboardItems) {
          data.types = [...item.types]

          // 读取文本内容
          if (item.types.includes("text/plain")) {
            const textBlob = await item.getType("text/plain")
            data.text = await textBlob.text()
          }

          // 读取 HTML 内容
          if (item.types.includes("text/html")) {
            const htmlBlob = await item.getType("text/html")
            data.html = await htmlBlob.text()
          }

          // 读取图片内容
          if (
            item.types.includes("image/png") ||
            item.types.includes("image/jpeg") ||
            item.types.includes("image/gif")
          ) {
            const imageType =
              item.types.find((type) => type.startsWith("image/")) ||
              "image/png"
            const imageBlob = await item.getType(imageType)
            data.image = URL.createObjectURL(imageBlob)
          }
        }

        setClipboardData(data)
      } catch (error) {
        // 如果新的 API 不可用，回退到文本 API
        try {
          const text = await navigator.clipboard.readText()
          setClipboardData({ text, types: ["text/plain"] })
        } catch (textError) {
          // 静默处理错误，可能是权限问题
        }
      }
    }

    // 初始检查
    checkClipboard()

    // 监听剪切板变化
    const handleFocus = () => {
      checkClipboard()
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("paste", checkClipboard)

    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("paste", checkClipboard)
    }
  }, [])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
    }
  }

  const downloadImage = () => {
    if (clipboardData.image) {
      const link = document.createElement("a")
      link.href = clipboardData.image
      link.download = `clipboard-image-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  return (
    <div>
      {clipboardData.types.length > 0 ? (
        <div className="space-y-3">
          {/* 类型信息 */}
          <div className="text-xs text-gray-400">
            Types: {clipboardData.types.join(", ")}
          </div>

          {/* 文本内容 */}
          {clipboardData.text && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-300">
                Text Content:
              </div>
              <div className="text-xs text-gray-400">
                Length: {clipboardData.text.length} chars
              </div>
              <div className="text-xs text-gray-300 break-all whitespace-pre-wrap max-h-20 overflow-y-auto">
                {clipboardData.text}
              </div>
              <button
                onClick={() => copyToClipboard(clipboardData.text!)}
                className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors"
              >
                Copy Text
              </button>
            </div>
          )}

          {/* HTML 内容 */}
          {clipboardData.html && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-300">
                HTML Content:
              </div>
              <div className="text-xs text-gray-300 break-all whitespace-pre-wrap max-h-20 overflow-y-auto bg-gray-800 p-2 rounded">
                {clipboardData.html}
              </div>
              <button
                onClick={() => copyToClipboard(clipboardData.html!)}
                className="text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded transition-colors"
              >
                Copy HTML
              </button>
            </div>
          )}

          {/* 图片内容 */}
          {clipboardData.image && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-300">
                Image Content:
              </div>
              <div className="max-h-32 overflow-hidden rounded border border-gray-600">
                <img
                  src={clipboardData.image}
                  alt="Clipboard image"
                  className="max-w-full h-auto"
                />
              </div>
              <button
                onClick={downloadImage}
                className="text-xs bg-purple-600 hover:bg-purple-700 px-2 py-1 rounded transition-colors"
              >
                Download Image
              </button>
            </div>
          )}

          {/* 文件内容 */}
          {clipboardData.files && clipboardData.files.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-300">Files:</div>
              {clipboardData.files.map((file, index) => (
                <div key={index} className="text-xs text-gray-300">
                  {file.name} ({file.size} bytes, {file.type})
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-400">
          Clipboard is empty or inaccessible
        </div>
      )}
    </div>
  )
}
