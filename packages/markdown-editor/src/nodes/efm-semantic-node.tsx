import {
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import katex from "katex"
import { micromark } from "micromark"
import { gfm } from "micromark-extension-gfm"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DecoratorNode,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalCommand,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import { parseDocument } from "yaml"

import {
  isDeniedEfmUri,
  resolveEfmImagePresentationUri,
  resolveEfmResourceUri,
} from "../markdown/efm-uri"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import { EfmBlockSelection } from "../ui/efm-block-selection"
import { useEfmSourceBlockContext } from "../ui/efm-source-block-context"

export type EfmInlineKind =
  | "footnote-reference"
  | "image"
  | "math"
  | "reference-link"

export interface EfmInlineData {
  kind: EfmInlineKind
  source: string
  value?: string
  url?: string
  resolvedUrl?: string
  alt?: string
  title?: string
  label?: string
  labelHtml?: string
  identifier?: string
  number?: number
  referenceId?: string
}

export type EfmBlockKind =
  | "footnote-definition"
  | "frontmatter"
  | "image"
  | "math"
  | "raw-html"
  | "reference-definition"

export interface EfmBlockData {
  kind: EfmBlockKind
  source: string
  value?: string
  previewHtml?: string
  label?: string
  identifier?: string
  number?: number
  referenceIds?: string[]
  url?: string
  resolvedUrl?: string
  alt?: string
  title?: string
}

export const OPEN_EFM_BLOCK_EDITOR_COMMAND: LexicalCommand<NodeKey> =
  createCommand("OPEN_EFM_BLOCK_EDITOR_COMMAND")

type SerializedEfmInlineNode = Spread<
  { data: EfmInlineData },
  SerializedLexicalNode
>

type SerializedEfmBlockNode = Spread<
  { data: EfmBlockData },
  SerializedDecoratorBlockNode
>

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
])

const DROPPED_HTML_TAGS = new Set([
  "base",
  "button",
  "embed",
  "form",
  "iframe",
  "input",
  "link",
  "meta",
  "noembed",
  "noframes",
  "object",
  "option",
  "plaintext",
  "script",
  "select",
  "style",
  "textarea",
  "title",
  "xmp",
])

function identifierId(identifier: string): string {
  return `efm-footnote-${encodeURIComponent(identifier).replace(/%/gu, "-")}`
}

function renderHtmlNode(
  node: ChildNode,
  key: string,
  baseUri?: string
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (DROPPED_HTML_TAGS.has(tag)) return null
  const children = Array.from(element.childNodes).map((child, index) =>
    renderHtmlNode(child, `${key}-${index}`, baseUri)
  )
  if (!ALLOWED_HTML_TAGS.has(tag)) {
    return createElement(Fragment, { key }, ...children)
  }

  const props: Record<string, unknown> = { key }
  if (tag === "a") {
    const href = element.getAttribute("href")
    const resolved = href ? resolveEfmResourceUri(href, baseUri) : null
    if (resolved) props.href = resolved
    else props["aria-disabled"] = true
    const title = element.getAttribute("title")
    if (title) props.title = title
  } else if (tag === "img") {
    const src = element.getAttribute("src")
    const resolved = src
      ? resolveEfmResourceUri(src, baseUri, { image: true })
      : null
    if (!resolved) {
      return createElement(
        "span",
        { className: "eme-efm-image-unavailable", key },
        element.getAttribute("alt") || "Image unavailable"
      )
    }
    props.src = resolved
    props.alt = element.getAttribute("alt") ?? ""
    props.loading = "lazy"
    const title = element.getAttribute("title")
    if (title) props.title = title
  } else if (tag === "ol") {
    const start = Number(element.getAttribute("start"))
    if (Number.isInteger(start)) props.start = start
  } else if (tag === "details" && element.hasAttribute("open")) {
    props.open = true
  } else if (tag === "td" || tag === "th") {
    const colSpan = Number(element.getAttribute("colspan"))
    const rowSpan = Number(element.getAttribute("rowspan"))
    if (Number.isInteger(colSpan) && colSpan > 0 && colSpan <= 100) {
      props.colSpan = colSpan
    }
    if (Number.isInteger(rowSpan) && rowSpan > 0 && rowSpan <= 100) {
      props.rowSpan = rowSpan
    }
  }
  return createElement(tag, props, ...children)
}

