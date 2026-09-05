import { useCallback, useEffect, useMemo } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"

import { MARKDOWN_EDITOR_CORE_NODES } from "../nodes/node-registry"
import { MARKDOWN_EDITOR_THEME } from "./editor-theme"
import { resolveEditorInteractions } from "./interactions"
import { resolveEfmResourceUri } from "../markdown/efm-uri"
import {
  findObsidianHeadingTarget,
  parseObsidianMarkdownLinkDestination,
} from "../markdown/obsidian-internal-link"
import { unsupportedMarkdownFeaturesFromDiagnostics } from "../markdown/markdown-support"
import { compileMarkdownPlugins } from "../plugin-system/plugin-compiler"
import { EIDOS_MARKDOWN_PLUGIN_REGISTRY } from "../plugin-system/builtins"
import { MARKDOWN_FEATURES } from "../plugin-system/feature-ids"
import type { CompiledMarkdownPlugins } from "../plugin-system/plugin-api"
import {
  eidosMarkdownProfile,
  gfmMarkdownProfile,
  obsidianMarkdownProfile,
} from "../profile-system/builtins"
import type {
  MarkdownProfile,
  MarkdownProfileCodec,
} from "../profile-system/profile-api"
import { BlockMarqueeSelectionPlugin } from "../plugins/block-marquee-selection-plugin"
import { ClipboardImagePlugin } from "../plugins/clipboard-image-plugin"
import { EditorShortcutsPlugin } from "../plugins/editor-shortcuts-plugin"
import { TextFormatPolicyPlugin } from "../plugins/text-format-policy-plugin"
import { InsertBlockPlugin } from "../plugins/insert-block-plugin"
import { InternalNavigationPlugin } from "../plugins/internal-navigation-plugin"
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
  codec,
}: Pick<
  MarkdownEditorProps,
  | "markdown"
  | "inputProfile"
  | "baseUri"
  | "onEfmDiagnostics"
  | "onUnsupportedMarkdown"
> & {
  syntaxFeatures: ReadonlySet<string>
  codec: MarkdownProfileCodec
}) {
  useEffect(() => {
    if (!onEfmDiagnostics && !onUnsupportedMarkdown) return

    let cancelled = false
    const analyze = () => {
      if (cancelled) return
      const analysis = codec.analyze(markdown, {
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
    codec,
  ])
  return null
}

function RequestedInternalNavigationPlugin({
  navigationTarget: target,
}: Pick<MarkdownEditorProps, "navigationTarget">) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (!target?.heading && !target?.blockId) return
    let frame = 0
    let attempts = 0
    const locate = () => {
      const root = editor.getRootElement()
      const match = target.blockId
        ? root?.querySelector(
            `[data-obsidian-block-id="${CSS.escape(target.blockId)}"]`
          )
        : target.heading && root
          ? findObsidianHeadingTarget(root, target.heading)
          : null
      if (match instanceof HTMLElement) {
        match.scrollIntoView({ block: "center" })
        match.focus({ preventScroll: true })
        return
      }
      attempts += 1
      if (attempts < 20) frame = window.requestAnimationFrame(locate)
    }
    frame = window.requestAnimationFrame(locate)
    return () => window.cancelAnimationFrame(frame)
  }, [editor, target])
  return null
}

