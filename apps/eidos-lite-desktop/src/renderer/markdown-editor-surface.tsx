import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react"

import type { EidosLiteMarkdownEditingMode } from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import type PierreTextEditorSurfaceImplementation from "./pierre-text-editor-surface"

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
  const module = await import("@eidos.space/markdown-editor")
  return { default: module.MarkdownEditor }
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
    await import("@eidos.space/markdown-editor")
  }
}

export function MarkdownEditorSurface({
  documentKey,
  relativePath,
  content,
  editingMode,
  theme,
  layout = "document",
  inputProfile = "document",
  disabled = false,
  persistSourceEditorState = false,
  autoFocus = false,
  focusRequestToken = 0,
  onChange,
}: {
  documentKey: string
  relativePath: string
  content: string
  editingMode: EidosLiteMarkdownEditingMode
  theme: ResolvedAppearance
  layout?: "document" | "embedded"
  inputProfile?: "document" | "fragment"
  disabled?: boolean
  persistSourceEditorState?: boolean
  autoFocus?: boolean
  focusRequestToken?: number
  onChange(content: string): void
}) {
  const [sessionMode, setSessionMode] =
    useState<EidosLiteMarkdownEditingMode>(editingMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const acceptedFocusTokenRef = useRef(focusRequestToken)

  useEffect(() => setSessionMode(editingMode), [documentKey, editingMode])

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
      <Suspense
        fallback={
          <div className="markdown-editor-surface-loading" role="status">
            Loading editor…
          </div>
        }
      >
        {sessionMode === "source" ? (
          <PierreEditor
            relativePath={relativePath}
            content={content}
            theme={theme}
            persistEditorState={persistSourceEditorState}
            autoFocus={autoFocus}
            focusRequestToken={focusRequestToken}
            onChange={onChange}
          />
        ) : (
          <LazyWysiwygEditor
            documentKey={documentKey}
            markdown={content}
            theme={theme}
            layout={layout}
            inputProfile={inputProfile}
            readOnly={disabled}
            autoFocus={autoFocus}
            ariaLabel={`Markdown content for ${relativePath}`}
            onMarkdownChange={onChange}
            onOpenExternalUrl={(url) => window.eidosLite.openExternalUrl(url)}
          />
        )}
      </Suspense>
    </div>
  )
}
