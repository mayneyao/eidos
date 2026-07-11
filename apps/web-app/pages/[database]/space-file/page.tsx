import { useCallback, useEffect, useId, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import { AlertTriangle, FileQuestion, RefreshCw } from "lucide-react"
import { useLocation } from "react-router-dom"

import {
  headingFromSpaceUrl,
  parentSpacePath,
  toSpaceAssetUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"
import { SpaceMarkdownEditor } from "@/apps/web-app/components/file-space/space-markdown-editor"
import {
  isDestructiveSpaceVersioningOperation,
  useActiveSpaceVersioningOperation,
} from "@/apps/web-app/hooks/use-space-versioning"
import { decideTextFileChange } from "@/apps/web-app/components/file-space/text-file-change"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { useTabDirty } from "@/apps/web-app/hooks/use-tab-dirty"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

const TEXT_EXTENSIONS = new Set([
  "css",
  "csv",
  "html",
  "ini",
  "js",
  "json",
  "jsx",
  "log",
  "markdown",
  "md",
  "py",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])

const MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
}

function decodeFilePath(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""))
  } catch {
    return hash.replace(/^#/, "")
  }
}

function extensionOf(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() ?? ""
}

function filenameOf(filePath: string): string {
  return filePath.split("/").pop() || filePath
}

function editorLanguage(extension: string): string {
  const languages: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    md: "markdown",
    markdown: "markdown",
    yml: "yaml",
    sh: "shell",
    toml: "ini",
  }
  return languages[extension] ?? (extension || "plaintext")
}

export function SpaceFilePage() {
  const location = useLocation()
  const filePath = decodeFilePath(location.hash)
  const heading =
    headingFromSpaceUrl(location.pathname + location.search + location.hash) ??
    undefined
  const extension = extensionOf(filePath)
  const fileName = filenameOf(filePath)
  useTabTitle(fileName || "File")

  if (!filePath) {
    return <FileState message="No file selected" />
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return (
      <SpaceTextEditor
        key={filePath}
        filePath={filePath}
        extension={extension}
        heading={heading}
      />
    )
  }
  if (MIME_TYPES[extension]) {
    return (
      <SpaceAssetPreview filePath={filePath} mimeType={MIME_TYPES[extension]} />
    )
  }
  return (
    <FileState
      message={`Eidos does not have a preview for .${extension || "unknown"} files yet.`}
    />
  )
}

