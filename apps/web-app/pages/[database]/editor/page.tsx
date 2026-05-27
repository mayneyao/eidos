import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import Editor, { useMonaco } from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"

import { isDesktopMode } from "@/lib/env"
import { useTheme } from "@/components/theme-provider"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import { useTabDirty } from "@/apps/web-app/hooks/use-tab-dirty"
import { useFilePathFromHash } from "@/apps/web-app/pages/[database]/file-handler/hooks/use-file-path-from-hash"

/**
 * Get Monaco language from file extension
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || ""

  const langMap: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    jsx: "javascript",
    py: "python",
    pyw: "python",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sass: "scss",
    json: "json",
    jsonl: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
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

  const match = resolved.match(/\d+(\.\d+)?/g)
  if (!match || match.length < 3) return fallback

  const r = Math.min(255, parseInt(match[0])).toString(16).padStart(2, "0")
  const g = Math.min(255, parseInt(match[1])).toString(16).padStart(2, "0")
  const b = Math.min(255, parseInt(match[2])).toString(16).padStart(2, "0")

  if (match.length === 4) {
    const a = Math.round(parseFloat(match[3]) * 255)
      .toString(16)
      .padStart(2, "0")
    return `#${r}${g}${b}${a}`
  }

  return `#${r}${g}${b}`
}

/**
 * Editor Page - Standalone Monaco editor for native file editing
 */
export function EditorPage() {
  const { filePath, fileName } = useFilePathFromHash()
  useTabTitle(fileName || "Editor")

  const { resolvedTheme } = useTheme()
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const monaco = useMonaco()
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const savedContentRef = useRef<string>("")

  useTabDirty(isDirty)

  const language = getLanguageFromPath(filePath)

  // Load file content using native file system
  useEffect(() => {
    if (!filePath) {
      setLoading(false)
      return
    }

    if (!isDesktopMode) {
      setError("Native file editing requires desktop mode")
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    window.eidos.nativeFs
      .readFile(filePath, "utf-8")
      .then((text: string) => {
        setContent(text)
        savedContentRef.current = text
        setIsDirty(false)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(`Failed to load file: ${err.message}`)
        setLoading(false)
      })
  }, [filePath])

  // Save file content
  const handleSave = useCallback(
    async (codeToSave: string) => {
      if (!filePath) return

      setSaving(true)
      try {
        await window.eidos.nativeFs.writeFile(filePath, codeToSave)
        savedContentRef.current = codeToSave
        setIsDirty(false)
        if (window.eidos?.space?.notify) {
          window.eidos.space.notify({
            title: "File Saved",
            description: `Saved ${fileName}`,
          })
        }
      } catch (err: any) {
        setError(`Save failed: ${err.message}`)
        if (window.eidos?.space?.notify) {
          window.eidos.space.notify({
            title: "Save Failed",
            description: err.message,
          })
        }
      } finally {
        setSaving(false)
      }
    },
    [filePath, fileName]
  )

  // Handle editor resize
  useLayoutEffect(() => {
    if (!monaco || !editorRef.current || !containerRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      editorRef.current?.layout()
    })
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [monaco])

  // Define and apply theme based on CSS variables
  useEffect(() => {
    if (!monaco) return

    const isDark = resolvedTheme === "dark"
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

    monaco.editor.defineTheme("eidos-dynamic", {
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

    monaco.editor.setTheme("eidos-dynamic")
  }, [monaco, resolvedTheme])

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-muted-foreground">No file specified</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-muted-foreground">Loading...</div>
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
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
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
            setIsDirty(value !== savedContentRef.current)
          }
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor

          editor.onKeyDown((e) => {
            if (e.keyCode === monaco.KeyCode.KeyS && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              const code = editor.getValue()
              handleSave(code)
            }
          })
        }}
      />
      <FindListener editorRef={editorRef} containerRef={containerRef} />
    </div>
  )
}

/**
 * Listen for find-in-page event from global shortcuts
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
