import { useEffect, useMemo } from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"

import { MARKDOWN_EDITOR_NODES } from "./editor-nodes"
import { MARKDOWN_EDITOR_THEME } from "./editor-theme"
import { findUnsupportedMarkdownFeatures } from "./markdown-support"
import { MarkdownStatePlugin } from "./markdown-state-plugin"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "./markdown-transformers"
import { FloatingToolbarPlugin } from "./toolbar-plugin"
import type { MarkdownEditorLabels, MarkdownEditorProps } from "./types"

const DEFAULT_LABELS: MarkdownEditorLabels = {
  paragraph: "Paragraph",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  quote: "Quote",
  codeBlock: "Code block",
  bulletList: "Bulleted list",
  numberedList: "Numbered list",
  checkList: "Checklist",
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
  inlineCode: "Inline code",
  undo: "Undo",
  redo: "Redo",
  unsupportedTitle: "Open this document in Source mode",
  unsupportedDescription:
    "The WYSIWYG editor does not yet preserve every construct in this document.",
  useSourceEditor: "Use Source editor",
}

function safeLink(url: string): boolean {
  if (url.startsWith("#") || url.startsWith("/") || url.startsWith("./")) {
    return true
  }
  try {
    const parsed = new URL(url)
    return ["http:", "https:", "mailto:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

function MarkdownEditorImplementation({
  markdown,
  onMarkdownChange,
  onSaveRequest,
  onOpenExternalUrl,
  onError,
  labels,
  placeholder = "Write with Markdown…",
  ariaLabel = "Markdown editor",
  readOnly = false,
  autoFocus = false,
  showToolbar = true,
}: MarkdownEditorProps) {
  const resolvedLabels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labels }),
    [labels]
  )
  const handleError = (error: Error) => {
    if (onError) onError(error)
    else console.error(error)
  }
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "EidosMarkdownEditor",
      editable: !readOnly,
      nodes: [...MARKDOWN_EDITOR_NODES],
      theme: MARKDOWN_EDITOR_THEME,
      editorState: () => {
        $convertFromMarkdownString(
          markdown,
          [...EIDOS_MARKDOWN_TRANSFORMERS],
          undefined,
          false,
          true
        )
      },
      onError: handleError,
    }),
    []
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="eme-editor-shell">
        {!readOnly && showToolbar ? (
          <FloatingToolbarPlugin labels={resolvedLabels} />
        ) : null}
        <div
          className="eme-editor-stage"
          onClickCapture={(event) => {
            const anchor = (event.target as Element).closest<HTMLAnchorElement>(
              "a[href]"
            )
            if (!anchor || !safeLink(anchor.href)) return
            if (!readOnly && !(event.metaKey || event.ctrlKey)) return
            if (!onOpenExternalUrl) return
            event.preventDefault()
            try {
              void Promise.resolve(onOpenExternalUrl(anchor.href)).catch(
                (cause) =>
                  handleError(
                    cause instanceof Error ? cause : new Error(String(cause))
                  )
              )
            } catch (cause) {
              handleError(
                cause instanceof Error ? cause : new Error(String(cause))
              )
            }
          }}
        >
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="eme-content-editable"
                aria-label={ariaLabel}
              />
            }
            placeholder={
              <div className="eme-placeholder" aria-hidden="true">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} />
          <LinkPlugin validateUrl={safeLink} />
          <HorizontalRulePlugin />
          <TabIndentationPlugin />
          <MarkdownShortcutPlugin
            transformers={[...EIDOS_MARKDOWN_TRANSFORMERS]}
          />
          <MarkdownStatePlugin
            markdown={markdown}
            readOnly={readOnly}
            onMarkdownChange={onMarkdownChange}
            onSaveRequest={onSaveRequest}
            onError={handleError}
          />
          {autoFocus && !readOnly ? <AutoFocusPlugin /> : null}
        </div>
      </div>
    </LexicalComposer>
  )
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const unsupported = useMemo(
    () => findUnsupportedMarkdownFeatures(props.markdown),
    [props.markdown]
  )
  const labels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...props.labels }),
    [props.labels]
  )

  useEffect(() => {
    if (unsupported.length > 0) props.onUnsupportedMarkdown?.(unsupported)
  }, [props.onUnsupportedMarkdown, unsupported])

  if (unsupported.length > 0) {
    return (
      <section
        className={`eme-editor eme-editor-unsupported${props.className ? ` ${props.className}` : ""}`}
        data-markdown-editor="unsupported"
        data-theme={props.theme ?? "light"}
        data-layout={props.layout ?? "document"}
        aria-label={props.ariaLabel ?? "Markdown editor"}
      >
        <div className="eme-unsupported-mark" aria-hidden="true">
          MD
        </div>
        <div className="eme-unsupported-copy">
          <strong>{labels.unsupportedTitle}</strong>
          <p>{labels.unsupportedDescription}</p>
          <ul>
            {unsupported.map((feature) => (
              <li key={feature.kind}>
                {feature.label} · line {feature.line}
              </li>
            ))}
          </ul>
        </div>
        {props.onRequestSourceMode ? (
          <button
            type="button"
            className="eme-source-action"
            onClick={props.onRequestSourceMode}
          >
            {labels.useSourceEditor}
          </button>
        ) : null}
      </section>
    )
  }

  return (
    <section
      className={`eme-editor${props.className ? ` ${props.className}` : ""}`}
      data-markdown-editor="wysiwyg"
      data-theme={props.theme ?? "light"}
      data-layout={props.layout ?? "document"}
    >
      <MarkdownEditorImplementation key={props.documentKey} {...props} />
    </section>
  )
}
