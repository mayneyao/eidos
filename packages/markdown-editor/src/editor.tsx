import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import MonacoEditor, { type OnMount } from "@monaco-editor/react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { AutoLinkPlugin } from "@lexical/react/LexicalAutoLinkPlugin"
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
import { autoLinkEmailMatcher, autoLinkUrlMatcher } from "@lexical/link"
import { $createListItemNode, $createListNode } from "@lexical/list"
import {
  $addUpdateTag,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  KEY_SPACE_COMMAND,
  type EditorState,
  type EditorThemeClasses,
  type LexicalEditor,
} from "lexical"

import { BlockCommandMenuPlugin } from "./block-menu"
import {
  BlockSelectionPlugin,
  DraggableBlockPlugin,
} from "./block-controls-plugin"
import { splitMarkdownDocument, type MarkdownFrontmatter } from "./document"
import { FloatingFormatToolbarPlugin } from "./floating-format-toolbar"
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
  WikiLinkCompletionPlugin,
  type MarkdownWikiLinkSuggestionProvider,
} from "./wiki-link-plugin"
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

export interface MarkdownEditorSelection {
  readonly text: string
  readonly collapsed: boolean
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
  onSelectionChange?: (selection: MarkdownEditorSelection | null) => void
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
  enableFloatingToolbar?: boolean
  /** Host-provided Space document suggestions for the `[[…` typeahead. */
  wikiLinkSuggestions?: MarkdownWikiLinkSuggestionProvider
}

interface EditorBridgeProps {
  controlledValue: string | undefined
  editable: boolean
  sourceRef: React.MutableRefObject<MarkdownSourceSnapshot>
  lastEmittedRef: React.MutableRefObject<string | null>
  editorRef: React.MutableRefObject<LexicalEditor | null>
  onChange: MarkdownEditorProps["onChange"]
  onSelectionChange: MarkdownEditorProps["onSelectionChange"]
  onInternalSourceChange: (markdown: string) => void
}

interface MarkdownSourceEditorProps {
  ariaLabel: string
  autoFocus: boolean
  className: string
  onBlur: () => void
  onChange: (value: string | undefined) => void
  onEditorReady: (editor: { focus: () => void } | null) => void
  onFocus: () => void
  onSelectionChange: MarkdownEditorProps["onSelectionChange"]
  theme: string
  value: string
}

type MonacoSubscription = { dispose: () => void }

function inferSourceLineEnding(markdown: string): "\n" | "\r\n" {
  return markdown.includes("\r\n") ? "\r\n" : "\n"
}

function useMarkdownSourceTheme(): string {
  const resolveTheme = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "vs-dark"
      : "vs"
  const [theme, setTheme] = useState(resolveTheme)

  useEffect(() => {
    if (typeof document === "undefined") return
    const updateTheme = () => setTheme(resolveTheme())
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    })
    return () => observer.disconnect()
  }, [])

  return theme
}