function SafeHtmlPreview({ html }: { html: string }) {
  const { baseUri } = useEfmSourceBlockContext()
  const content = useMemo(() => {
    if (typeof DOMParser === "undefined") return html
    const document = new DOMParser().parseFromString(html, "text/html")
    return Array.from(document.body.childNodes).map((node, index) =>
      renderHtmlNode(node, String(index), baseUri)
    )
  }, [baseUri, html])
  return <>{content}</>
}

function MathPreview({ display, value }: { display: boolean; value: string }) {
  const rendered = useMemo(
    () =>
      katex.renderToString(value, {
        displayMode: display,
        output: "mathml",
        strict: "ignore",
        throwOnError: false,
        trust: false,
      }),
    [display, value]
  )
  return (
    <span
      className={display ? "eme-efm-math-display" : "eme-efm-math-inline"}
      data-efm-math-source={value}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  )
}

function EditBlockButton({ onClick }: { onClick(): void }) {
  const { editBlockLabel, readOnly } = useEfmSourceBlockContext()
  if (readOnly) return null
  return (
    <button type="button" className="eme-efm-semantic-action" onClick={onClick}>
      {editBlockLabel}
    </button>
  )
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null) return "null"
  if (value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function FrontmatterPreview({
  onEdit,
  source,
}: {
  onEdit(): void
  source: string
}) {
  const entries = useMemo(() => {
    const body = source.replace(/^---\n/u, "").replace(/\n---$/u, "")
    const document = parseDocument(body)
    if (document.errors.length > 0) {
      return [["Invalid YAML", document.errors[0].message]]
    }
    const value: unknown = document.toJS()
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).map(([key, entry]) => [
          key,
          formatMetadataValue(entry),
        ])
      : []
  }, [source])

  return (
    <section
      className="eme-efm-frontmatter eme-efm-block-surface"
      aria-label="Document metadata"
    >
      <div className="eme-efm-semantic-header">
        <span>Document metadata</span>
        <EditBlockButton onClick={onEdit} />
      </div>
      {entries.length > 0 ? (
        <dl>
          {entries.map(([key, value]) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <span className="eme-efm-empty-metadata">No metadata</span>
      )}
    </section>
  )
}

function inlineMathSourceFromValue(source: string, value: string): string {
  if (source.startsWith("\\(") && source.endsWith("\\)")) {
    return `\\(${value}\\)`
  }
  return `$${value}$`
}

function MathComposer({
  display,
  draft,
  onCancel,
  onChange,
  onSave,
}: {
  display: boolean
  draft: string
  onCancel(): void
  onChange(value: string): void
  onSave(): void
}) {
  const { saveBlockLabel } = useEfmSourceBlockContext()
  const { ariaKeys, label: shortcutLabel, matches } = useMarkdownShortcuts()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const commitShortcut = display
    ? ("block-editor.commit" as const)
    : ("composer.confirm" as const)
  const commitHint = shortcutLabel(commitShortcut)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="eme-efm-math-composer"
      data-display={display}
      data-efm-editor-interactive="true"
      contentEditable={false}
    >
      <textarea
        ref={inputRef}
        aria-label={display ? "Edit block formula" : "Edit inline formula"}
        aria-keyshortcuts={ariaKeys([commitShortcut, "overlay.dismiss"])}
        rows={display ? 3 : 1}
        value={draft}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (matches(event, "overlay.dismiss")) {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
            return
          }
          if (matches(event, commitShortcut)) {
            event.preventDefault()
            event.stopPropagation()
            onSave()
          }
        }}
      />
      <button
        type="button"
        data-primary="true"
        title={
          commitHint ? `${saveBlockLabel} (${commitHint})` : saveBlockLabel
        }
        onClick={onSave}
      >
        {saveBlockLabel}{" "}
        {commitHint ? <span aria-hidden="true">{commitHint}</span> : null}
      </button>
    </div>
  )
}

function EmptyBlockPrompt({
  kind,
  label,
}: {
  kind: "image" | "math"
  label: string
}) {
  return (
    <span className="eme-efm-empty-block-copy">
      {kind === "math" ? (
        <span className="eme-efm-empty-block-glyph" aria-hidden="true">
          T<sub>E</sub>X
        </span>
      ) : (
        <svg
          className="eme-efm-empty-block-icon"
          aria-hidden="true"
          viewBox="0 0 24 24"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m5 18 5-5 3 3 2-2 4 4" />
        </svg>
      )}
      <span>{label}</span>
    </span>
  )
}

