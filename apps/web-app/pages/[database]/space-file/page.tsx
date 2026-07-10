import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import Editor from "@monaco-editor/react"
import { markdownHeadingSlug } from "@eidos.space/file-space/markdown"
import {
  AlertTriangle,
  Code2,
  Eye,
  FileQuestion,
  ImageOff,
  RefreshCw,
} from "lucide-react"
import { useLocation } from "react-router-dom"
import type { Components } from "react-markdown"

import {
  headingFromSpaceLink,
  headingFromSpaceUrl,
  parentSpacePath,
  resolveSpaceLink,
  toSpaceAssetUrl,
  toSpaceFileUrl,
} from "@/apps/web-app/components/file-space/file-path"
import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"
import { navigateAfterFlushingSpaceFile } from "@/apps/web-app/components/file-space/file-navigation"
import { remarkHeadingIds } from "@/apps/web-app/components/file-space/remark-heading-ids"
import { remarkObsidianLinks } from "@/apps/web-app/components/file-space/remark-obsidian-links"
import { decideTextFileChange } from "@/apps/web-app/components/file-space/text-file-change"
import {
  createWikiLinkCompletions,
  getWikiLinkCompletionContext,
} from "@/apps/web-app/components/file-space/wiki-link-completion"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import {
  useSpaceFileChanges,
  useSpaceFiles,
} from "@/apps/web-app/hooks/use-space-files"
import { useTabDirty } from "@/apps/web-app/hooks/use-tab-dirty"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

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
  const { readText, search, writeText } = useSpaceFiles(currentSpace?.id)
  const { resolvedTheme } = useTheme()
  const isMarkdown = extension === "md" || extension === "markdown"
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [externalChange, setExternalChange] = useState(false)
  const [viewMode, setViewMode] = useState<"edit" | "preview">(
    isMarkdown ? "preview" : "edit"
  )
  const editorContentRef = useRef("")
  const savedContentRef = useRef("")
  const mtimeMsRef = useRef<number | undefined>()
  const externalChangeRef = useRef(false)
  const pendingWriteContentRef = useRef<string | null>(null)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const completionProvider = useRef<{ dispose: () => void } | null>(null)
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

  useEffect(() => {
    setViewMode(isMarkdown ? "preview" : "edit")
  }, [filePath, isMarkdown])

  useEffect(() => {
    return () => {
      completionProvider.current?.dispose()
      completionProvider.current = null
    }
  }, [])

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
    if (!isDirty || saving || externalChange) return
    const timeout = window.setTimeout(() => void save(content), 700)
    return () => window.clearTimeout(timeout)
  }, [content, externalChange, isDirty, save, saving])

  if (loading) return <FileState loading message="Opening file…" />
  if (unavailable) {
    return <FileState message={error || "This file is no longer available"} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{filePath}</span>
        <div className="flex shrink-0 items-center gap-2">
          {isMarkdown ? (
            <div className="flex items-center rounded-sm bg-muted/60 p-0.5">
              <Button
                type="button"
                variant={viewMode === "edit" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={() => setViewMode("edit")}
              >
                <Code2 className="h-3 w-3" />
                Edit
              </Button>
              <Button
                type="button"
                variant={viewMode === "preview" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={() => setViewMode("preview")}
              >
                <Eye className="h-3 w-3" />
                Preview
              </Button>
            </div>
          ) : null}
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
        {isMarkdown && viewMode === "preview" ? (
          <SpaceMarkdownPreview
            filePath={filePath}
            content={content}
            heading={heading}
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
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: isMarkdown ? "on" : "off",
            }}
            onChange={(value) => {
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
                  event.keyCode === monaco.KeyCode.KeyS &&
                  (event.ctrlKey || event.metaKey)
                ) {
                  event.preventDefault()
                  void save(editor.getValue())
                }
              })
              if (!isMarkdown) return
              const editorModel = editor.getModel()
              completionProvider.current?.dispose()
              const provider = monaco.languages.registerCompletionItemProvider(
                "markdown",
                {
                  triggerCharacters: ["["],
                  provideCompletionItems: async (model, position) => {
                    if (model !== editorModel) return { suggestions: [] }
                    const linePrefix = model.getValueInRange({
                      startLineNumber: position.lineNumber,
                      startColumn: 1,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
                    })
                    const lineSuffix = model.getValueInRange({
                      startLineNumber: position.lineNumber,
                      startColumn: position.column,
                      endLineNumber: position.lineNumber,
                      endColumn: model.getLineMaxColumn(position.lineNumber),
                    })
                    const completionContext =
                      getWikiLinkCompletionContext(linePrefix)
                    if (!completionContext) {
                      return { suggestions: [] }
                    }
                    try {
                      const results = await search(completionContext.query, {
                        limit: 50,
                        includeContent: false,
                      })
                      const completions = createWikiLinkCompletions(
                        results,
                        filePath
                      )
                      const range = {
                        startLineNumber: position.lineNumber,
                        startColumn:
                          position.column - completionContext.replaceLength,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column,
                      }
                      return {
                        suggestions: completions.map((completion, index) => ({
                          label: {
                            label: completion.label,
                            description: completion.description,
                          },
                          kind: monaco.languages.CompletionItemKind.Reference,
                          insertText:
                            completion.insertText +
                            (lineSuffix.startsWith("]]") ? "" : "]]"),
                          filterText: `${completion.label} ${completion.description}`,
                          sortText: String(index).padStart(4, "0"),
                          range,
                        })),
                      }
                    } catch {
                      return { suggestions: [] }
                    }
                  },
                }
              )
              completionProvider.current = provider
              editor.onDidDispose(() => {
                if (completionProvider.current === provider) {
                  provider.dispose()
                  completionProvider.current = null
                }
              })
            }}
          />
        )}
      </div>
    </div>
  )
}