function MarkdownSourceEditor({
  ariaLabel,
  autoFocus,
  className,
  onBlur,
  onChange,
  onEditorReady,
  onFocus,
  onSelectionChange,
  theme,
  value,
}: MarkdownSourceEditorProps) {
  const subscriptionsRef = useRef<MonacoSubscription[]>([])

  const disposeSubscriptions = useCallback(() => {
    for (const subscription of subscriptionsRef.current) {
      subscription.dispose()
    }
    subscriptionsRef.current = []
  }, [])

  useEffect(
    () => () => {
      disposeSubscriptions()
      onEditorReady(null)
    },
    [disposeSubscriptions, onEditorReady]
  )

  const handleMount = useCallback<OnMount>(
    (editor) => {
      disposeSubscriptions()
      onEditorReady(editor)
      if (autoFocus) editor.focus()

      const reportSelection = () => {
        if (!onSelectionChange) return
        const model = editor.getModel()
        const selection = editor.getSelection()
        if (!model || !selection) {
          onSelectionChange(null)
          return
        }
        onSelectionChange({
          text: model.getValueInRange(selection),
          collapsed: selection.isEmpty(),
        })
      }

      subscriptionsRef.current = [
        editor.onDidBlurEditorText(onBlur),
        editor.onDidFocusEditorText(onFocus),
        editor.onDidChangeCursorSelection(reportSelection),
      ]
    },
    [
      autoFocus,
      disposeSubscriptions,
      onBlur,
      onEditorReady,
      onFocus,
      onSelectionChange,
    ]
  )

  return (
    <MonacoEditor
      className={className}
      height="min(72vh, 56rem)"
      language="markdown"
      onChange={onChange}
      onMount={handleMount}
      options={{
        ariaLabel,
        automaticLayout: true,
        folding: true,
        fontFamily:
          '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: 13,
        lineNumbers: "on",
        minimap: { enabled: false },
        padding: { bottom: 24, top: 14 },
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
      }}
      theme={theme}
      value={value}
      width="100%"
    />
  )
}

function LegacyTaskShortcutPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(
        KEY_SPACE_COMMAND,
        (event) => {
          if (
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.isComposing ||
            editor.isComposing()
          ) {
            return false
          }

          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false
          }

          const anchor = selection.anchor
          const text = anchor.getNode()
          if (
            !$isTextNode(text) ||
            anchor.offset !== 2 ||
            text.getTextContent().slice(0, anchor.offset) !== "[]" ||
            text.getPreviousSibling() !== null
          ) {
            return false
          }

          const paragraph = text.getParent()
          if (
            !$isParagraphNode(paragraph) ||
            !$isRootOrShadowRoot(paragraph.getParent())
          ) {
            return false
          }

          event.preventDefault()
          $addUpdateTag(HISTORY_PUSH_TAG)
          text.spliceText(0, anchor.offset, "", true)
          const listItem = $createListItemNode(false)
          listItem.append(...paragraph.getChildren())
          const list = $createListNode("check")
          list.append(listItem)
          paragraph.replace(list)
          listItem.selectStart()
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor]
  )

  return null
}