function ImageComposer({
  alt,
  onAltChange,
  onCancel,
  onSave,
  onUrlChange,
  url,
}: {
  alt: string
  onAltChange(value: string): void
  onCancel(): void
  onSave(): void
  onUrlChange(value: string): void
  url: string
}) {
  const { imageAltLabel, imageUrlLabel, saveBlockLabel } =
    useEfmSourceBlockContext()
  const { ariaKeys, label: shortcutLabel, matches } = useMarkdownShortcuts()
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmHint = shortcutLabel("composer.confirm")

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (matches(event, "overlay.dismiss")) {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }
    if (matches(event, "composer.confirm") && url.trim()) {
      event.preventDefault()
      event.stopPropagation()
      onSave()
    }
  }

  return (
    <div
      className="eme-efm-image-composer"
      data-efm-editor-interactive="true"
      contentEditable={false}
    >
      <label>
        <span>{imageUrlLabel}</span>
        <input
          ref={inputRef}
          type="url"
          aria-keyshortcuts={ariaKeys(["composer.confirm", "overlay.dismiss"])}
          inputMode="url"
          value={url}
          placeholder="https://…"
          onChange={(event) => onUrlChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label>
        <span>{imageAltLabel}</span>
        <input
          type="text"
          aria-keyshortcuts={ariaKeys(["composer.confirm", "overlay.dismiss"])}
          value={alt}
          onChange={(event) => onAltChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </label>
      <button
        type="button"
        disabled={!url.trim()}
        title={
          confirmHint ? `${saveBlockLabel} (${confirmHint})` : saveBlockLabel
        }
        onClick={onSave}
      >
        {saveBlockLabel}{" "}
        {confirmHint ? <span aria-hidden="true">{confirmHint}</span> : null}
      </button>
    </div>
  )
}

function InlineMathView({
  data,
  editor,
  nodeKey,
}: {
  data: EfmInlineData
  editor: LexicalEditor
  nodeKey: NodeKey
}) {
  const { editBlockLabel, readOnly } = useEfmSourceBlockContext()
  const { ariaKeys, matches } = useMarkdownShortcuts()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.value ?? "")

  useEffect(() => {
    if (readOnly) setEditing(false)
  }, [readOnly])

  const startEditing = () => {
    if (readOnly) return
    setDraft(data.value ?? "")
    setEditing(true)
  }
  const save = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isEfmInlineNode(node)) {
        const current = node.getData()
        node.setData({
          ...current,
          source: inlineMathSourceFromValue(current.source, draft),
          value: draft,
        })
      }
    })
    setEditing(false)
  }

  return (
    <span className="eme-efm-inline-math" data-editing={editing || undefined}>
      <span
        className="eme-efm-math-preview-trigger"
        data-efm-editor-interactive="true"
        role={readOnly ? undefined : "button"}
        tabIndex={readOnly ? undefined : 0}
        aria-label={readOnly ? undefined : editBlockLabel}
        aria-keyshortcuts={
          readOnly ? undefined : ariaKeys("inline-atom.activate")
        }
        onClick={startEditing}
        onKeyDown={(event) => {
          if (matches(event, "inline-atom.activate")) {
            event.preventDefault()
            startEditing()
          }
        }}
      >
        <MathPreview
          display={false}
          value={editing ? draft : (data.value ?? "")}
        />
      </span>
      {editing ? (
        <MathComposer
          display={false}
          draft={draft}
          onCancel={() => setEditing(false)}
          onChange={setDraft}
          onSave={save}
        />
      ) : null}
    </span>
  )
}

