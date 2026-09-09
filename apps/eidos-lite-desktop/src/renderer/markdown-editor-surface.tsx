import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ComponentProps,
} from "react"

import type { EidosLiteMarkdownEditingMode } from "../shared/contracts"
import type { EidosLiteMarkdownCompatibilityProfile } from "../shared/contracts"
import type {
  MarkdownEditorInternalLinkHandler,
  MarkdownNoteSearchHandler,
  MarkdownEditorInternalLinkRequest,
} from "@eidos.space/markdown"
import type { TextFileNavigationTarget as MarkdownEditorNavigationTarget } from "./text-search-navigation"
import {
  missingMarkdownNotePath,
  resolveObsidianSpaceEntry,
} from "./obsidian-vault"
import type { ResolvedAppearance } from "./app-appearance"
import type PierreTextEditorSurfaceImplementation from "./pierre-text-editor-surface"
import { useMarkdownImageAttachments } from "./markdown-image-attachments"
import { useEidosLiteI18n } from "./i18n"

let pierreModule:
  | Promise<{ default: typeof PierreTextEditorSurfaceImplementation }>
  | undefined
let loadedPierre: typeof PierreTextEditorSurfaceImplementation | undefined

async function loadPierreEditor() {
  pierreModule ??= import("./pierre-text-editor-surface")
  const module = await pierreModule
  loadedPierre = module.default
  return module
}

const LazyPierreEditor = lazy(loadPierreEditor)
const LazyWysiwygEditor = lazy(async () => {
  const module = await import("@eidos.space/markdown")
  const { eidosPreset } = await import("@eidos.space/markdown/presets")
  function LiteMarkdownEditor(
    props: ComponentProps<typeof module.MarkdownEditor>
  ) {
    return (
      <module.MarkdownEditor
        {...props}
        profile={undefined}
        preset={eidosPreset}
      />
    )
  }
  return { default: LiteMarkdownEditor }
})

function PierreEditor(props: ComponentProps<typeof LazyPierreEditor>) {
  const Loaded = loadedPierre
  return Loaded ? <Loaded {...props} /> : <LazyPierreEditor {...props} />
}

export async function prepareMarkdownEditorSurface(
  editingMode: EidosLiteMarkdownEditingMode
): Promise<void> {
  if (editingMode === "source") {
    await loadPierreEditor()
  } else {
    await import("@eidos.space/markdown")
  }
}