function SpaceMarkdownPreview({
  filePath,
  content,
  heading,
}: {
  filePath: string
  content: string
  heading?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const components = useMemo<Partial<Components>>(
    () => ({
      a: ({ href = "", children, title }) => (
        <SpaceMarkdownLink
          currentFilePath={filePath}
          target={href}
          title={title}
        >
          {children}
        </SpaceMarkdownLink>
      ),
      img: ({ src = "", alt = "", title }) => {
        if (src.startsWith("#") || !resolveSpaceLink(filePath, src)) {
          return <img src={src} alt={alt} title={title} />
        }
        return (
          <SpaceMarkdownImage
            currentFilePath={filePath}
            target={src}
            alt={alt}
            title={title}
          />
        )
      },
    }),
    [filePath]
  )

  useEffect(() => {
    if (!heading || !containerRef.current) return
    const headingId = markdownHeadingSlug(heading)
    const timer = window.setTimeout(() => {
      const target = [
        ...(containerRef.current?.querySelectorAll("[id]") ?? []),
      ].find((element) => element.id === headingId)
      target?.scrollIntoView({ block: "start" })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [content, heading])

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-background">
      <MarkdownRenderer
        className="mx-auto max-w-3xl px-8 py-10"
        customComponents={components}
        remarkPlugins={[remarkObsidianLinks, remarkHeadingIds]}
      >
        {content}
      </MarkdownRenderer>
    </div>
  )
}

function SpaceMarkdownLink({
  currentFilePath,
  target,
  title,
  children,
}: {
  currentFilePath: string
  target: string
  title?: string
  children: ReactNode
}) {
  const { navigate } = useRouterAdapter()
  const { currentSpace } = useCurrentSpace()
  const { toast } = useToast()
  const {
    path: linkedPath,
    fragment,
    ambiguous,
  } = useResolvedSpaceLink(currentFilePath, target)
  if (!linkedPath) {
    const external = /^(?:https?:|mailto:|tel:)/i.test(target)
    return external ? (
      <a
        href={target}
        title={title}
        className="text-primary underline underline-offset-2"
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {children}
      </a>
    ) : (
      <span
        role="link"
        aria-disabled="true"
        title={[title, "Link target not found in this Space."]
          .filter(Boolean)
          .join(" ")}
        className="cursor-not-allowed text-muted-foreground underline decoration-dashed underline-offset-2"
      >
        {children}
      </span>
    )
  }

  const resolutionTitle = ambiguous
    ? [title, "Multiple files match this link; Eidos chose the nearest one."]
        .filter(Boolean)
        .join(" ")
    : title
  return (
    <a
      href={toSpaceFileUrl(linkedPath, fragment)}
      title={resolutionTitle}
      className="text-primary underline underline-offset-2"
      onClick={(event) => {
        event.preventDefault()
        void navigateAfterFlushingSpaceFile({
          spaceId: currentSpace?.id,
          currentFilePath,
          destination: toSpaceFileUrl(linkedPath, fragment),
          navigate,
        }).then((navigated) => {
          if (!navigated) {
            toast({
              title: "Unable to open link",
              description:
                "Eidos could not save the current file. Resolve the error and try again.",
              variant: "destructive",
            })
          }
        })
      }}
    >
      {children}
    </a>
  )
}

function SpaceMarkdownImage({
  currentFilePath,
  target,
  alt,
  title,
}: {
  currentFilePath: string
  target: string
  alt: string
  title?: string
}) {
  const { path: filePath, loading } = useResolvedSpaceLink(
    currentFilePath,
    target
  )
  if (loading || !filePath) {
    return <span className="text-sm text-muted-foreground">Loading image…</span>
  }
  return (
    <ResolvedSpaceMarkdownImage filePath={filePath} alt={alt} title={title} />
  )
}

function ResolvedSpaceMarkdownImage({
  filePath,
  alt,
  title,
}: {
  filePath: string
  alt: string
  title?: string
}) {
  const { error, url } = useSpaceAssetUrl(filePath)

  if (error) {
    return (
      <span className="my-3 flex items-center gap-2 text-sm text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        {alt || filenameOf(filePath)}
      </span>
    )
  }
  if (!url) {
    return <span className="text-sm text-muted-foreground">Loading image…</span>
  }
  return (
    <img
      src={url}
      alt={alt}
      title={title}
      className="my-5 max-h-[70vh] rounded-sm object-contain"
    />
  )
}

function useResolvedSpaceLink(currentFilePath: string, target: string) {
  const { currentSpace } = useCurrentSpace()
  const { resolveLink } = useSpaceFiles(currentSpace?.id)
  const fallbackPath = useMemo(
    () => resolveSpaceLink(currentFilePath, target),
    [currentFilePath, target]
  )
  const fallbackFragment = useMemo(() => headingFromSpaceLink(target), [target])
  const resolutionKey = `${currentFilePath}\0${target}`
  const [resolution, setResolution] = useState<{
    key: string
    path: string | null
    fragment?: string
    ambiguous: boolean
  } | null>(null)

  useEffect(() => {
    if (!fallbackPath) {
      setResolution({
        key: resolutionKey,
        path: null,
        fragment: undefined,
        ambiguous: false,
      })
      return
    }
    let active = true
    void resolveLink(currentFilePath, target)
      .then((resolved) => {
        if (!active) return
        setResolution({
          key: resolutionKey,
          path: resolved.path ?? fallbackPath,
          fragment: resolved.fragment ?? fallbackFragment,
          ambiguous: resolved.ambiguous,
        })
      })
      .catch(() => {
        if (!active) return
        setResolution({
          key: resolutionKey,
          path: fallbackPath,
          fragment: fallbackFragment,
          ambiguous: false,
        })
      })
    return () => {
      active = false
    }
  }, [
    currentFilePath,
    fallbackFragment,
    fallbackPath,
    resolutionKey,
    resolveLink,
    target,
  ])

  const currentResolution =
    resolution?.key === resolutionKey ? resolution : null
  return {
    path: currentResolution?.path ?? fallbackPath,
    fragment: currentResolution?.fragment ?? fallbackFragment,
    ambiguous: currentResolution?.ambiguous ?? false,
    loading: Boolean(fallbackPath && !currentResolution),
  }
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