function errorFrom(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

function useResolvedImageUrl(
  markdownUrl?: string,
  fallbackUrl?: string
): string | undefined {
  const { documentKey, onError, resolveImageUrl } = useEfmSourceBlockContext()
  const [hostUrl, setHostUrl] = useState<string>()

  useEffect(() => {
    setHostUrl(undefined)
    if (!markdownUrl || !resolveImageUrl || isDeniedEfmUri(markdownUrl)) return

    const controller = new AbortController()
    try {
      void Promise.resolve(
        resolveImageUrl({
          documentKey,
          markdownUrl,
          signal: controller.signal,
        })
      )
        .then((candidate) => {
          if (controller.signal.aborted || candidate === null) return
          const resolved = resolveEfmImagePresentationUri(candidate)
          if (!resolved) {
            onError(
              new Error(
                "resolveImageUrl must return a blob, http, or https URL."
              )
            )
            return
          }
          setHostUrl(resolved)
        })
        .catch((cause) => {
          if (!controller.signal.aborted) onError(errorFrom(cause))
        })
    } catch (cause) {
      onError(errorFrom(cause))
    }
    return () => controller.abort()
  }, [documentKey, markdownUrl, onError, resolveImageUrl])

  return hostUrl ?? fallbackUrl
}

function EfmInlineView({
  data,
  editor,
  nodeKey,
}: {
  data: EfmInlineData
  editor: LexicalEditor
  nodeKey: NodeKey
}) {
  const imageUrl = useResolvedImageUrl(
    data.kind === "image" ? data.url : undefined,
    data.kind === "image" ? data.resolvedUrl : undefined
  )
  switch (data.kind) {
    case "math":
      return <InlineMathView data={data} editor={editor} nodeKey={nodeKey} />
    case "image":
      return imageUrl ? (
        <span className="eme-efm-image">
          <img
            src={imageUrl}
            alt={data.alt ?? ""}
            title={data.title}
            loading="lazy"
          />
        </span>
      ) : (
        <span className="eme-efm-image-unavailable" role="img">
          {data.alt || "Image unavailable"}
        </span>
      )
    case "footnote-reference":
      return (
        <sup id={data.referenceId} className="eme-efm-footnote-reference">
          <a href={`#${identifierId(data.identifier ?? "")}`}>
            {data.number ?? "?"}
          </a>
        </sup>
      )
    case "reference-link":
      return data.resolvedUrl ? (
        <a
          className="eme-link eme-efm-reference-link"
          href={data.resolvedUrl}
          title={data.title}
        >
          {data.labelHtml ? (
            <SafeHtmlPreview html={data.labelHtml} />
          ) : (
            data.label
          )}
        </a>
      ) : (
        <span className="eme-efm-reference-link" aria-disabled="true">
          {data.labelHtml ? (
            <SafeHtmlPreview html={data.labelHtml} />
          ) : (
            data.label
          )}
        </span>
      )
  }
}

const ACTIVE_HTML =
  /<(?:script|iframe|object|embed|style|link|meta|base|title|textarea|xmp|noembed|noframes|plaintext|form|input|button|select)\b|\son[a-z]+\s*=|(?:javascript|vbscript)\s*:/iu

function markdownPreviewHtml(source: string): string {
  return micromark(source, {
    allowDangerousHtml: true,
    extensions: [gfm()],
  })
}

function mathValueFromSource(source: string): string {
  const lines = source.split("\n")
  if (/^ {0,3}\$\$$/u.test(lines[0] ?? "")) {
    return /^ {0,3}\$\$$/u.test(lines.at(-1) ?? "")
      ? lines.slice(1, -1).join("\n")
      : lines.slice(1).join("\n")
  }
  const fence = lines[0]?.match(
    /^ {0,3}((?:`{3,})|(?:~{3,}))math(?:[ \t].*)?$/u
  )
  return fence ? lines.slice(1, -1).join("\n") : source
}

function blockMathSourceFromValue(source: string, value: string): string {
  const lines = source.split("\n")
  const opening = lines[0] ?? ""
  if (/^ {0,3}\$\$$/u.test(opening)) {
    const closing = /^ {0,3}\$\$$/u.test(lines.at(-1) ?? "")
      ? (lines.at(-1) ?? "$$")
      : "$$"
    return `${opening}\n${value}\n${closing}`
  }
  const fence = opening.match(/^ {0,3}((?:`{3,})|(?:~{3,}))math(?:[ \t].*)?$/u)
  if (fence) {
    const marker = fence[1] ?? "```"
    const closing = (lines.at(-1) ?? "").startsWith(marker[0] ?? "`")
      ? (lines.at(-1) ?? marker)
      : marker
    return `${opening}\n${value}\n${closing}`
  }
  return `$$\n${value}\n$$`
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().replace(/\s+/gu, " ").toLowerCase()
}

function imageDataFromSource(
  data: EfmBlockData,
  source: string,
  baseUri?: string
): EfmBlockData {
  const match = source.match(
    /^!\[((?:\\.|[^\]])*)\]\(\s*(?:<([^>]+)>|(\S+?))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*\)$/u
  )
  const url = match?.[2] ?? match?.[3] ?? data.url ?? ""
  const title = match?.[4] ?? match?.[5] ?? match?.[6]
  return {
    ...data,
    source,
    url,
    resolvedUrl:
      resolveEfmResourceUri(url, baseUri, { image: true }) ?? undefined,
    alt: (match?.[1] ?? data.alt ?? "").replace(/\\([\\\]])/gu, "$1"),
    ...(title ? { title } : { title: undefined }),
  }
}

