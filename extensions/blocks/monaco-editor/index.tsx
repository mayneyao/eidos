import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import {
  useEidos,
  useExtensionContext,
  type FileHandlerContext,
} from "@eidos.space/react"
import Editor, { useMonaco } from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"

/**
 * Extension metadata for Eidos
 * FileHandler type - handles text-based file editing
 */
export const meta = {
  type: "fileHandler",
  componentName: "MonacoEditor",
  fileHandler: {
    title: "Monaco Editor",
    description: "Code and text file editor powered by Monaco (VS Code)",
    extensions: [
      // Programming languages
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".mjs",
      ".cjs",
      ".py",
      ".pyw",
      ".java",
      ".kt",
      ".scala",
      ".c",
      ".cpp",
      ".cc",
      ".h",
      ".hpp",
      ".cs",
      ".go",
      ".rs",
      ".rb",
      ".php",
      ".swift",
      ".lua",
      ".r",
      // Web
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".less",
      ".sass",
      // Data & Config
      ".json",
      ".yaml",
      ".yml",
      ".toml",
      ".xml",
      // Shell & Scripts
      ".sh",
      ".bash",
      ".zsh",
      ".fish",
      ".ps1",
      ".bat",
      ".cmd",
      // Text
      ".txt",
      ".md",
      ".markdown",
      ".rst",
      // Config files
      ".env",
      ".ini",
      ".cfg",
      ".conf",
      // SQL
      ".sql",
      // Other
      ".dockerfile",
      ".makefile",
      ".cmake",
    ],
  },
}

/**
 * Get Monaco language from file extension
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""

  const langMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    // Python
    py: "python",
    pyw: "python",
    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sass: "scss",
    // Data
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    // Shell
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    // Other
    sql: "sql",
    md: "markdown",
    markdown: "markdown",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    cc: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    r: "r",
    lua: "lua",
    toml: "ini",
    ini: "ini",
    dockerfile: "dockerfile",
  }

  return langMap[ext] || "plaintext"
}

/**
 * Monaco Editor FileHandler Extension
 *
 * Reuses the project's Monaco editor for editing text files
 */
export function MonacoEditor() {
  const eidos = useEidos()
  const ctx = useExtensionContext<FileHandlerContext>()
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const monacoInstance = useMonaco()
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const language = getLanguageFromPath(ctx.filePath)

  // Load file content
  useEffect(() => {
    setLoading(true)
    setError(null)

    eidos.currentSpace.fs
      .readFile(ctx.filePath, "utf8")
      .then((text: string) => {
        setContent(text)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(`Failed to load file: ${err.message}`)
        setLoading(false)
      })
  }, [eidos, ctx.filePath])

  // Save file content
  const handleSave = useCallback(
    async (codeToSave: string) => {
      setSaving(true)
      try {
        await eidos.currentSpace.fs.writeFile(ctx.filePath, codeToSave, "utf8")
        eidos.currentSpace.notify({
          title: "File Saved",
          description: `Saved ${ctx.filePath.split("/").pop()}`,
        })
      } catch (err: any) {
        eidos.currentSpace.notify({
          title: "Save Failed",
          description: err.message,
        })
      } finally {
        setSaving(false)
      }
    },
    [eidos, ctx.filePath]
  )

  // Handle editor resize
  useLayoutEffect(() => {
    if (!monacoInstance || !editorRef.current || !containerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      editorRef.current?.layout()
    })
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [monacoInstance])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-red-500">{error}</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full relative">
      {saving && (
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-blue-500 text-white text-xs rounded">
          Saving...
        </div>
      )}
      <Editor
        height="100%"
        width="100%"
        value={content}
        language={language}
        theme="vs-light"
        options={{
          minimap: { enabled: true },
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 14,
          lineNumbers: "on",
          folding: true,
          tabSize: 2,
        }}
        onChange={(value) => {
          if (value !== undefined) {
            setContent(value)
          }
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor

          // Cmd/Ctrl + S to save
          editor.onKeyDown((e) => {
            if (e.keyCode === monaco.KeyCode.KeyS && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              const code = editor.getValue()
              handleSave(code)
            }
          })
        }}
      />
    </div>
  )
}