function SpaceTextEditor({
  filePath,
  extension,
  heading,
}: {
  filePath: string
  extension: string
  heading?: string
}) {
  const { currentSpace } = useCurrentSpace()
  const { readText, writeText } = useSpaceFiles(currentSpace?.id)
  const versioningOperation = useActiveSpaceVersioningOperation(
    currentSpace?.id
  )
  const destructiveVersionMutation =
    isDestructiveSpaceVersioningOperation(versioningOperation)
  const { resolvedTheme } = useTheme()
  const isMarkdown = extension === "md" || extension === "markdown"
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [externalChange, setExternalChange] = useState(false)
  const editorContentRef = useRef("")
  const savedContentRef = useRef("")
  const mtimeMsRef = useRef<number | undefined>()
  const externalChangeRef = useRef(false)
  const pendingWriteContentRef = useRef<string | null>(null)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const pendingWriteKey = useId()
  const isDirty = content !== savedContent
  useTabDirty(isDirty)

  const updateExternalChange = useCallback((changed: boolean) => {
    externalChangeRef.current = changed
    setExternalChange(changed)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const file = await readText(filePath)
      editorContentRef.current = file.content
      savedContentRef.current = file.content
      setContent(file.content)
      setSavedContent(file.content)
      mtimeMsRef.current = file.mtimeMs
      setUnavailable(false)
      updateExternalChange(false)
      setError(null)
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to open file"
      setError(message)
      if (!savedContentRef.current) setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [filePath, readText, updateExternalChange])

  useEffect(() => {
    void load()
  }, [load])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        const isDirectoryRescan =
          event.eventType === "rescan" &&
          event.path === parentSpacePath(filePath)
        if (event.path !== filePath && !isDirectoryRescan) {
          return
        }
        void readText(filePath)
          .then((file) => {
            const decision = decideTextFileChange(
              file.content,
              savedContentRef.current,
              editorContentRef.current,
              pendingWriteContentRef.current
            )
            if (decision === "ignore") {
              mtimeMsRef.current = file.mtimeMs
              return
            }
            if (decision === "conflict") {
              updateExternalChange(true)
              return
            }
            editorContentRef.current = file.content
            savedContentRef.current = file.content
            setContent(file.content)
            setSavedContent(file.content)
            mtimeMsRef.current = file.mtimeMs
            setUnavailable(false)
            updateExternalChange(false)
            setError(null)
          })
          .catch((readError) => {
            if (editorContentRef.current !== savedContentRef.current) {
              updateExternalChange(true)
              return
            }
            setUnavailable(true)
            setError(
              readError instanceof Error
                ? readError.message
                : "This file is no longer available"
            )
          })
      },
      [filePath, readText, updateExternalChange]
    )
  )

  const save = useCallback(
    (nextContent: string): Promise<boolean> => {
      if (savePromiseRef.current) return savePromiseRef.current
      if (externalChangeRef.current) return Promise.resolve(false)
      if (nextContent === savedContentRef.current) return Promise.resolve(true)

      setSaving(true)
      pendingWriteContentRef.current = nextContent
      const expectedMtimeMs = mtimeMsRef.current
      const savePromise = (async () => {
        try {
          const file = await writeText(filePath, nextContent, expectedMtimeMs)
          savedContentRef.current = nextContent
          setSavedContent(nextContent)
          mtimeMsRef.current = file.mtimeMs
          setUnavailable(false)
          setError(null)
          return true
        } catch (saveError) {
          const message =
            saveError instanceof Error
              ? saveError.message
              : "Unable to save file"
          setError(message)
          if (
            /changed outside|does not exist|not found|no longer available/i.test(
              message
            )
          ) {
            updateExternalChange(true)
          }
          return false
        } finally {
          if (pendingWriteContentRef.current === nextContent) {
            pendingWriteContentRef.current = null
          }
          setSaving(false)
        }
      })()
      savePromiseRef.current = savePromise
      void savePromise.finally(() => {
        if (savePromiseRef.current === savePromise) {
          savePromiseRef.current = null
        }
      })
      return savePromise
    },
    [filePath, updateExternalChange, writeText]
  )

  const flushPendingWrite = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const activeSave = savePromiseRef.current
      if (activeSave && !(await activeSave)) return false
      if (editorContentRef.current === savedContentRef.current) return true
      if (externalChangeRef.current) return false
      if (!(await save(editorContentRef.current))) return false
    }
    return editorContentRef.current === savedContentRef.current
  }, [save])

  useEffect(() => {
    const unregister = registerPendingWriteFlusher(
      `${currentSpace?.id ?? "unknown"}:${filePath}:${pendingWriteKey}`,
      flushPendingWrite,
      currentSpace?.id ? { spaceId: currentSpace.id, filePath } : undefined
    )
    return () => {
      void flushPendingWrite().finally(unregister)
    }
  }, [currentSpace?.id, filePath, flushPendingWrite, pendingWriteKey])

  useEffect(() => {
    if (!isDirty || saving || externalChange || destructiveVersionMutation)
      return
    const timeout = window.setTimeout(() => void save(content), 700)
    return () => window.clearTimeout(timeout)
  }, [
    content,
    destructiveVersionMutation,
    externalChange,
    isDirty,
    save,
    saving,
  ])

  if (loading) return <FileState loading message="Opening file…" />
  if (unavailable) {
    return <FileState message={error || "This file is no longer available"} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{filePath}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span>
            {externalChange
              ? "Changed elsewhere"
              : saving
                ? "Saving…"
                : isDirty
                  ? "Waiting to save…"
                  : "Saved"}
          </span>
        </div>
      </div>
      {externalChange ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            This file changed outside Eidos while you were editing.
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              if (
                editorContentRef.current !== savedContentRef.current &&
                !window.confirm(
                  "Reload from disk and discard your unsaved Eidos edits?"
                )
              ) {
                return
              }
              void load()
            }}
          >
            Reload from disk
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {isMarkdown ? (
          <SpaceMarkdownEditor
            filePath={filePath}
            heading={heading}
            value={content}
            readOnly={destructiveVersionMutation}
            onBlur={() => {
              void flushPendingWrite()
            }}
            onChange={(nextContent) => {
              if (destructiveVersionMutation) return
              editorContentRef.current = nextContent
              setContent(nextContent)
            }}
            onSave={() => {
              if (!destructiveVersionMutation) {
                void save(editorContentRef.current)
              }
            }}
          />
        ) : (
          <Editor
            height="100%"
            value={content}
            language={editorLanguage(extension)}
            theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
            options={{
              automaticLayout: true,
              folding: true,
              fontSize: 14,
              lineNumbers: "on",
              minimap: { enabled: false },
              padding: { top: 18, bottom: 18 },
              readOnly: destructiveVersionMutation,
              readOnlyMessage: {
                value:
                  versioningOperation === "discarding"
                    ? "A file discard is in progress. Editing will resume when it finishes."
                    : "This Space is being restored. Editing will resume when the restore finishes.",
              },
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: "off",
            }}
            onChange={(value) => {
              if (destructiveVersionMutation) return
              const nextContent = value ?? ""
              editorContentRef.current = nextContent
              setContent(nextContent)
            }}
            onMount={(editor, monaco) => {
              editor.onDidBlurEditorText(() => {
                void flushPendingWrite()
              })
              editor.onKeyDown((event) => {
                if (
                  !destructiveVersionMutation &&
                  event.keyCode === monaco.KeyCode.KeyS &&
                  (event.ctrlKey || event.metaKey)
                ) {
                  event.preventDefault()
                  void save(editor.getValue())
                }
              })
            }}
          />
        )}
      </div>
    </div>
  )
}