function blockDataFromSource(
  data: EfmBlockData,
  source: string,
  baseUri?: string
): EfmBlockData {
  switch (data.kind) {
    case "math":
      return { ...data, source, value: mathValueFromSource(source) }
    case "footnote-definition": {
      const match = source.match(/^\[\^([^\]\n]+)\]:[ \t]?/u)
      const label = match?.[1] ?? data.label ?? "note"
      const body = source
        .slice(match?.[0].length ?? 0)
        .replace(/\n {1,4}/gu, "\n")
      return {
        ...data,
        source,
        label,
        identifier: normalizeIdentifier(label),
        previewHtml: markdownPreviewHtml(body),
      }
    }
    case "raw-html":
      return { ...data, source, previewHtml: markdownPreviewHtml(source) }
    case "image":
      return imageDataFromSource(data, source, baseUri)
    case "reference-definition": {
      const identifier = source.match(/^\[([^\]\n]+)\]:/u)?.[1]
      return {
        ...data,
        source,
        ...(identifier ? { identifier: normalizeIdentifier(identifier) } : {}),
      }
    }
    case "frontmatter":
      return { ...data, source }
  }
}

function referenceDefinitionPreview(source: string): {
  destination: string
  label: string
} {
  const match = source.match(/^\[([^\]\n]+)\]:[ \t]*(\S+)/u)
  return {
    label: match?.[1] ?? "reference",
    destination: match?.[2] ?? source,
  }
}

function BlockEditor({
  draft,
  kind,
  onCancel,
  onChange,
  onSave,
}: {
  draft: string
  kind: EfmBlockKind
  onCancel(): void
  onChange(value: string): void
  onSave(): void
}) {
  const { editBlockLabel, saveBlockLabel, cancelBlockEditLabel } =
    useEfmSourceBlockContext()
  const { ariaKeys, matches } = useMarkdownShortcuts()
  return (
    <div
      className="eme-efm-block-editor eme-efm-block-surface"
      data-efm-editor-interactive="true"
      contentEditable={false}
    >
      <textarea
        autoFocus
        aria-label={`${editBlockLabel}: ${kind}`}
        aria-keyshortcuts={ariaKeys(["block-editor.commit", "overlay.dismiss"])}
        value={draft}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (matches(event, "block-editor.commit")) {
            event.preventDefault()
            onSave()
          }
          if (matches(event, "overlay.dismiss")) {
            event.preventDefault()
            onCancel()
          }
        }}
      />
      <div className="eme-efm-block-editor-actions">
        <button type="button" onClick={onCancel}>
          {cancelBlockEditLabel}
        </button>
        <button type="button" data-primary="true" onClick={onSave}>
          {saveBlockLabel}
        </button>
      </div>
    </div>
  )
}

