import { useCallback, useEffect, useId, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"
import { uniqueSpaceEntryName } from "@eidos.space/file-space/names"
import { AlertTriangle, FileQuestion, RefreshCw } from "lucide-react"
import { useLocation } from "react-router-dom"

import {
  baseRecordFromSpaceUrl,
  fileEditorFromSpaceUrl,
  headingFromSpaceUrl,
  isSameOrDescendant,
  joinSpacePath,
  parentSpacePath,
  positionFromSpaceUrl,
  toSpaceAssetUrl,
  type SpaceFilePosition,
} from "@/apps/web-app/components/file-space/file-path"
import { ExtensionFileEditorSurface } from "@/apps/web-app/components/file-extensions/extension-file-editor-surface"
import {
  configureFileExtensionEditorTypes,
  fileExtensionEditorUri,
  fileExtensionPackageRoot,
  loadFileExtensionEditorPackage,
  syncFileExtensionEditorPackageTypes,
  type FileExtensionEditorPackage,
} from "@/apps/web-app/components/file-space/file-extension-editor-types"
import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"
import { SpaceBaseEditorLoader } from "@/apps/web-app/components/file-space/base/space-base-editor-loader"
import { SpaceFileFallbackPreview } from "@/apps/web-app/components/file-space/space-file-fallback-preview"
import { SpaceMarkdownEditor } from "@/apps/web-app/components/file-space/space-markdown-editor"
import {
  clearMarkdownSelection,
  rememberMarkdownSelection,
} from "@/apps/web-app/components/file-space-agent/resource-context"
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

function conflictCopyName(
  filePath: string,
  existingNames: Iterable<string>
): string {
  const filename = filenameOf(filePath)
  const extensionIndex = filename.lastIndexOf(".")
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : ""
  const stem = extension ? filename.slice(0, extensionIndex) : filename
  return uniqueSpaceEntryName(
    existingNames,
    `${stem} (Eidos conflict copy)${extension}`
  )
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
  const locationUrl = location.pathname + location.search + location.hash
  const filePath = decodeFilePath(location.hash)
  const fileEditorId = fileEditorFromSpaceUrl(locationUrl)
  const heading = headingFromSpaceUrl(locationUrl) ?? undefined
  const baseRecordTarget = baseRecordFromSpaceUrl(locationUrl) ?? undefined
  const editorPosition = positionFromSpaceUrl(locationUrl) ?? undefined
  const extension = extensionOf(filePath)
  const fileName = filenameOf(filePath)
  useTabTitle(fileName || "File")

  if (!filePath) {
    return <FileState message="No file selected" />
  }
  if (fileEditorId) {
    return (
      <ExtensionFileEditorSurface
        key={`${filePath}:${fileEditorId}`}
        filePath={filePath}
        editorId={fileEditorId}
      />
    )
  }
  if (extension === "base") {
    return (
      <SpaceBaseEditorLoader
        key={filePath}
        filePath={filePath}
        recordTarget={baseRecordTarget}
      />
    )
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return (
      <SpaceTextEditor
        key={`${filePath}:${editorPosition?.line ?? ""}:${editorPosition?.column ?? ""}`}
        filePath={filePath}
        extension={extension}
        heading={heading}
        initialPosition={editorPosition}
      />
    )
  }
  if (MIME_TYPES[extension]) {
    return (
      <SpaceAssetPreview filePath={filePath} mimeType={MIME_TYPES[extension]} />
    )
  }
  return <SpaceFileFallbackPreview key={filePath} filePath={filePath} />
}

function SpaceTextEditor({
  filePath,
  extension,
  heading,
  initialPosition,
}: {
  filePath: string
  extension: string
  heading?: string
  initialPosition?: SpaceFilePosition
}) {
  const { currentSpace } = useCurrentSpace()
  const { createText, list, readText, writeText } = useSpaceFiles(
    currentSpace?.id
  )
  const versioningOperation = useActiveSpaceVersioningOperation(
    currentSpace?.id
  )
  const destructiveVersionMutation =
    isDestructiveSpaceVersioningOperation(versioningOperation)
  const { resolvedTheme } = useTheme()
  const isMarkdown = extension === "md" || extension === "markdown"
  const extensionPackageRootPath = fileExtensionPackageRoot(filePath)
  const extensionEditorPath = currentSpace?.id
    ? fileExtensionEditorUri(currentSpace.id, filePath)
    : undefined
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [externalChange, setExternalChange] = useState(false)
  const [recoveringConflict, setRecoveringConflict] = useState(false)
  const [conflictRecoveryError, setConflictRecoveryError] = useState<
    string | null
  >(null)
  const [recoveredDraftPath, setRecoveredDraftPath] = useState<string | null>(
    null
  )
  const [extensionEditorPackage, setExtensionEditorPackage] =
    useState<FileExtensionEditorPackage | null>(null)
  const [extensionEditorNotice, setExtensionEditorNotice] = useState<
    string | null
  >(null)
  const extensionEditorMonacoRef = useRef<typeof Monaco | null>(null)
  const extensionPackageLoadRef = useRef(0)
  const editorContentRef = useRef("")
  const savedContentRef = useRef("")
  const mtimeMsRef = useRef<number | undefined>()
  const externalChangeRef = useRef(false)
  const recoveringConflictRef = useRef(false)
  const pendingWriteContentRef = useRef<string | null>(null)
  const requestedWriteContentRef = useRef<string | null>(null)
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const pendingWriteKey = useId()
  const isDirty = content !== savedContent
  useTabDirty(isDirty)

  const updateExternalChange = useCallback((changed: boolean) => {
    externalChangeRef.current = changed
    setExternalChange(changed)
  }, [])

  const load = useCallback(
    async (preserveEditorOnError = false) => {
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
        return true
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Unable to open file"
        setError(message)
        if (!preserveEditorOnError && !savedContentRef.current) {
          setUnavailable(true)
        }
        return false
      } finally {
        setLoading(false)
      }
    },
    [filePath, readText, updateExternalChange]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () => () => {
      clearMarkdownSelection(filePath)
    },
    [filePath]
  )

  const refreshExtensionEditorPackage = useCallback(async () => {
    if (!extensionPackageRootPath) return
    const loadVersion = ++extensionPackageLoadRef.current
    try {
      const editorPackage = await loadFileExtensionEditorPackage(
        { list, readText },
        filePath
      )
      if (loadVersion !== extensionPackageLoadRef.current) return
      setExtensionEditorPackage(editorPackage)
      setExtensionEditorNotice(editorPackage?.warnings.join(" ") || null)
    } catch (packageError) {
      if (loadVersion !== extensionPackageLoadRef.current) return
      setExtensionEditorNotice(
        packageError instanceof Error
          ? `Unable to load extension package context: ${packageError.message}`
          : "Unable to load extension package context."
      )
    }
  }, [extensionPackageRootPath, filePath, list, readText])

  useEffect(() => {
    void refreshExtensionEditorPackage()
  }, [refreshExtensionEditorPackage])

  useEffect(() => {
    const monaco = extensionEditorMonacoRef.current
    if (!monaco || !currentSpace?.id || !extensionEditorPackage) return
    syncFileExtensionEditorPackageTypes(
      monaco,
      currentSpace.id,
      extensionEditorPackage
    )
  }, [currentSpace?.id, extensionEditorPackage])

  useEffect(
    () => () => {
      extensionEditorMonacoRef.current = null
      extensionPackageLoadRef.current += 1
    },
    []
  )

  useSpaceFileChanges(
    currentSpace?.id,
    useCallback(
      (event) => {
        if (
          extensionPackageRootPath &&
          ((event.path !== filePath &&
            isSameOrDescendant(event.path, extensionPackageRootPath)) ||
            (event.eventType === "rescan" &&
              isSameOrDescendant(extensionPackageRootPath, event.path)))
        ) {
          void refreshExtensionEditorPackage()
        }
        const isDirectoryRescan =
          event.eventType === "rescan" &&
          isSameOrDescendant(filePath, event.path)
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
      [
        extensionPackageRootPath,
        filePath,
        readText,
        refreshExtensionEditorPackage,
        updateExternalChange,
      ]
    )
  )

  const save = useCallback(
    (nextContent: string): Promise<boolean> => {
      if (externalChangeRef.current) return Promise.resolve(false)
      if (savePromiseRef.current) {
        requestedWriteContentRef.current = nextContent
        return savePromiseRef.current
      }
      if (nextContent === savedContentRef.current) return Promise.resolve(true)

      requestedWriteContentRef.current = nextContent
      setSaving(true)
      const savePromise = (async () => {
        while (requestedWriteContentRef.current !== null) {
          if (externalChangeRef.current) return false
          const contentToWrite = requestedWriteContentRef.current
          requestedWriteContentRef.current = null
          if (contentToWrite === savedContentRef.current) continue

          pendingWriteContentRef.current = contentToWrite
          const expectedMtimeMs = mtimeMsRef.current
          try {
            const file = await writeText(
              filePath,
              contentToWrite,
              expectedMtimeMs
            )
            savedContentRef.current = contentToWrite
            setSavedContent(contentToWrite)
            mtimeMsRef.current = file.mtimeMs
            setUnavailable(false)
            setError(null)
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
            if (pendingWriteContentRef.current === contentToWrite) {
              pendingWriteContentRef.current = null
            }
          }
        }
        return true
      })()
      savePromiseRef.current = savePromise
      void savePromise.finally(() => {
        if (savePromiseRef.current === savePromise) {
          savePromiseRef.current = null
          setSaving(false)
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

  const saveConflictDraftAndReload = useCallback(async () => {
    if (recoveringConflictRef.current) return
    recoveringConflictRef.current = true
    setRecoveringConflict(true)
    setConflictRecoveryError(null)
    const draft = editorContentRef.current
    try {
      const directory = parentSpacePath(filePath)
      const entries = await list(directory)
      const copyPath = joinSpacePath(
        directory,
        conflictCopyName(
          filePath,
          entries.map((entry) => entry.name)
        )
      )
      await createText(copyPath, draft)
      setRecoveredDraftPath(copyPath)
      await load(true)
    } catch (recoveryError) {
      setConflictRecoveryError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "Unable to preserve the Eidos draft"
      )
    } finally {
      recoveringConflictRef.current = false
      setRecoveringConflict(false)
    }
  }, [createText, filePath, list, load])

  if (loading) return <FileState loading message="Opening file…" />
  if (unavailable) {
    return <FileState message={error || "This file is no longer available"} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {externalChange ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                This file changed outside Eidos while you were editing.
              </span>
            </div>
            {conflictRecoveryError ? (
              <p
                className="mt-1 break-words ps-6 text-destructive"
                role="alert"
              >
                Could not preserve your draft: {conflictRecoveryError}
              </p>
            ) : (
              <p className="mt-1 ps-6 text-amber-800/80 dark:text-amber-200/80">
                Save your Eidos draft as a sibling file before reloading the
                disk version.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={recoveringConflict}
              onClick={() => {
                if (recoveredDraftPath) {
                  void load(true)
                  return
                }
                void saveConflictDraftAndReload()
              }}
            >
              {recoveringConflict
                ? "Saving copy…"
                : recoveredDraftPath
                  ? "Retry reload"
                  : "Save draft & reload"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={recoveringConflict}
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
              Discard & reload
            </Button>
          </div>
        </div>
      ) : null}
      {recoveredDraftPath ? (
        <div
          className="border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200"
          role="status"
        >
          Your Eidos draft was preserved as{" "}
          <span className="break-all font-medium">{recoveredDraftPath}</span>.
          {externalChange
            ? " The original file could not be reloaded; your current draft remains open."
            : " The disk version is now open."}
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {extensionEditorNotice ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {extensionEditorNotice}
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
              setRecoveredDraftPath(null)
              editorContentRef.current = nextContent
              setContent(nextContent)
            }}
            onSelectionChange={(selection) => {
              rememberMarkdownSelection(
                filePath,
                selection && !selection.collapsed ? selection.text : ""
              )
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
            path={extensionEditorPath}
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
              setRecoveredDraftPath(null)
              editorContentRef.current = nextContent
              setContent(nextContent)
            }}
            onMount={(editor, monaco) => {
              extensionEditorMonacoRef.current = monaco
              configureFileExtensionEditorTypes(monaco, filePath)
              if (currentSpace?.id && extensionEditorPackage) {
                syncFileExtensionEditorPackageTypes(
                  monaco,
                  currentSpace.id,
                  extensionEditorPackage
                )
              }
              if (initialPosition) {
                editor.setPosition({
                  lineNumber: initialPosition.line,
                  column: initialPosition.column,
                })
                editor.revealPositionInCenter({
                  lineNumber: initialPosition.line,
                  column: initialPosition.column,
                })
                editor.focus()
              }
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
            isSameOrDescendant(filePath, event.path))
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
