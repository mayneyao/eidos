import { useCallback, useEffect, useMemo } from "react"
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

import { MARKDOWN_EDITOR_NODES } from "../nodes/node-registry"
import { MARKDOWN_EDITOR_THEME } from "./editor-theme"
import {
  $convertFromEfmMarkdownString,
  analyzeEfmMarkdown,
} from "../markdown/efm-document"
import { resolveEfmResourceUri } from "../markdown/efm-uri"
import { unsupportedMarkdownFeaturesFromDiagnostics } from "../markdown/markdown-support"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "../markdown/markdown-transformers"
import { BlockMarqueeSelectionPlugin } from "../plugins/block-marquee-selection-plugin"
import { ClipboardImagePlugin } from "../plugins/clipboard-image-plugin"
import { CodeHighlightPlugin } from "../plugins/code-highlight-plugin"
import { EditorShortcutsPlugin } from "../plugins/editor-shortcuts-plugin"
import { InsertBlockPlugin } from "../plugins/insert-block-plugin"
import { ListItemShortcutsPlugin } from "../plugins/list-item-shortcuts-plugin"
import { MarkdownStatePlugin } from "../plugins/markdown-state-plugin"
import { FloatingToolbarPlugin } from "../plugins/toolbar-plugin"
import {
  MarkdownShortcutProvider,
  useMarkdownShortcuts,
} from "../shortcuts/shortcut-context"
import type { MarkdownEditorLabels, MarkdownEditorProps } from "../types"
import { EfmSourceBlockProvider } from "../ui/efm-source-block-context"

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
  highlight: "Highlight",
  inlineCode: "Inline code",
  undo: "Undo",
  redo: "Redo",
  editBlock: "Edit block",
  saveBlock: "Done",
  cancelBlockEdit: "Cancel",
  insertBlock: "Insert block",
  insertInline: "Insert inline",
  addBlockBelow: "Add block below",
  dragBlock: "Drag block",
  insert: "Insert",
  basicBlocks: "Basic",
  extendedBlocks: "Rich content",
  mathBlock: "Formula",
  inlineMath: "Inline formula",
  frontmatter: "Document properties",
  image: "Image",
  footnote: "Footnote",
  rawHtml: "HTML",
  table: "Table",
  divider: "Divider",
  frontmatterAlreadyExists: "Already added",
  backToInsertMenu: "Back to insert menu",
  imageUrl: "Image URL",
  imageAlt: "Description",
  emptyMathBlock: "Add a TeX equation",
  emptyImageBlock: "Add an image",
  frontmatterYaml: "Properties (YAML)",
  footnoteText: "Footnote text",
  htmlSource: "HTML",
  formulaSource: "LaTeX",
  filterBlocks: "Filter blocks",
  filterInline: "Filter inline commands",
  noMatchingBlocks: "No matching blocks",
  noMatchingInlineCommands: "No matching inline commands",
  insertMenuHint: "Type / on an empty line to open this menu",
  inlineMenuHint: "Type / after a space to open this menu",
}

function resolveActiveLink(url: string, baseUri?: string): string | null {
  return resolveEfmResourceUri(url, baseUri)
}

