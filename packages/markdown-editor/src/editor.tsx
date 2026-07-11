import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"
import type { EditorState, EditorThemeClasses, LexicalEditor } from "lexical"

import { BlockCommandMenuPlugin } from "./block-menu"
import {
  BlockSelectionPlugin,
  DraggableBlockPlugin,
} from "./block-controls-plugin"
import { splitMarkdownDocument, type MarkdownFrontmatter } from "./document"
import { createMarkdownExtension } from "./mdast-extension"
import {
  $importMarkdown,
  editorStateToMarkdown,
  inspectMarkdownCompatibility,
  MARKDOWN_IMPORT_TAG,
  markdownToSourceSnapshot,
  setEditorMarkdown,
  type MarkdownCompatibility,
  type MarkdownExport,
  type MarkdownSourceSnapshot,
} from "./markdown"
import {
  MarkdownRenderingProvider,
  type MarkdownRenderingOptions,
} from "./rendering"
import { MARKDOWN_EDITOR_THEME } from "./theme"
import { ListKeyboardPlugin } from "./list-keyboard-plugin"
import { MarkdownPastePlugin } from "./markdown-paste-plugin"
import {
  ImageUploadPlugin,
  type MarkdownImageUploader,
} from "./image-upload-plugin"

export interface MarkdownEditorHandle {
  focus: () => void
  getMarkdown: () => MarkdownExport
  setMarkdown: (markdown: string) => void
}

export interface MarkdownEditorChange {
  readonly canonical: string
  readonly frontmatter: MarkdownFrontmatter | null
  readonly sourcePreserved: boolean
}

export interface UnsupportedMarkdownViewProps {
  markdown: string
  compatibility: MarkdownCompatibility
  ariaLabel: string
}

export interface MarkdownEditorProps {
  /** Controlled Markdown value. Do not use together with `defaultValue`. */
  value?: string
  /** Initial value for an uncontrolled editor. */
  defaultValue?: string
  onChange?: (markdown: string, change: MarkdownEditorChange) => void
  onBlur?: React.FocusEventHandler<HTMLDivElement>
  onFocus?: React.FocusEventHandler<HTMLDivElement>
  readOnly?: boolean
  autoFocus?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
  contentClassName?: string
  namespace?: string
  theme?: EditorThemeClasses
  onError?: (error: Error) => void
  onCompatibilityChange?: (compatibility: MarkdownCompatibility) => void
  /**
   * Explicit opt-in to canonicalizing syntax listed by `compatibility.issues`.
   * It is false by default so an ordinary body edit cannot silently drop data.
   */
  allowUnsupportedMarkdownEditing?: boolean
  renderUnsupportedMarkdown?: (
    props: UnsupportedMarkdownViewProps
  ) => React.ReactNode
  rendering?: MarkdownRenderingOptions
  /** Host adapter that persists pasted/dropped images and returns Markdown paths. */
  uploadImages?: MarkdownImageUploader
  onImageUploadError?: (error: Error) => void
  enableBlockControls?: boolean
}

interface EditorBridgeProps {
  controlledValue: string | undefined
  editable: boolean
  sourceRef: React.MutableRefObject<MarkdownSourceSnapshot>
  lastEmittedRef: React.MutableRefObject<string | null>
  editorRef: React.MutableRefObject<LexicalEditor | null>
  onChange: MarkdownEditorProps["onChange"]
  onInternalSourceChange: (markdown: string) => void
}

