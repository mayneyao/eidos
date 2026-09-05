import { InlineMathView, MathPreview } from "../features/math/view"
import { ACTIVE_HTML } from "../core/html-safety"
import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react"
import {
  isDeniedEfmUri,
  resolveEfmImagePresentationUri,
  resolveEfmResourceUri,
} from "../markdown/efm-uri"
import {
  parseFrontmatterPresentation,
  type FrontmatterPresentationValue,
} from "../markdown/frontmatter-presentation"
import { parseReferenceDefinitionSource } from "../markdown/reference-definition"
import {
  findObsidianHeadingTarget,
  parseObsidianWikilink,
} from "../markdown/obsidian-internal-link"
import type { EfmInlineData, EfmBlockData } from "../nodes/efm-semantic-data"
import {
  EXTERNAL_MARKDOWN_CONFLICT_MESSAGE,
  useEfmSourceBlockContext,
} from "./efm-source-block-context"

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

/** Splits rendered Markdown text without reinterpreting code or link elements. */
export function parseObsidianPreviewText(
  value: string
): Array<string | EfmInlineData> {
  const parts: Array<string | EfmInlineData> = []
  let cursor = 0
  for (const match of value.matchAll(/(!?)\[\[([^\]\n]+)\]\]/gu)) {
    const start = match.index
    if (start === undefined) continue
    if (start > cursor) parts.push(value.slice(cursor, start))
    const source = match[0]
    const embed = match[1] === "!"
    const target = parseObsidianWikilink(`[[${match[2]}]]`)
    if (!target) {
      parts.push(source)
      cursor = start + source.length
      continue
    }
    const dimensions = embed
      ? (target.displayText?.match(/^(\d+)(?:x(\d+))?$/u) ?? null)
      : null
    parts.push({
      kind: embed ? "obsidian-embed" : "obsidian-link",
      source,
      target: target.target,
      path: target.path,
      ...(target.heading ? { heading: target.heading } : {}),
      ...(target.blockId ? { blockId: target.blockId } : {}),
      ...(target.displayText && !dimensions
        ? { label: target.displayText }
        : {}),
      ...(dimensions ? { width: Number(dimensions[1]) } : {}),
      ...(dimensions?.[2] ? { height: Number(dimensions[2]) } : {}),
    })
    cursor = start + source.length
  }
  if (cursor < value.length) parts.push(value.slice(cursor))
  return parts.length > 0 ? parts : [value]
}

function renderHtmlNode(
  node: ChildNode,
  key: string,
  baseUri?: string,
  obsidianWikilinks = false,
  protectedText = false
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!obsidianWikilinks || protectedText) return node.textContent
    return parseObsidianPreviewText(node.textContent ?? "").map((part, index) =>
      typeof part === "string"
        ? part
        : createElement(ObsidianInlinePreview, {
            data: part,
            key: `${key}-obsidian-${index}`,
          })
    )
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (DROPPED_HTML_TAGS.has(tag)) return null
  const children = Array.from(element.childNodes).map((child, index) =>
    renderHtmlNode(
      child,
      `${key}-${index}`,
      baseUri,
      obsidianWikilinks,
      protectedText ||
        tag === "a" ||
        tag === "code" ||
        tag === "kbd" ||
        tag === "pre"
    )
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
  const { baseUri, obsidianWikilinks } = useEfmSourceBlockContext()
  const content = useMemo(() => {
    if (typeof DOMParser === "undefined") return html
    const document = new DOMParser().parseFromString(html, "text/html")
    return Array.from(document.body.childNodes).map((node, index) =>
      renderHtmlNode(node, String(index), baseUri, obsidianWikilinks)
    )
  }, [baseUri, html, obsidianWikilinks])
  return <>{content}</>
}

function FrontmatterWikilink({
  value,
}: {
  value: Extract<FrontmatterPresentationValue, { kind: "wikilink" }>
}) {
  const { documentKey, onError, onOpenInternalLink } =
    useEfmSourceBlockContext()
  const openLink = () => {
    if (!value.path) {
      const root = document
        .querySelector(
          `[data-markdown-document-key="${CSS.escape(documentKey)}"]`
        )
        ?.closest(".eme-editor")
      const target = value.blockId
        ? root?.querySelector(
            `[data-obsidian-block-id="${CSS.escape(value.blockId)}"]`
          )
        : value.heading && root
          ? findObsidianHeadingTarget(root, value.heading)
          : null
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "center" })
        target.focus({ preventScroll: true })
        return
      }
    }
    if (!onOpenInternalLink) return
    try {
      void Promise.resolve(
        onOpenInternalLink({
          documentKey,
          target: value.target,
          path: value.path,
          ...(value.heading ? { heading: value.heading } : {}),
          ...(value.blockId ? { blockId: value.blockId } : {}),
          ...(value.displayText ? { displayText: value.displayText } : {}),
          embed: false,
          syntax: "wikilink",
        })
      ).catch((cause) =>
        onError(cause instanceof Error ? cause : new Error(String(cause)))
      )
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error(String(cause)))
    }
  }

  return (
    <button
      type="button"
      className="eme-link eme-obsidian-link eme-efm-metadata-link"
      data-obsidian-target={value.target}
      onClick={openLink}
    >
      {value.displayText || value.target}
    </button>
  )
}