function MarkdownEditorImplementation({
  documentKey,
  markdown,
  onMarkdownChange,
  onSaveRequest,
  onOpenExternalUrl,
  onPasteImage,
  resolveImageUrl,
  onError,
  labels,
  placeholder = "Write with Markdown…",
  ariaLabel = "Markdown editor",
  readOnly = false,
  autoFocus = false,
  showToolbar = true,
  codeHighlightTokenizer,
  inputProfile = "document",
  baseUri,
}: MarkdownEditorProps) {
  const { ariaKeys } = useMarkdownShortcuts()
  const resolvedLabels = useMemo(
    () => ({ ...DEFAULT_LABELS, ...labels }),
    [labels]
  )
  const handleError = useCallback(
    (error: Error) => {
      if (onError) onError(error)
      else console.error(error)
    },
    [onError]
  )
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "EidosMarkdownEditor",
      editable: !readOnly,
      nodes: [...MARKDOWN_EDITOR_NODES],
      theme: MARKDOWN_EDITOR_THEME,
      editorState: () => {
        $convertFromEfmMarkdownString(markdown, EIDOS_MARKDOWN_TRANSFORMERS, {
          inputProfile,
          baseUri,
        })
      },
      onError: handleError,
    }),
    []
  )

  return (
    <EfmSourceBlockProvider
      documentKey={documentKey}
      onError={handleError}
      resolveImageUrl={resolveImageUrl}
      baseUri={baseUri}
      editBlockLabel={resolvedLabels.editBlock}
      saveBlockLabel={resolvedLabels.saveBlock}
      cancelBlockEditLabel={resolvedLabels.cancelBlockEdit}
      imageUrlLabel={resolvedLabels.imageUrl}
      imageAltLabel={resolvedLabels.imageAlt}
      emptyMathBlockLabel={resolvedLabels.emptyMathBlock}
      emptyImageBlockLabel={resolvedLabels.emptyImageBlock}
      readOnly={readOnly}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div className="eme-editor-shell">
          {!readOnly && showToolbar ? (
            <FloatingToolbarPlugin labels={resolvedLabels} />
          ) : null}
          <div
            className="eme-editor-stage"
            onClickCapture={(event) => {
              const anchor = (
                event.target as Element
              ).closest<HTMLAnchorElement>("a[href]")
              if (!anchor) return
              if (!readOnly && !(event.metaKey || event.ctrlKey)) return
              const rawDestination = anchor.getAttribute("href") ?? ""
              if (rawDestination.startsWith("#")) return
              event.preventDefault()
              const destination = resolveActiveLink(rawDestination, baseUri)
              if (!destination || !onOpenExternalUrl) return
              try {
                void Promise.resolve(onOpenExternalUrl(destination)).catch(
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
                  aria-keyshortcuts={ariaKeys([
                    "document.save",
                    "history.undo",
                    "history.redo",
                    "format.bold",
                    "format.italic",
                    "insert.open-menu",
                    "selection.clear",
                    "list-item.move-up",
                    "list-item.move-down",
                  ])}
                />
              }
              placeholder={
                <div className="eme-placeholder" aria-hidden="true">
                  {placeholder}
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <BlockMarqueeSelectionPlugin />
            <ClipboardImagePlugin
              baseUri={baseUri}
              documentKey={documentKey}
              onError={handleError}
              onPasteImage={onPasteImage}
              readOnly={readOnly}
            />
            <HistoryPlugin />
            <EditorShortcutsPlugin />
            <ListPlugin />
            <ListItemShortcutsPlugin />
            <CheckListPlugin />
            <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} />
            <LinkPlugin
              validateUrl={(url) => resolveActiveLink(url, baseUri) !== null}
            />
            <HorizontalRulePlugin />
            {codeHighlightTokenizer === false ? null : (
              <CodeHighlightPlugin
                onError={handleError}
                tokenizer={codeHighlightTokenizer}
              />
            )}
            <TabIndentationPlugin />
            <MarkdownShortcutPlugin
              transformers={[...EIDOS_MARKDOWN_TRANSFORMERS]}
            />
            {!readOnly && showToolbar ? (
              <InsertBlockPlugin
                inputProfile={inputProfile}
                labels={resolvedLabels}
              />
            ) : null}
            <MarkdownStatePlugin
              markdown={markdown}
              readOnly={readOnly}
              onMarkdownChange={onMarkdownChange}
              onSaveRequest={onSaveRequest}
              onError={handleError}
              inputProfile={inputProfile}
              baseUri={baseUri}
            />
            {autoFocus && !readOnly ? <AutoFocusPlugin /> : null}
          </div>
        </div>
      </LexicalComposer>
    </EfmSourceBlockProvider>
  )
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const analysis = useMemo(
    () =>
      analyzeEfmMarkdown(props.markdown, {
        inputProfile: props.inputProfile,
        baseUri: props.baseUri,
      }),
    [props.baseUri, props.inputProfile, props.markdown]
  )
  const unsupported = useMemo(
    () => unsupportedMarkdownFeaturesFromDiagnostics(analysis.diagnostics),
    [analysis.diagnostics]
  )
  useEffect(() => {
    if (unsupported.length > 0) props.onUnsupportedMarkdown?.(unsupported)
  }, [props.onUnsupportedMarkdown, unsupported])

  useEffect(() => {
    props.onEfmDiagnostics?.(analysis.diagnostics)
  }, [analysis.diagnostics, props.onEfmDiagnostics])

  return (
    <section
      className={`eme-editor${props.className ? ` ${props.className}` : ""}`}
      data-markdown-editor="wysiwyg"
      data-theme={props.theme ?? "light"}
      data-layout={props.layout ?? "document"}
    >
      <MarkdownShortcutProvider overrides={props.shortcuts}>
        <MarkdownEditorImplementation key={props.documentKey} {...props} />
      </MarkdownShortcutProvider>
    </section>
  )
}