function EfmBlockView({
  data,
  editor,
  nodeKey,
}: {
  data: EfmBlockData
  editor: LexicalEditor
  nodeKey: NodeKey
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.source)
  const [imageAltDraft, setImageAltDraft] = useState(data.alt ?? "")
  const {
    baseUri,
    editBlockLabel,
    emptyImageBlockLabel,
    emptyMathBlockLabel,
    readOnly,
  } = useEfmSourceBlockContext()
  const imageUrl = useResolvedImageUrl(
    data.kind === "image" ? data.url : undefined,
    data.kind === "image" ? data.resolvedUrl : undefined
  )
  useEffect(() => {
    if (readOnly) setEditing(false)
  }, [readOnly])

  const startEditing = useCallback(() => {
    if (readOnly) return
    setDraft(
      data.kind === "math"
        ? (data.value ?? "")
        : data.kind === "image"
          ? (data.url ?? "")
          : data.source
    )
    if (data.kind === "image") setImageAltDraft(data.alt ?? "")
    setEditing(true)
  }, [data, readOnly])

  useEffect(
    () =>
      editor.registerCommand(
        OPEN_EFM_BLOCK_EDITOR_COMMAND,
        (requestedKey) => {
          if (requestedKey !== nodeKey || readOnly) return false
          startEditing()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
    [editor, nodeKey, readOnly, startEditing]
  )

  const save = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isEfmBlockNode(node)) {
        const current = node.getData()
        let source = draft
        if (current.kind === "math") {
          source = blockMathSourceFromValue(current.source, draft)
        } else if (current.kind === "image") {
          const url = draft.trim()
          if (!url) return
          const alt = imageAltDraft.trim()
          const escapedAlt = alt
            .replace(/\\/gu, "\\\\")
            .replace(/\x5d/gu, "\\]")
          const title = current.title
            ? ` \"${current.title.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}\"`
            : ""
          source = `![${escapedAlt}](<${url}>${title})`
        }
        node.setData(blockDataFromSource(current, source, baseUri))
      }
    })
    setEditing(false)
  }

  if (editing && data.kind !== "math" && data.kind !== "image") {
    return (
      <BlockEditor
        draft={draft}
        kind={data.kind}
        onCancel={() => setEditing(false)}
        onChange={setDraft}
        onSave={save}
      />
    )
  }

  switch (data.kind) {
    case "frontmatter":
      return <FrontmatterPreview source={data.source} onEdit={startEditing} />
    case "math": {
      const visibleValue = editing ? draft : (data.value ?? "")
      const empty = !visibleValue.trim()
      const preview = empty ? (
        <EmptyBlockPrompt kind="math" label={emptyMathBlockLabel} />
      ) : (
        <MathPreview display value={visibleValue} />
      )
      return (
        <div
          className="eme-efm-semantic-block eme-efm-block-surface eme-efm-math-block"
          data-editing={editing || undefined}
          data-empty={empty || undefined}
          contentEditable={false}
        >
          {readOnly ? (
            <div className="eme-efm-math-preview-trigger">{preview}</div>
          ) : (
            <button
              type="button"
              className="eme-efm-math-preview-trigger"
              data-efm-editor-interactive="true"
              aria-label={
                empty ? emptyMathBlockLabel : `${editBlockLabel} formula`
              }
              onClick={startEditing}
            >
              {preview}
            </button>
          )}
          {editing ? (
            <MathComposer
              display
              draft={draft}
              onCancel={() => setEditing(false)}
              onChange={setDraft}
              onSave={save}
            />
          ) : empty ? null : (
            <EditBlockButton onClick={startEditing} />
          )}
        </div>
      )
    }
    case "image": {
      const empty = !data.url?.trim()
      return (
        <figure
          className="eme-efm-image-block eme-efm-block-surface"
          data-efm-image-block="true"
          data-editing={editing || undefined}
          data-empty={empty || undefined}
          contentEditable={false}
        >
          {empty ? (
            readOnly ? (
              <div className="eme-efm-image-placeholder">
                <EmptyBlockPrompt kind="image" label={emptyImageBlockLabel} />
              </div>
            ) : (
              <button
                type="button"
                className="eme-efm-image-placeholder"
                data-efm-editor-interactive="true"
                aria-label={emptyImageBlockLabel}
                onClick={startEditing}
              >
                <EmptyBlockPrompt kind="image" label={emptyImageBlockLabel} />
              </button>
            )
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={data.alt ?? ""}
              title={data.title}
              loading="lazy"
            />
          ) : (
            <span className="eme-efm-image-unavailable" role="img">
              {data.alt || "Image unavailable"}
            </span>
          )}
          {!empty && data.alt ? <figcaption>{data.alt}</figcaption> : null}
          {editing ? (
            <ImageComposer
              alt={imageAltDraft}
              url={draft}
              onAltChange={setImageAltDraft}
              onCancel={() => setEditing(false)}
              onSave={save}
              onUrlChange={setDraft}
            />
          ) : empty ? null : (
            <EditBlockButton onClick={startEditing} />
          )}
        </figure>
      )
    }
    case "footnote-definition":
      return (
        <aside
          id={identifierId(data.identifier ?? "")}
          className="eme-efm-footnote-definition eme-efm-block-surface"
          data-footnote-number={data.number}
          contentEditable={false}
        >
          <div className="eme-efm-footnote-navigation">
            <span className="eme-efm-footnote-number">
              {data.number ?? "?"}
            </span>
            {(data.referenceIds ?? []).map((referenceId, index) => (
              <a
                key={referenceId}
                href={`#${referenceId}`}
                aria-label={`Return to footnote reference ${index + 1}`}
              >
                ↩
                {data.referenceIds && data.referenceIds.length > 1
                  ? index + 1
                  : ""}
              </a>
            ))}
          </div>
          <div className="eme-efm-footnote-body">
            <SafeHtmlPreview html={data.previewHtml ?? ""} />
          </div>
          <EditBlockButton onClick={startEditing} />
        </aside>
      )
    case "raw-html":
      return (
        <div
          className="eme-efm-html-preview eme-efm-block-surface"
          data-efm-html-preview="true"
          contentEditable={false}
        >
          {ACTIVE_HTML.test(data.source) ? (
            <pre className="eme-efm-html-fallback">{data.source}</pre>
          ) : (
            <SafeHtmlPreview html={data.previewHtml ?? ""} />
          )}
          <EditBlockButton onClick={startEditing} />
        </div>
      )
    case "reference-definition": {
      const reference = referenceDefinitionPreview(data.source)
      return (
        <div
          className="eme-efm-reference-definition eme-efm-block-surface"
          data-efm-reference-definition={data.identifier}
          contentEditable={false}
        >
          <span>[{reference.label}]</span>
          <code>{reference.destination}</code>
          <EditBlockButton onClick={startEditing} />
        </div>
      )
    }
  }
}