function useSpaceAssetUrl(filePath: string) {
  const { currentSpace } = useCurrentSpace()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const loadVersionRef = useRef(0)

  const load = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current
    const assetUrl = toSpaceAssetUrl(filePath, revision)
    setUrl(null)
    setError(null)
    try {
      const response = await fetch(assetUrl, {
        method: "HEAD",
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`Unable to preview file (${response.status})`)
      }
      if (loadVersion !== loadVersionRef.current) return
      setUrl(assetUrl)
    } catch (loadError) {
      if (loadVersion !== loadVersionRef.current) return
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to preview file"
      )
    }
  }, [filePath, revision])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      loadVersionRef.current += 1
    }
  }, [])

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (
          event.path === filePath ||
          (event.eventType === "rescan" &&
            event.path === parentSpacePath(filePath))
        ) {
          setRevision((current) => current + 1)
        }
      },
      [filePath]
    )
  )

  return { error, url }
}

function SpaceAssetPreview({
  filePath,
  mimeType,
}: {
  filePath: string
  mimeType: string
}) {
  const { error, url } = useSpaceAssetUrl(filePath)

  if (error) return <FileState message={error} />
  if (!url) return <FileState loading message="Loading preview…" />

  if (mimeType.startsWith("image/")) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-muted/20 p-8">
        <img
          src={url}
          alt={filenameOf(filePath)}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }
  if (mimeType.startsWith("audio/")) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <audio src={url} controls className="w-full max-w-xl" />
      </div>
    )
  }
  if (mimeType.startsWith("video/")) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20 p-8">
        <video src={url} controls className="max-h-full max-w-full" />
      </div>
    )
  }
  return <iframe src={url} title={filePath} className="h-full w-full" />
}

function FileState({
  message,
  loading = false,
}: {
  message: string
  loading?: boolean
}) {
  const Icon = loading ? RefreshCw : FileQuestion
  return (
    <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
      <div className="flex max-w-md items-center gap-3 text-sm">
        <Icon className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        <span>{message}</span>
      </div>
    </div>
  )
}