function FrontmatterValuePreview({
  value,
}: {
  value: FrontmatterPresentationValue
}): JSX.Element {
  switch (value.kind) {
    case "empty":
      return <span className="eme-efm-metadata-empty">—</span>
    case "scalar":
      return (
        <span data-efm-metadata-value-type={value.type}>{value.value}</span>
      )
    case "url":
      return (
        <a className="eme-link eme-efm-metadata-link" href={value.href}>
          {value.value}
        </a>
      )
    case "wikilink":
      return <FrontmatterWikilink value={value} />
    case "sequence":
      return value.items.length > 0 ? (
        <ul className="eme-efm-metadata-sequence">
          {value.items.map((item, index) => (
            <li key={index}>
              <FrontmatterValuePreview value={item} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="eme-efm-metadata-empty">—</span>
      )
    case "mapping":
      return value.entries.length > 0 ? (
        <span className="eme-efm-metadata-mapping">
          {value.entries.map((entry) => (
            <span className="eme-efm-metadata-mapping-entry" key={entry.key}>
              <strong>{entry.key}</strong>
              <FrontmatterValuePreview value={entry.value} />
            </span>
          ))}
        </span>
      ) : (
        <span className="eme-efm-metadata-empty">—</span>
      )
  }
}

function FrontmatterPreview({ source }: { source: string }) {
  const { obsidianWikilinks } = useEfmSourceBlockContext()
  const presentation = useMemo(
    () => parseFrontmatterPresentation(source, { obsidianWikilinks }),
    [obsidianWikilinks, source]
  )
  const entries = presentation.error
    ? [
        {
          key: "Invalid YAML",
          value: {
            kind: "scalar" as const,
            type: "string" as const,
            value: presentation.error,
          },
        },
      ]
    : presentation.entries

  return (
    <section
      className="eme-efm-frontmatter eme-efm-block-surface"
      aria-label="Document metadata"
    >
      <div className="eme-efm-semantic-header">
        <span>Document metadata</span>
      </div>
      {entries.length > 0 ? (
        <dl className="eme-efm-metadata-properties">
          {entries.map(({ key, value }) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>
                <FrontmatterValuePreview value={value} />
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <span className="eme-efm-empty-metadata">No metadata</span>
      )}
    </section>
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

const OBSIDIAN_IMAGE_PATH = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/iu

function useOpenObsidianLink(data: EfmInlineData): () => void {
  const { documentKey, onError, onOpenInternalLink } =
    useEfmSourceBlockContext()
  return useCallback(() => {
    const request = {
      documentKey,
      target: data.target ?? "",
      path: data.path ?? "",
      ...(data.heading ? { heading: data.heading } : {}),
      ...(data.blockId ? { blockId: data.blockId } : {}),
      ...(data.label ? { displayText: data.label } : {}),
      embed: data.kind === "obsidian-embed",
      syntax: "wikilink" as const,
    }
    if (!request.path) {
      const root = document
        .querySelector(
          `[data-markdown-document-key="${CSS.escape(documentKey)}"]`
        )
        ?.closest(".eme-editor")
      const target = request.blockId
        ? root?.querySelector(
            `[data-obsidian-block-id="${CSS.escape(request.blockId)}"]`
          )
        : request.heading && root
          ? findObsidianHeadingTarget(root, request.heading)
          : null
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "center" })
        target.focus({ preventScroll: true })
        return
      }
    }
    if (!onOpenInternalLink) return
    try {
      void Promise.resolve(onOpenInternalLink(request)).catch((cause) =>
        onError(errorFrom(cause))
      )
    } catch (cause) {
      onError(errorFrom(cause))
    }
  }, [data, documentKey, onError, onOpenInternalLink])
}

function ObsidianInlinePreview({ data }: { data: EfmInlineData }) {
  const imagePath =
    data.kind === "obsidian-embed" &&
    data.path &&
    OBSIDIAN_IMAGE_PATH.test(data.path)
      ? data.path
      : undefined
  const imageUrl = useResolvedImageUrl(imagePath, data.resolvedUrl)
  const openInternalLink = useOpenObsidianLink(data)

  if (data.kind === "obsidian-link") {
    return (
      <button
        type="button"
        className="eme-link eme-obsidian-link"
        data-obsidian-target={data.target}
        onClick={openInternalLink}
      >
        {data.label || data.target}
      </button>
    )
  }

  return imageUrl ? (
    <span className="eme-obsidian-embed eme-obsidian-image-embed">
      <img
        src={imageUrl}
        alt={data.label ?? data.path ?? ""}
        width={data.width}
        height={data.height}
        loading="lazy"
      />
    </span>
  ) : (
    <button
      type="button"
      className="eme-obsidian-embed eme-obsidian-embed-placeholder"
      data-obsidian-target={data.target}
      onClick={openInternalLink}
    >
      {data.label || data.target}
    </button>
  )
}

export function EfmInlineView({
  data,
  onSaveMath,
}: {
  data: EfmInlineData
  onSaveMath(value: string): void
}) {
  const { externalMarkdownConflict, readOnly, registerDraft, saveBlockLabel } =
    useEfmSourceBlockContext()
  const imageUrl = useResolvedImageUrl(
    data.kind === "image" ? data.url : undefined,
    data.kind === "image" ? data.resolvedUrl : undefined
  )
  switch (data.kind) {
    case "autolink":
      return data.resolvedUrl ? (
        <a
          className="eme-link eme-efm-reference-link"
          href={data.resolvedUrl}
          title={data.title}
        >
          {data.label || data.url}
        </a>
      ) : (
        <span className="eme-efm-reference-link" aria-disabled="true">
          {data.label || data.url}
        </span>
      )
    case "denied-link":
      return (
        <span className="eme-efm-denied-link" title="Blocked unsafe link">
          {data.source}
        </span>
      )
    case "math":
      return (
        <InlineMathView
          value={data.value ?? ""}
          readOnly={readOnly}
          registerDraft={registerDraft}
          saveBlockLabel={saveBlockLabel}
          conflictMessage={
            externalMarkdownConflict
              ? EXTERNAL_MARKDOWN_CONFLICT_MESSAGE
              : undefined
          }
          onSave={onSaveMath}
        />
      )
    case "image":
      return imageUrl ? (
        <span className="eme-efm-image">
          <img
            src={imageUrl}
            alt={data.alt ?? ""}
            title={data.title}
            width={data.width}
            height={data.height}
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
    case "obsidian-link":
    case "obsidian-embed":
      return <ObsidianInlinePreview data={data} />
    case "obsidian-block-id":
      return (
        <span
          id={`obsidian-block-${data.identifier}`}
          className="eme-obsidian-block-id"
          data-obsidian-block-id={data.identifier}
          title={`Block ID: ${data.identifier}`}
        >
          ^{data.identifier}
        </span>
      )
    case "obsidian-comment":
      return (
        <span className="eme-obsidian-comment" title={data.value}>
          %%
        </span>
      )
    case "obsidian-inline-footnote":
      return (
        <sup className="eme-obsidian-inline-footnote" title={data.value}>
          note
        </sup>
      )
    case "obsidian-tag":
      return <span className="eme-obsidian-tag">#{data.value}</span>
  }
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

export function EfmBlockView({ data }: { data: EfmBlockData }) {
  const { emptyImageBlockLabel, emptyMathBlockLabel } =
    useEfmSourceBlockContext()
  const [calloutCollapsed, setCalloutCollapsed] = useState(
    data.kind === "obsidian-callout" && data.calloutFold === "-"
  )
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
              width={data.width}
              height={data.height}
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
    case "commonmark-container":
      return (
        <div
          className="eme-efm-html-preview eme-efm-block-surface"
          data-efm-commonmark-container="true"
          contentEditable={false}
        >
          <SafeHtmlPreview html={data.previewHtml ?? ""} />
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
    case "obsidian-callout": {
      const metadata = data
      const fold = metadata.calloutFold
      return (
        <aside
          className="eme-obsidian-callout eme-efm-block-surface"
          data-callout={metadata.calloutType ?? "note"}
          data-collapsible={fold ? "true" : undefined}
          contentEditable={false}
        >
          <div className="eme-obsidian-callout-title">
            {fold ? (
              <button
                type="button"
                aria-expanded={!calloutCollapsed}
                onClick={() => setCalloutCollapsed((value) => !value)}
              >
                <span aria-hidden="true">{calloutCollapsed ? "▸" : "▾"}</span>
                {metadata.calloutTitle}
              </button>
            ) : (
              <span>{metadata.calloutTitle}</span>
            )}
          </div>
          {calloutCollapsed ? null : (
            <div className="eme-obsidian-callout-body">
              <SafeHtmlPreview html={metadata.previewHtml ?? ""} />
            </div>
          )}
        </aside>
      )
    }
  }
}