export class EfmInlineNode extends DecoratorNode<JSX.Element> {
  __data: EfmInlineData

  static getType(): string {
    return "efm-inline"
  }

  static clone(node: EfmInlineNode): EfmInlineNode {
    return new EfmInlineNode({ ...node.__data }, node.__key)
  }

  static importJSON(serializedNode: SerializedEfmInlineNode): EfmInlineNode {
    return $createEfmInlineNode(serializedNode.data)
  }

  constructor(data: EfmInlineData, key?: NodeKey) {
    super(key)
    this.__data = data
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("span")
    element.className = "eme-efm-inline-shell"
    element.contentEditable = "false"
    return element
  }

  updateDOM(): false {
    return false
  }

  exportJSON(): SerializedEfmInlineNode {
    return {
      ...super.exportJSON(),
      data: { ...this.getData() },
      type: "efm-inline",
      version: 1,
    }
  }

  getData(): EfmInlineData {
    return this.getLatest().__data
  }

  setData(data: EfmInlineData): this {
    const writable = this.getWritable()
    writable.__data = data
    return writable
  }

  getTextContent(): string {
    return this.getData().source
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <EfmInlineView
        data={this.getData()}
        editor={editor}
        nodeKey={this.getKey()}
      />
    )
  }
}

export class EfmBlockNode extends DecoratorBlockNode {
  __data: EfmBlockData

  static getType(): string {
    return "efm-block"
  }

  static clone(node: EfmBlockNode): EfmBlockNode {
    return new EfmBlockNode({ ...node.__data }, node.__format, node.__key)
  }

  static importJSON(serializedNode: SerializedEfmBlockNode): EfmBlockNode {
    return $createEfmBlockNode(serializedNode.data).setFormat(
      serializedNode.format
    )
  }

  constructor(data: EfmBlockData, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__data = data
  }

  exportJSON(): SerializedEfmBlockNode {
    return {
      ...super.exportJSON(),
      data: { ...this.getData() },
      type: "efm-block",
      version: 1,
    }
  }

  getData(): EfmBlockData {
    return this.getLatest().__data
  }

  setData(data: EfmBlockData): this {
    const writable = this.getWritable()
    writable.__data = data
    return writable
  }

  getTextContent(): string {
    return this.getData().source
  }

  decorate(editor: LexicalEditor): JSX.Element {
    const nodeKey = this.getKey()
    return (
      <>
        <EfmBlockSelection editor={editor} nodeKey={nodeKey} />
        <EfmBlockView data={this.getData()} editor={editor} nodeKey={nodeKey} />
      </>
    )
  }
}

export function $createEfmInlineNode(data: EfmInlineData): EfmInlineNode {
  return $applyNodeReplacement(new EfmInlineNode(data))
}

export function $isEfmInlineNode(
  node: LexicalNode | null | undefined
): node is EfmInlineNode {
  return node instanceof EfmInlineNode
}

export function $createEfmBlockNode(data: EfmBlockData): EfmBlockNode {
  return $applyNodeReplacement(new EfmBlockNode(data))
}

export function $isEfmBlockNode(
  node: LexicalNode | null | undefined
): node is EfmBlockNode {
  return node instanceof EfmBlockNode
}
