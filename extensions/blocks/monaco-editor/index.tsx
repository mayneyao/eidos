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
  icon: "code",
  fileHandler: {
    title: "Monaco Editor",
    description:
      "Advanced code and text editor utilizing the Monaco Editor engine. Provides syntax highlighting, code folding, line numbering, and mini-map navigation for a wide range of programming languages and file formats.",
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
      ".jsonl",
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
    jsonl: "json",
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
 * Get color from CSS variable and resolve to HEX
 */
function getVariableColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback

  const temp = document.createElement("div")
  temp.style.color = `var(${varName})`
  temp.style.display = "none"
  document.body.appendChild(temp)
  const resolved = getComputedStyle(temp).color
  document.body.removeChild(temp)

  if (
    !resolved ||
    resolved === "rgba(0, 0, 0, 0)" ||
    resolved === "transparent"
  ) {
    return fallback
  }

  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const match = resolved.match(/\d+(\.\d+)?/g)
  if (!match || match.length < 3) return fallback

  const r = Math.min(255, parseInt(match[0])).toString(16).padStart(2, "0")
  const g = Math.min(255, parseInt(match[1])).toString(16).padStart(2, "0")
  const b = Math.min(255, parseInt(match[2])).toString(16).padStart(2, "0")

  // Handle alpha if present
  if (match.length === 4) {
    const a = Math.round(parseFloat(match[3]) * 255)
      .toString(16)
      .padStart(2, "0")
    return `#${r}${g}${b}${a}`
  }

  return `#${r}${g}${b}`
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

  // Define and apply theme based on CSS variables
  useEffect(() => {
    if (!monacoInstance) return

    const isDark = ctx.theme === "dark"
    const background = getVariableColor(
      "--background",
      isDark ? "#1e1e1e" : "#ffffff"
    )
    const foreground = getVariableColor(
      "--foreground",
      isDark ? "#d4d4d4" : "#333333"
    )
    const primary = getVariableColor("--primary", "#007acc")
    const border = getVariableColor("--border", isDark ? "#444444" : "#cccccc")

    // Syntax colors
    const comment = getVariableColor("--token-comment-color", "#6a9955")
    const keyword = getVariableColor(
      "--token-property-color",
      isDark ? "#569cd6" : "#0000ff"
    )
    const string = getVariableColor(
      "--token-selector-color",
      isDark ? "#ce9178" : "#a31515"
    )
    const number = getVariableColor(
      "--token-variable-color",
      isDark ? "#b5cea8" : "#098658"
    )
    const type = getVariableColor(
      "--token-attr-color",
      isDark ? "#4ec9b0" : "#267f99"
    )
    const func = getVariableColor(
      "--token-function-color",
      isDark ? "#dcdcaa" : "#795e26"
    )

    monacoInstance.editor.defineTheme("eidos-dynamic", {
      base: isDark ? "vs-dark" : "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: comment },
        { token: "keyword", foreground: keyword },
        { token: "string", foreground: string },
        { token: "number", foreground: number },
        { token: "type", foreground: type },
        { token: "function", foreground: func },
      ],
      colors: {
        "editor.background": background,
        "editor.foreground": foreground,
        "editor.lineHighlightBackground": isDark ? "#ffffff08" : "#00000005",
        "editorCursor.foreground": primary,
        "editor.selectionBackground": isDark ? "#ffffff20" : "#00000010",
        "editorIndentGuide.background": border,
        "editorLineNumber.foreground": isDark ? "#858585" : "#237893",
        "editor.border": border,
      },
    })

    monacoInstance.editor.setTheme("eidos-dynamic")
  }, [monacoInstance, ctx.theme])

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
        theme="eidos-dynamic"
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
      {/* Listen for global find shortcut in Desktop app */}
      <FindListener editorRef={editorRef} containerRef={containerRef} />
    </div>
  )
}

/**
 * Separate component to listen for find-in-page event
 * This avoids unnecessary re-renders of the main MonacoEditor component
 */
function FindListener({
  editorRef,
  containerRef,
}: {
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  useEffect(() => {
    const handleToggleFind = () => {
      const editor = editorRef.current
      if (!editor) return

      // Trigger find if editor has focus or if the container contains the active element
      // This ensures it works even if the find widget itself or other sub-elements have focus
      const isFocused =
        editor.hasTextFocus() ||
        (containerRef.current &&
          containerRef.current.contains(document.activeElement))

      if (isFocused) {
        editor.trigger("keyboard", "actions.find", null)
      }
    }

    window.addEventListener("toggle-find-in-page", handleToggleFind)
    return () => {
      window.removeEventListener("toggle-find-in-page", handleToggleFind)
    }
  }, [editorRef, containerRef])

  return null
}