function EditorBridge({
  controlledValue,
  editable,
  sourceRef,
  lastEmittedRef,
  editorRef,
  onChange,
  onInternalSourceChange,
}: EditorBridgeProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editorRef.current = editor

    return () => {
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [editor, editorRef])

  useEffect(() => {
    editor.setEditable(editable)
  }, [editable, editor])

  useEffect(() => {
    if (controlledValue === undefined) return
    if (controlledValue === lastEmittedRef.current) {
      const document = splitMarkdownDocument(controlledValue)
      const canonicalBody = editorStateToMarkdown(
        editor.getEditorState(),
        editor
      ).canonical
      sourceRef.current = {
        source: controlledValue,
        canonical: `${document.frontmatter?.raw ?? ""}${canonicalBody}`,
        bodySource: document.body,
        canonicalBody,
        frontmatter: document.frontmatter,
      }
      return
    }

    const current = editorStateToMarkdown(
      editor.getEditorState(),
      editor,
      sourceRef.current
    ).markdown
    if (controlledValue === current) return

    sourceRef.current = setEditorMarkdown(editor, controlledValue)
  }, [controlledValue, editor, lastEmittedRef, sourceRef])

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (tags.has(MARKDOWN_IMPORT_TAG)) return

      const result = editorStateToMarkdown(
        editorState,
        _editor,
        sourceRef.current
      )
      if (result.markdown === lastEmittedRef.current) return

      lastEmittedRef.current = result.markdown
      onInternalSourceChange(result.markdown)
      onChange?.(result.markdown, {
        canonical: result.canonical,
        frontmatter: sourceRef.current.frontmatter,
        sourcePreserved: result.sourcePreserved,
      })
    },
    [lastEmittedRef, onChange, onInternalSourceChange, sourceRef]
  )

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    value,
    defaultValue = "",
    onChange,
    onBlur,
    onFocus,
    readOnly = false,
    autoFocus = false,
    placeholder = "Type '/' to insert a block, or use Markdown shortcuts…",
    ariaLabel = "Markdown document",
    className,
    contentClassName,
    namespace = "eidos-markdown-editor",
    theme = MARKDOWN_EDITOR_THEME,
    onError,
    onCompatibilityChange,
    allowUnsupportedMarkdownEditing = false,
    renderUnsupportedMarkdown,
    rendering = {},
    uploadImages,
    onImageUploadError,
    enableBlockControls = true,
  },
  ref
) {
  const initialMarkdownRef = useRef(value ?? defaultValue)
  const initialSourceRef = useRef<MarkdownSourceSnapshot | null>(null)
  if (initialSourceRef.current === null)
    initialSourceRef.current = markdownToSourceSnapshot(
      initialMarkdownRef.current
    )
  const sourceRef = useRef<MarkdownSourceSnapshot>(initialSourceRef.current)
  const initialCompatibilityRef = useRef<MarkdownCompatibility | null>(null)
  if (initialCompatibilityRef.current === null)
    initialCompatibilityRef.current = inspectMarkdownCompatibility(
      initialMarkdownRef.current,
      initialSourceRef.current.canonical
    )
  const [uncontrolledSource, setUncontrolledSource] = useState(
    initialMarkdownRef.current
  )
  const activeSource = value ?? uncontrolledSource
  const activeSourceRef = useRef(activeSource)
  activeSourceRef.current = activeSource
  const [compatibility, setCompatibility] = useState<MarkdownCompatibility>(
    initialCompatibilityRef.current
  )
  const compatibilityRef = useRef(compatibility)
  compatibilityRef.current = compatibility
  const compatibilityBlocked =
    !compatibility.safeToEdit && !allowUnsupportedMarkdownEditing
  const effectiveReadOnly = readOnly || compatibilityBlocked
  const lastEmittedRef = useRef<string | null>(null)
  const editorRef = useRef<LexicalEditor | null>(null)
  const rawViewRef = useRef<HTMLPreElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onCompatibilityChange?.(compatibility)
  }, [compatibility, onCompatibilityChange])

  useEffect(() => {
    if (
      value === undefined ||
      value === lastEmittedRef.current ||
      value === compatibilityRef.current.source
    ) {
      return
    }
    setCompatibility(inspectMarkdownCompatibility(value))
  }, [value])

  const editorExtension = useMemo(
    () =>
      createMarkdownExtension({
        editable: !effectiveReadOnly,
        initialEditorState: () => {
          $importMarkdown(
            splitMarkdownDocument(initialMarkdownRef.current).body
          )
        },
        namespace,
        onError,
        theme,
        withShortcuts: true,
      }),
    // The extension graph owns this editor instance. Dynamic value/editable
    // changes are handled by EditorBridge.
    []
  )

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (editorRef.current) editorRef.current.focus()
        else rawViewRef.current?.focus()
      },
      getMarkdown: () => {
        const editor = editorRef.current
        if (editor) {
          return editorStateToMarkdown(
            editor.getEditorState(),
            editor,
            sourceRef.current
          )
        }
        return {
          markdown: activeSourceRef.current,
          canonical: compatibilityRef.current.canonical,
          sourcePreserved: true,
        }
      },
      setMarkdown: (markdown) => {
        activeSourceRef.current = markdown
        setUncontrolledSource(markdown)
        setCompatibility(inspectMarkdownCompatibility(markdown))
        const editor = editorRef.current
        if (editor) sourceRef.current = setEditorMarkdown(editor, markdown)
      },
    }),
    []
  )

  const rootClassName = [
    "eidos-markdown-editor",
    effectiveReadOnly
      ? "eidos-markdown-editor-readonly"
      : "eidos-markdown-editor-editable",
    compatibilityBlocked ? "eidos-markdown-editor-unsupported" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  if (compatibilityBlocked) {
    const viewProps = { markdown: activeSource, compatibility, ariaLabel }
    return (
      <div
        className={rootClassName}
        data-readonly="true"
        data-unsupported-markdown="true"
      >
        {renderUnsupportedMarkdown?.(viewProps) ?? (
          <div className="eidos-md-unsupported-view">
            <div className="eidos-md-compatibility-notice" role="note">
              <strong>Read-only Markdown</strong>
              <span>
                This file uses syntax the visual editor cannot safely change
                yet:{" "}
                {[
                  ...new Set(compatibility.issues.map((issue) => issue.code)),
                ].join(", ")}
                .
              </span>
            </div>
            <pre
              aria-label={ariaLabel}
              className="eidos-md-raw-source"
              ref={rawViewRef}
              role="document"
              tabIndex={0}
            >
              {activeSource}
            </pre>
          </div>
        )}
      </div>
    )
  }

  const editableClassName = ["eidos-md-content", contentClassName]
    .filter(Boolean)
    .join(" ")
  const handleRootClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!rendering.onLinkActivate) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>("a[href]")
    if (!anchor || anchor.dataset.eidosWikiLink === "true") return
    rendering.onLinkActivate(
      {
        href: anchor.getAttribute("href") ?? anchor.href,
        kind: "markdown",
        label: anchor.textContent ?? "",
      },
      event
    )
  }

  return (
    <MarkdownRenderingProvider options={rendering}>
      <div
        className={rootClassName}
        data-readonly={effectiveReadOnly || undefined}
        onClickCapture={handleRootClick}
      >
        <LexicalExtensionComposer
          contentEditable={null}
          extension={editorExtension}
        >
          <div className="eidos-md-editor-surface" ref={surfaceRef}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label={ariaLabel}
                  aria-multiline={effectiveReadOnly ? undefined : true}
                  className={editableClassName}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  role={effectiveReadOnly ? "document" : "textbox"}
                  spellCheck={!effectiveReadOnly}
                  tabIndex={effectiveReadOnly ? 0 : undefined}
                />
              }
              placeholder={
                effectiveReadOnly ? null : (
                  <div className="eidos-md-placeholder" aria-hidden="true">
                    {placeholder}
                  </div>
                )
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <EditorBridge
              controlledValue={value}
              editable={!effectiveReadOnly}
              sourceRef={sourceRef}
              lastEmittedRef={lastEmittedRef}
              editorRef={editorRef}
              onChange={onChange}
              onInternalSourceChange={setUncontrolledSource}
            />
            <ListPlugin />
            <LinkPlugin />
            <TablePlugin hasCellMerge={false} hasHorizontalScroll />
            {effectiveReadOnly ? (
              rendering.onLinkActivate ? null : (
                <ClickableLinkPlugin />
              )
            ) : (
              <>
                <HistoryPlugin />
                <CheckListPlugin />
                <TabIndentationPlugin />
                <ListKeyboardPlugin />
                <MarkdownPastePlugin />
                <BlockCommandMenuPlugin />
                {uploadImages ? (
                  <ImageUploadPlugin
                    uploadImages={uploadImages}
                    onUploadError={onImageUploadError}
                  />
                ) : null}
                {enableBlockControls ? (
                  <>
                    <BlockSelectionPlugin />
                    <DraggableBlockPlugin surfaceRef={surfaceRef} />
                  </>
                ) : null}
                {autoFocus && <AutoFocusPlugin />}
              </>
            )}
          </div>
        </LexicalExtensionComposer>
      </div>
    </MarkdownRenderingProvider>
  )
})

export type MarkdownViewerProps = Omit<
  MarkdownEditorProps,
  "autoFocus" | "defaultValue" | "onChange" | "readOnly"
> & {
  markdown: string
}

/** Read-only semantic document renderer backed by the same Lexical dialect. */
export function MarkdownViewer({ markdown, ...props }: MarkdownViewerProps) {
  return <MarkdownEditor {...props} value={markdown} readOnly />
}
