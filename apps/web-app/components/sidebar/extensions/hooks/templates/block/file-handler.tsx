import React, { useEffect, useState } from "react"

// File Handler Meta Configuration
export const meta = {
  type: "fileHandler",
  componentName: "FileHandler",
  fileHandler: {
    title: "Text Editor",
    description: "Handle specific file types",
    extensions: [".md", ".txt"], // Change this to your target file extensions
    icon: "📄",
  },
}

function useFilePathFromHash() {
  const [filePath, setFilePath] = useState("")

  useEffect(() => {
    const updatePath = () => {
      const hash = window.location.hash
      const path = hash.startsWith("#") ? hash.substring(1) : hash
      // Decode URL-encoded characters (e.g., %20 -> space)
      setFilePath(decodeURIComponent(path))
    }

    updatePath()
    window.addEventListener("hashchange", updatePath)

    return () => window.removeEventListener("hashchange", updatePath)
  }, [])

  return filePath
}

export default function FileHandler() {
  const [content, setContent] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const filePath = useFilePathFromHash()

  useEffect(() => {
    const loadFile = async () => {
      try {
        setIsLoading(true)
        const text = await eidos.currentSpace.fs.readFile(filePath, "utf8")
        setContent(text)
        setError("")
      } catch (err: any) {
        console.error("Error reading file:", err)
        setError(err.message || "Failed to read file")
      } finally {
        setIsLoading(false)
      }
    }

    if (filePath) {
      loadFile()
    }
  }, [filePath])

  const handleSave = async () => {
    try {
      await eidos.currentSpace.fs.writeFile(filePath, content, "utf8")
      eidos.currentSpace.notify({
        title: "Success",
        description: "File saved",
      })
    } catch (err: any) {
      console.error("Error saving file:", err)
      setError(err.message || "Failed to save file")
      eidos.currentSpace.notify({
        title: "Error",
        description: err.message || "Failed to save file",
      })
    }
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-destructive mb-2">Error</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="border-b px-4 py-2 flex items-center justify-between bg-background">
        <div className="text-sm font-medium truncate">
          {filePath.split("/").pop()}
        </div>
        <button
          onClick={handleSave}
          className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Save
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full p-4 resize-none border-none focus:outline-hidden font-mono text-sm bg-background text-foreground"
          placeholder="File content..."
        />
      </div>
    </div>
  )
}