export function MarkdownEditorSurface({
  documentKey,
  relativePath,
  assetDocumentPath,
  content,
  editingMode,
  theme,
  layout = "document",
  inputProfile = "document",
  compatibilityProfile = "eidos",
  navigationTarget,
  onOpenInternalLink,
  disabled = false,
  persistSourceEditorState = false,
  autoFocus = false,
  focusRequestToken = 0,
  onChange,
}: {
  documentKey: string
  relativePath: string
  /** Enables document-local image persistence for an ordinary Markdown file. */
  assetDocumentPath?: string
  content: string
  editingMode: EidosLiteMarkdownEditingMode
  theme: ResolvedAppearance
  layout?: "document" | "embedded"
  inputProfile?: "document" | "fragment"
  compatibilityProfile?: EidosLiteMarkdownCompatibilityProfile
  navigationTarget?: MarkdownEditorNavigationTarget
  onOpenInternalLink?: MarkdownEditorInternalLinkHandler
  disabled?: boolean
  persistSourceEditorState?: boolean
  autoFocus?: boolean
  focusRequestToken?: number
  onChange(content: string): void
}) {
  const [sessionMode, setSessionMode] =
    useState<EidosLiteMarkdownEditingMode>(editingMode)
  const [focusAfterModeSwitch, setFocusAfterModeSwitch] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const acceptedFocusTokenRef = useRef(focusRequestToken)
  const imageAttachments = useMarkdownImageAttachments(assetDocumentPath)
  const { t } = useEidosLiteI18n()
  const searchNotes = useCallback<MarkdownNoteSearchHandler>(
    async ({ query, signal }) => {
      const hash = query.indexOf("#")
      if (hash >= 0) {
        const targetPath = query.slice(0, hash)
        const entry = targetPath
          ? await resolveObsidianSpaceEntry(
              relativePath,
              { path: targetPath, syntax: "wikilink" },
              window.eidosLite.searchSpacePaths
            )
          : { relativePath }
        if (!entry || signal.aborted || !/\.md$/iu.test(entry.relativePath))
          return []
        const preview =
          entry.relativePath === relativePath
            ? {
                type: "text",
                content: content,
                truncated: false,
              }
            : await window.eidosLite.previewTextFile(entry.relativePath)
        if (signal.aborted || preview.type !== "text" || preview.truncated)
          return []
        const { markdownReferenceTargets } =
          await import("@eidos.space/markdown")
        const filter = query.slice(hash).toLocaleLowerCase()
        return markdownReferenceTargets(preview.content)
          .filter(
            (item) =>
              item.target.toLocaleLowerCase().includes(filter) ||
              ((filter === "#" || filter === "#^") &&
                item.target.startsWith(filter))
          )
          .map((item) => ({
            path: `/${entry.relativePath}${item.target}`,
            title: item.title,
          }))
      }
      const [pathHits, noteHits] = await Promise.all([
        window.eidosLite.searchSpacePaths(query.trim() || ".", 200),
        window.eidosLite.searchMarkdownNotes(query.trim(), 200),
      ])
      const hits = [
        ...new Map(
          [...pathHits, ...noteHits].map((hit) => [hit.relativePath, hit])
        ).values(),
      ].sort((a, b) => b.score - a.score)
      if (signal.aborted) return []
      const candidates = hits
        .filter((hit) => hit.kind === "file" || hit.kind === "eidos")
        .map((hit) => ({
          title: hit.matchedAlias ?? hit.name.replace(/\.md$/iu, ""),
          displayText: hit.matchedAlias,
          path: hit.relativePath.includes("/")
            ? hit.relativePath
            : `/${hit.relativePath}`,
        }))
      const missing = missingMarkdownNotePath(relativePath, {
        path: query,
        syntax: "wikilink",
      })
      const queryName = query
        .trim()
        .replace(/^\//u, "")
        .replace(/\.md$/iu, "")
        .toLocaleLowerCase()
      const exact = hits.some(
        (hit) =>
          hit.matchedAlias?.toLocaleLowerCase() === queryName ||
          (query.includes("/") ? hit.relativePath : hit.name)
            .replace(/\.md$/iu, "")
            .toLocaleLowerCase() === queryName
      )
      if (missing && !exact)
        candidates.push({
          path: `/${missing}`,
          displayText: undefined,
          title: t("Link to new note: {name}", { name: query.trim() }),
        })
      return candidates
    },
    [relativePath, content, t]
  )

  useEffect(() => {
    setSessionMode(editingMode)
    setFocusAfterModeSwitch(false)
  }, [documentKey, editingMode])
  useEffect(() => {
    if (
      disabled ||
      !assetDocumentPath ||
      !/\.(md|markdown)$/i.test(relativePath)
    )
      return
    const toggle = (event: Event) => {
      if (
        !(event instanceof CustomEvent) ||
        event.detail?.relativePath !== relativePath
      )
        return
      setFocusAfterModeSwitch(true)
      setSessionMode((mode) => (mode === "source" ? "wysiwyg" : "source"))
    }
    window.addEventListener("eidos-lite:toggle-markdown-editing-mode", toggle)
    return () =>
      window.removeEventListener(
        "eidos-lite:toggle-markdown-editing-mode",
        toggle
      )
  }, [disabled, assetDocumentPath, relativePath])
  const [searchFallback, setSearchFallback] = useState(false)
  useEffect(() => {
    setSearchFallback(false)
    if (navigationTarget?.textSearch) setSessionMode("wysiwyg")
  }, [navigationTarget?.textSearch?.requestId])
  useEffect(() => setAttachmentError(null), [documentKey])

  useEffect(() => {
    if (acceptedFocusTokenRef.current === focusRequestToken) return
    acceptedFocusTokenRef.current = focusRequestToken
    if (sessionMode !== "wysiwyg") return
    containerRef.current
      ?.querySelector<HTMLElement>('[contenteditable="true"]')
      ?.focus({ preventScroll: true })
  }, [focusRequestToken, sessionMode])

  return (
    <div
      ref={containerRef}
      className="markdown-editor-surface"
      data-markdown-editing-mode={sessionMode}
    >
      {attachmentError ? (
        <div className="text-editor-save-issue" role="alert">
          <span>{attachmentError}</span>
        </div>
      ) : null}
      {searchFallback && sessionMode === "source" ? (
        <div className="text-editor-save-issue" role="status">
          {t(
            "Opened source to locate this match precisely; it could not be mapped to rendered text."
          )}
        </div>
      ) : null}
      <Suspense
        fallback={
          <div className="markdown-editor-surface-loading" role="status">
            Loading editor…
          </div>
        }
      >
        {sessionMode === "source" ? (
          <PierreEditor
            searchTarget={navigationTarget?.textSearch}
            relativePath={relativePath}
            content={content}
            theme={theme}
            persistEditorState={persistSourceEditorState}
            autoFocus={autoFocus || focusAfterModeSwitch}
            focusRequestToken={focusRequestToken}
            onPasteImage={imageAttachments?.onPasteImage}
            onPasteImageError={(error) =>
              setAttachmentError(`Image paste failed: ${error.message}`)
            }
            onChange={onChange}
          />
        ) : (
          <LazyWysiwygEditor
            documentKey={documentKey}
            documentPath={
              inputProfile === "document" ? relativePath : undefined
            }
            labels={{
              findInDocument: t("Find in document"),
              noTextMatches: t("No matches"),
              previousMatch: t("Previous match"),
              nextMatch: t("Next match"),
              closeFind: t("Close find"),
              copyBlockLink: t("Copy block link"),
              linkToFile: t("Link to a file"),
              searchFiles: t("Search files…"),
              searchingFiles: t("Searching files…"),
              noMatchingFiles: t("No matching files"),
              fileSearchFailed: t("Could not search files. Try typing again."),
            }}
            markdown={content}
            theme={theme}
            layout={layout}
            inputProfile={inputProfile}
            profile={compatibilityProfile}
            navigationTarget={searchFallback ? undefined : navigationTarget}
            onTextSearchUnavailable={() => {
              setSearchFallback(true)
              setSessionMode("source")
            }}
            onOpenInternalLink={onOpenInternalLink}
            searchNotes={searchNotes}
            readOnly={disabled}
            autoFocus={autoFocus || focusAfterModeSwitch}
            ariaLabel={`Markdown content for ${relativePath}`}
            onMarkdownChange={onChange}
            onOpenExternalUrl={(url) => window.eidosLite.openExternalUrl(url)}
            onPasteImage={imageAttachments?.onPasteImage}
            resolveImageUrl={imageAttachments?.resolveImageUrl}
            onError={(error) =>
              setAttachmentError(`Markdown editor error: ${error.message}`)
            }
          />
        )}
      </Suspense>
    </div>
  )
}