function MarkdownEditorImplementation({
  documentKey,
  markdown,
  onMarkdownChange,
  onSaveRequest,
  onOpenExternalUrl,
  onOpenInternalLink,
  navigationTarget,
  onPasteImage,
  resolveImageUrl,
  onError,
  labels,
  placeholder = "Write with Markdown…",
  ariaLabel = "Markdown editor",
  readOnly = false,
  autoFocus = false,
  showToolbar = true,
  interactions,
  codeHighlightTokenizer,
  inputProfile = "document",
  baseUri,
  registry,
  profile,
}: MarkdownEditorProps & {
  registry: CompiledMarkdownPlugins
  profile: MarkdownProfile
}) {
  const { ariaKeys } = useMarkdownShortcuts()
  const controls = resolveEditorInteractions(interactions, showToolbar)
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
        profile.codec.import(markdown, registry.transformers, {
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
      codec={profile.codec}
      documentKey={documentKey}
      markdown={markdown}
      onError={handleError}
      resolveImageUrl={resolveImageUrl}
      onOpenInternalLink={onOpenInternalLink}
      baseUri={baseUri}
      codeHighlightTokenizer={codeHighlightTokenizer}
      inputProfile={inputProfile}
      syntaxFeatures={registry.features}
      transformers={registry.transformers}
      saveBlockLabel={resolvedLabels.saveBlock}
      emptyMathBlockLabel={resolvedLabels.emptyMathBlock}
      emptyImageBlockLabel={resolvedLabels.emptyImageBlock}
      obsidianWikilinks={registry.features.has(
        MARKDOWN_FEATURES.obsidianWikilink
      )}
      readOnly={readOnly}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div className="eme-editor-shell">
          {!readOnly && controls.toolbar ? (
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
              const internalTarget = registry.features.has(
                MARKDOWN_FEATURES.obsidianWikilink
              )
                ? parseObsidianMarkdownLinkDestination(rawDestination)
                : null
              if (internalTarget) {
                if (!readOnly && !(event.metaKey || event.ctrlKey)) return
                event.preventDefault()
                if (!onOpenInternalLink) return
                try {
                  void Promise.resolve(
                    onOpenInternalLink({
                      documentKey,
                      ...internalTarget,
                      embed: false,
                      syntax: "markdown",
                    })
                  ).catch((cause) =>
                    handleError(
                      cause instanceof Error ? cause : new Error(String(cause))
                    )
                  )
                } catch (cause) {
                  handleError(
                    cause instanceof Error ? cause : new Error(String(cause))
                  )
                }
                return
              }
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
                  aria-keyshortcuts={ariaKeys(
                    (
                      [
                        "document.save",
                        "history.undo",
                        "history.redo",
                        "format.bold",
                        "format.italic",
                        "insert.open-menu",
                        "selection.clear",
                        "selection.enter-block",
                        "selection.extend-up",
                        "selection.extend-down",
                        "selection.edit-source",
                        "selection.select-all-blocks",
                        "list-item.move-up",
                        "list-item.move-down",
                        "list-item.toggle-checked",
                      ] as const
                    ).filter(
                      (id) =>
                        (id !== "insert.open-menu" || controls.insertMenu) &&
                        (!id.startsWith("selection.") ||
                          controls.blockSelection)
                    )
                  )}
                />
              }
              placeholder={
                <div className="eme-placeholder" aria-hidden="true">
                  {placeholder}
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            {controls.blockSelection ? <BlockMarqueeSelectionPlugin /> : null}
            <InternalNavigationPlugin />
            <RequestedInternalNavigationPlugin
              navigationTarget={navigationTarget}
            />
            {registry.features.has(MARKDOWN_FEATURES.image) ||
            registry.features.has(MARKDOWN_FEATURES.obsidianAttachment) ? (
              <ClipboardImagePlugin
                baseUri={baseUri}
                documentKey={documentKey}
                onError={handleError}
                onPasteImage={onPasteImage}
                readOnly={readOnly}
              />
            ) : null}
            <HistoryPlugin />
            <EditorShortcutsPlugin
              allowEmphasis={registry.features.has(MARKDOWN_FEATURES.emphasis)}
            />
            <TextFormatPolicyPlugin transformers={registry.transformers} />
            {registry.features.has(MARKDOWN_FEATURES.link) ? (
              <LinkPlugin
                validateUrl={(url) =>
                  resolveActiveLink(url, baseUri) !== null ||
                  (registry.features.has(MARKDOWN_FEATURES.obsidianWikilink) &&
                    parseObsidianMarkdownLinkDestination(url) !== null)
                }
              />
            ) : null}
            <MarkdownShortcutPlugin transformers={[...registry.transformers]} />
            {!readOnly && (controls.insertMenu || controls.blockDrag) ? (
              <InsertBlockPlugin
                key={`${controls.insertMenu}:${controls.blockDrag}`}
                enableMenu={controls.insertMenu}
                enableDrag={controls.blockDrag}
                inputProfile={inputProfile}
                insertions={registry.insertions}
                blockBoundaries={registry.blockBoundaries}
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
              codec={profile.codec}
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
                codeHighlightTokenizer={codeHighlightTokenizer}
                syntaxFeatures={registry.features}
                transformers={registry.transformers}
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
  if (props.profile && props.preset)
    throw new Error("Provide preset or profile, not both.")
  const selectedProfile = props.preset ?? props.profile
  if (selectedProfile && props.plugins) {
    throw new Error(
      "MarkdownEditor accepts either a document profile or a plugin list, not both."
    )
  }
  const profile =
    selectedProfile === "obsidian"
      ? obsidianMarkdownProfile
      : selectedProfile === "gfm"
        ? gfmMarkdownProfile
        : selectedProfile === "eidos" || !selectedProfile
          ? eidosMarkdownProfile
          : selectedProfile
  const registry = useMemo(
    () =>
      props.plugins
        ? compileMarkdownPlugins(props.plugins)
        : selectedProfile
          ? compileMarkdownPlugins(profile.plugins)
          : EIDOS_MARKDOWN_PLUGIN_REGISTRY,
    [profile, props.plugins, selectedProfile]
  )
  const sessionProfile = useMemo<MarkdownProfile>(
    () => ({
      ...profile,
      codec: {
        analyze: (source, options) =>
          profile.codec.analyze(source, {
            ...options,
            blockSyntax: registry.blockSyntax,
            inlineSyntax: registry.inlineSyntax,
          }),
        import: (source, transformers, options, node) =>
          profile.codec.import(
            source,
            transformers,
            {
              ...options,
              blockSyntax: registry.blockSyntax,
              inlineSyntax: registry.inlineSyntax,
            },
            node
          ),
        export: (transformers, node) =>
          profile.codec.export(transformers, node),
      },
    }),
    [profile, registry]
  )
  return (
    <section
      className={`eme-editor${props.className ? ` ${props.className}` : ""}`}
      data-markdown-editor="wysiwyg"
      data-markdown-document-key={props.documentKey}
      data-markdown-profile={profile.id}
      data-theme={props.theme ?? "light"}
      data-layout={props.layout ?? "document"}
    >
      <MarkdownDiagnostics
        {...props}
        syntaxFeatures={registry.features}
        codec={sessionProfile.codec}
      />
      <MarkdownShortcutProvider
        definitions={registry.shortcuts}
        overrides={props.shortcuts}
      >
        <MarkdownEditorImplementation
          key={`${props.documentKey}:${profile.id}@${profile.version}:${registry.signature}`}
          {...props}
          registry={registry}
          profile={sessionProfile}
        />
      </MarkdownShortcutProvider>
    </section>
  )
}