function EditorBridge({
  controlledValue,
  editable,
  sourceRef,
  lastEmittedRef,
  editorRef,
  onChange,
  onSelectionChange,
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

      if (onSelectionChange) {
        editorState.read(() => {
          const selection = $getSelection()
          onSelectionChange(
            $isRangeSelection(selection)
              ? {
                  text: selection.getTextContent(),
                  collapsed: selection.isCollapsed(),
                }
              : null
          )
        })
      }

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
    [
      lastEmittedRef,
      onChange,
      onInternalSourceChange,
      onSelectionChange,
      sourceRef,
    ]
  )

  return (
    <OnChangePlugin
      onChange={handleChange}
      ignoreSelectionChange={!onSelectionChange}
    />
  )
}

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    value,
    defaultValue = "",
    onChange,
    onSelectionChange,
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
    enableFloatingToolbar = true,
    wikiLinkSuggestions,
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
  const effectiveReadOnly = readOnly
  const lastEmittedRef = useRef<string | null>(null)
  const editorRef = useRef<LexicalEditor | null>(null)
  const rawFallbackRef = useRef<{ focus: () => void } | null>(null)
  const setRawFallbackRef = useCallback(
    (node: { focus: () => void } | null) => {
      rawFallbackRef.current = node
    },
    []
  )
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const monacoTheme = useMarkdownSourceTheme()

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
    const snapshot = markdownToSourceSnapshot(value)
    sourceRef.current = snapshot
    setCompatibility(inspectMarkdownCompatibility(value, snapshot.canonical))
  }, [value])

  const editorExtension = useMemo(
    () =>
      createMarkdownExtension({
        editable: !effectiveReadOnly,
        initialEditorState: () => {
          $importMarkdown(splitMarkdownDocument(activeSourceRef.current).body)
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
        else rawFallbackRef.current?.focus()
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
        const snapshot = markdownToSourceSnapshot(markdown)
        sourceRef.current = snapshot
        setUncontrolledSource(markdown)
        setCompatibility(
          inspectMarkdownCompatibility(markdown, snapshot.canonical)
        )
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

  if (compatibilityBlocked) {
    const viewProps = { markdown: activeSource, compatibility, ariaLabel }
    const unsupportedSyntax = [
      ...new Set(compatibility.issues.map((issue) => issue.code)),
    ].join(", ")
    const rawEditorClassName = ["eidos-md-monaco-source", contentClassName]
      .filter(Boolean)
      .join(" ")
    const handleRawSourceChange = (value: string | undefined) => {
      const next = (value ?? "").replace(
        /\r?\n/g,
        inferSourceLineEnding(activeSourceRef.current)
      )
      if (next === activeSourceRef.current) return

      const snapshot = markdownToSourceSnapshot(next)
      activeSourceRef.current = next
      sourceRef.current = snapshot
      lastEmittedRef.current = next
      setUncontrolledSource(next)
      setCompatibility(inspectMarkdownCompatibility(next, snapshot.canonical))
      onChange?.(next, {
        canonical: snapshot.canonical,
        frontmatter: snapshot.frontmatter,
        sourcePreserved: true,
      })
    }
    return (
      <div
        className={rootClassName}
        data-readonly={readOnly || undefined}
        data-unsupported-markdown="true"
      >
        {renderUnsupportedMarkdown?.(viewProps) ?? (
          <div className="eidos-md-unsupported-view">
            <div className="eidos-md-compatibility-notice" role="note">
              <strong>
                {readOnly ? "Read-only Markdown" : "Markdown source mode"}
              </strong>
              <span>
                {readOnly
                  ? "This file uses syntax the visual editor cannot safely change yet:"
                  : "This file uses syntax the visual editor cannot safely change yet. Edit and save the original Markdown with Monaco:"}{" "}
                {unsupportedSyntax}.
              </span>
            </div>
            {readOnly ? (
              <pre
                aria-label={ariaLabel}
                className="eidos-md-raw-source"
                ref={setRawFallbackRef}
                role="document"
                tabIndex={0}
              >
                {activeSource}
              </pre>
            ) : (
              <MarkdownSourceEditor
                ariaLabel={ariaLabel}
                autoFocus={autoFocus}
                className={rawEditorClassName}
                onBlur={() => onBlur?.({} as React.FocusEvent<HTMLDivElement>)}
                onChange={handleRawSourceChange}
                onEditorReady={setRawFallbackRef}
                onFocus={() =>
                  onFocus?.({} as React.FocusEvent<HTMLDivElement>)
                }
                onSelectionChange={onSelectionChange}
                theme={monacoTheme}
                value={activeSource}
              />
            )}
          </div>
        )}
      </div>
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
              onSelectionChange={onSelectionChange}
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
                <AutoLinkPlugin
                  matchers={[autoLinkUrlMatcher, autoLinkEmailMatcher]}
                />
                <CheckListPlugin />
                <TabIndentationPlugin />
                <ListKeyboardPlugin />
                <LegacyTaskShortcutPlugin />
                <MarkdownPastePlugin />
                {wikiLinkSuggestions ? (
                  <WikiLinkCompletionPlugin
                    provideSuggestions={wikiLinkSuggestions}
                  />
                ) : null}
                <BlockCommandMenuPlugin />
                {enableFloatingToolbar ? (
                  <FloatingFormatToolbarPlugin surfaceRef={surfaceRef} />
                ) : null}
                {uploadImages ? (
                  <ImageUploadPlugin
                    uploadImages={uploadImages}
                    onUploadError={onImageUploadError}
                  />
                ) : null}
                {enableBlockControls ? (
                  <>
                    <BlockSelectionPlugin surfaceRef={surfaceRef} />
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
