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

import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { MARKDOWN_EDITOR_THEME } from "./editor-theme"
import {
  $convertFromEfmMarkdownString,
  analyzeEfmMarkdown,
} from "../markdown/efm-document"
import { resolveEfmResourceUri } from "../markdown/efm-uri"
import { unsupportedMarkdownFeaturesFromDiagnostics } from "../markdown/markdown-support"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import { EIDOS_MARKDOWN_PLUGIN_REGISTRY } from "../plugin-system/builtins"
import { MARKDOWN_FEATURES } from "../plugin-system/feature-ids"
import type { CompiledMarkdownPlugins } from "../plugin-system/plugin-api"
import { BlockMarqueeSelectionPlugin } from "../plugins/block-marquee-selection-plugin"
import { ClipboardImagePlugin } from "../plugins/clipboard-image-plugin"
import { CodeHighlightPlugin } from "../plugins/code-highlight-plugin"
import { EditorShortcutsPlugin } from "../plugins/editor-shortcuts-plugin"
import { InsertBlockPlugin } from "../plugins/insert-block-plugin"
import { InternalNavigationPlugin } from "../plugins/internal-navigation-plugin"
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
  mathBlock: "Block equation",
  inlineMath: "Inline equation",
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

function MarkdownDiagnostics({
  markdown,
  inputProfile,
  baseUri,
  onEfmDiagnostics,
  onUnsupportedMarkdown,
  syntaxFeatures,
}: Pick<
  MarkdownEditorProps,
  | "markdown"
  | "inputProfile"
  | "baseUri"
  | "onEfmDiagnostics"
  | "onUnsupportedMarkdown"
> & { syntaxFeatures: ReadonlySet<string> }) {
  useEffect(() => {
    if (!onEfmDiagnostics && !onUnsupportedMarkdown) return

    let cancelled = false
    const analyze = () => {
      if (cancelled) return
      const analysis = analyzeEfmMarkdown(markdown, {
        inputProfile,
        baseUri,
        syntaxFeatures,
      })
      if (cancelled) return
      onEfmDiagnostics?.(analysis.diagnostics)
      const unsupported = unsupportedMarkdownFeaturesFromDiagnostics(
        analysis.diagnostics
      )
      if (unsupported.length > 0) onUnsupportedMarkdown?.(unsupported)
    }
    const idleWindow = window as Window & {
      cancelIdleCallback?(handle: number): void
      requestIdleCallback?(
        callback: () => void,
        options?: { timeout: number }
      ): number
    }
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(analyze, { timeout: 250 })
      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback?.(handle)
      }
    }
    const handle = window.setTimeout(analyze, 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [
    baseUri,
    inputProfile,
    markdown,
    onEfmDiagnostics,
    onUnsupportedMarkdown,
    syntaxFeatures,
  ])
  return null
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
  registry,
}: MarkdownEditorProps & { registry: CompiledMarkdownPlugins }) {
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
      nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
      theme: MARKDOWN_EDITOR_THEME,
      editorState: () => {
        $convertFromEfmMarkdownString(markdown, registry.transformers, {
          inputProfile,
          baseUri,
          syntaxFeatures: registry.features,
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
            <FloatingToolbarPlugin
              items={registry.toolbar}
              labels={resolvedLabels}
            />
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
                    "list-item.toggle-checked",
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
            <InternalNavigationPlugin />
            {registry.features.has(MARKDOWN_FEATURES.image) ? (
              <ClipboardImagePlugin
                baseUri={baseUri}
                documentKey={documentKey}
                onError={handleError}
                onPasteImage={onPasteImage}
                readOnly={readOnly}
              />
            ) : null}
            <HistoryPlugin />
            <EditorShortcutsPlugin />
            {registry.features.has(MARKDOWN_FEATURES.list) ? (
              <>
                <ListPlugin />
                <ListItemShortcutsPlugin />
                <TabIndentationPlugin />
              </>
            ) : null}
            {registry.features.has(MARKDOWN_FEATURES.gfmTaskList) ? (
              <CheckListPlugin />
            ) : null}
            {registry.features.has(MARKDOWN_FEATURES.gfmTable) ? (
              <TablePlugin
                hasCellMerge={false}
                hasCellBackgroundColor={false}
              />
            ) : null}
            {registry.features.has(MARKDOWN_FEATURES.link) ? (
              <LinkPlugin
                validateUrl={(url) => resolveActiveLink(url, baseUri) !== null}
              />
            ) : null}
            {registry.features.has(MARKDOWN_FEATURES.thematicBreak) ? (
              <HorizontalRulePlugin />
            ) : null}
            {codeHighlightTokenizer === false ||
            !registry.features.has(MARKDOWN_FEATURES.code) ? null : (
              <CodeHighlightPlugin
                onError={handleError}
                tokenizer={codeHighlightTokenizer}
              />
            )}
            <MarkdownShortcutPlugin transformers={[...registry.transformers]} />
            {!readOnly && showToolbar ? (
              <InsertBlockPlugin
                inputProfile={inputProfile}
                insertions={registry.insertions}
                labels={resolvedLabels}
                onError={handleError}
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
              syntaxFeatures={registry.features}
              transformers={registry.transformers}
            />
            {registry.behaviors.map(({ component: Behavior, id, pluginId }) => (
              <Behavior
                key={`${pluginId}:${id}`}
                baseUri={baseUri}
                documentKey={documentKey}
                inputProfile={inputProfile}
                labels={resolvedLabels}
                onError={handleError}
                readOnly={readOnly}
              />
            ))}
            {autoFocus && !readOnly ? <AutoFocusPlugin /> : null}
          </div>
        </div>
      </LexicalComposer>
    </EfmSourceBlockProvider>
  )
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const registry = useMemo(
    () =>
      props.plugins
        ? compileMarkdownPlugins(props.plugins)
        : EIDOS_MARKDOWN_PLUGIN_REGISTRY,
    [props.plugins]
  )
  return (
    <section
      className={`eme-editor${props.className ? ` ${props.className}` : ""}`}
      data-markdown-editor="wysiwyg"
      data-theme={props.theme ?? "light"}
      data-layout={props.layout ?? "document"}
    >
      <MarkdownDiagnostics {...props} syntaxFeatures={registry.features} />
      <MarkdownShortcutProvider
        definitions={registry.shortcuts}
        overrides={props.shortcuts}
      >
        <MarkdownEditorImplementation
          key={`${props.documentKey}:${registry.signature}`}
          {...props}
          registry={registry}
        />
      </MarkdownShortcutProvider>
    </section>
  )
}
