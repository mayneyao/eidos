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
  DecoratorNode,
  type EditorConfig,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import {
  createElement,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react"
import { parseDocument } from "yaml"

import {
  isDeniedEfmUri,
  resolveEfmImagePresentationUri,
  resolveEfmResourceUri,
} from "../markdown/efm-uri"
import { parseReferenceDefinitionSource } from "../markdown/reference-definition"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import { EfmBlockSelection } from "../ui/efm-block-selection"
import {
  EXTERNAL_MARKDOWN_CONFLICT_MESSAGE,
  useEfmSourceBlockContext,
} from "../ui/efm-source-block-context"

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

function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null) return "null"
  if (value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function FrontmatterPreview({ source }: { source: string }) {
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
  draft,
  onCancel,
  onChange,
  onSave,
}: {
  draft: string
  onCancel(): void
  onChange(value: string): void
  onSave(): void
}) {
  const { saveBlockLabel } = useEfmSourceBlockContext()
  const { ariaKeys, label: shortcutLabel, matches } = useMarkdownShortcuts()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const commitShortcut = "composer.confirm" as const
  const commitHint = shortcutLabel(commitShortcut)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="eme-efm-math-composer"
      data-efm-editor-interactive="true"
      contentEditable={false}
    >
      <textarea
        ref={inputRef}
        aria-label="Edit inline equation"
        aria-keyshortcuts={ariaKeys([commitShortcut, "overlay.dismiss"])}
        rows={1}
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

function InlineMathView({
  data,
  editor,
  nodeKey,
}: {
  data: EfmInlineData
  editor: LexicalEditor
  nodeKey: NodeKey
}) {
  const { externalMarkdownConflict, readOnly, registerDraft } =
    useEfmSourceBlockContext()
  const { ariaKeys, matches } = useMarkdownShortcuts()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.value ?? "")

  useEffect(() => {
    if (readOnly) setEditing(false)
  }, [readOnly])

  useEffect(() => {
    if (!editing) return
    return registerDraft()
  }, [editing, registerDraft])

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
        aria-label={readOnly ? undefined : "Open inline equation editor"}
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
        <>
          <MathComposer
            draft={draft}
            onCancel={() => setEditing(false)}
            onChange={setDraft}
            onSave={save}
          />
          {externalMarkdownConflict ? (
            <span className="eme-efm-block-editor-error" role="alert">
              {EXTERNAL_MARKDOWN_CONFLICT_MESSAGE}
            </span>
          ) : null}
        </>
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

function referenceDefinitionPreview(source: string): {
  destination: string
  label: string
} {
  const definition = parseReferenceDefinitionSource(source)
  return {
    label: definition?.label ?? "reference",
    destination: definition?.destination ?? source,
  }
}

function EfmBlockView({ data }: { data: EfmBlockData }) {
  const { emptyImageBlockLabel, emptyMathBlockLabel } =
    useEfmSourceBlockContext()
  const imageUrl = useResolvedImageUrl(
    data.kind === "image" ? data.url : undefined,
    data.kind === "image" ? data.resolvedUrl : undefined
  )
  switch (data.kind) {
    case "frontmatter":
      return <FrontmatterPreview source={data.source} />
    case "math": {
      const value = data.value ?? ""
      const empty = !value.trim()
      const preview = empty ? (
        <EmptyBlockPrompt kind="math" label={emptyMathBlockLabel} />
      ) : (
        <MathPreview display value={value} />
      )
      return (
        <div
          className="eme-efm-semantic-block eme-efm-block-surface eme-efm-math-block"
          data-empty={empty || undefined}
          contentEditable={false}
        >
          <div className="eme-efm-math-preview-trigger">{preview}</div>
        </div>
      )
    }
    case "image": {
      const empty = !data.url?.trim()
      return (
        <figure
          className="eme-efm-image-block eme-efm-block-surface"
          data-efm-image-block="true"
          data-empty={empty || undefined}
          contentEditable={false}
        >
          {empty ? (
            <div className="eme-efm-image-placeholder">
              <EmptyBlockPrompt kind="image" label={emptyImageBlockLabel} />
            </div>
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
        <EfmBlockView data={this.getData()} />
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
