import { toHast } from "mdast-util-to-hast"
import { toHtml } from "hast-util-to-html"
import { fromHtml } from "hast-util-from-html"
import { raw } from "hast-util-raw"
import { sanitizeDocument } from "./html"
import { safeUrl } from "./url"
import { ACTIVE_HTML } from "../core/html-safety"
import { findHeadingIndex } from "../markdown/obsidian-internal-link"
import type { Element, ElementContent, Properties } from "hast"
import type { Root, Nodes } from "mdast"
import { renderMath } from "../features/math/render"
import { parseCallout } from "../features/vault-blocks/callout"
import { vaultInlineMatches } from "../features/vault-inline/semantics"
import { obsidianImagePresentation } from "../markdown/obsidian-image-presentation"
import {
  parseFrontmatterPresentation,
  type FrontmatterPresentationValue,
} from "../markdown/frontmatter-presentation"
import type { SemanticToken } from "../syntax/range-extension"
import type { EidosExtensionId } from "../syntax/presets"

export interface StaticLinkTarget {
  target: string
  path: string
  heading?: string
  blockId?: string
}
export interface RenderContext {
  source: string
  extensions: readonly EidosExtensionId[]
  resolveInternalLink?: (target: StaticLinkTarget) => string | null
  renderFragment: (source: string) => string
}
const text = (value: string): ElementContent => ({ type: "text", value })
const el = (
  tagName: string,
  children: ElementContent[] = [],
  properties: Properties = {}
): Element => ({ type: "element", tagName, properties, children })

interface DeferredSemantic {
  type: "eidosSemantic"
  semantic: SemanticToken
}
declare module "hast" {
  interface RootContentMap {
    eidosSemantic: DeferredSemantic
  }
  interface ElementContentMap {
    eidosSemantic: DeferredSemantic
  }
}
function internalLink(
  target: StaticLinkTarget,
  label: string,
  context: RenderContext
): Element {
  // Cross-document links require a publisher mapping; never guess private paths.
  const candidate =
    context.resolveInternalLink?.(target) ??
    (!target.path && target.blockId
      ? `#obsidian-block-${target.blockId}`
      : null)
  const href = candidate && safeUrl(candidate)
  return el(
    href ? "a" : "span",
    [text(label)],
    href
      ? { href, className: ["eme-link"] }
      : { className: ["eme-obsidian-link"], ariaDisabled: "true" }
  )
}
function frontmatterValue(
  value: FrontmatterPresentationValue,
  context: RenderContext
): ElementContent {
  switch (value.kind) {
    case "empty":
      return text("—")
    case "scalar":
      return text(value.value)
    case "url":
      return el("a", [text(value.value)], { href: value.href })
    case "wikilink":
      return internalLink(value, value.displayText || value.target, context)
    case "sequence":
      return el(
        "ul",
        value.items.map((item) => el("li", [frontmatterValue(item, context)]))
      )
    case "mapping":
      return el(
        "dl",
        value.entries.flatMap((entry) => [
          el("dt", [text(entry.key)]),
          el("dd", [frontmatterValue(entry.value, context)]),
        ])
      )
  }
}
function fragment(html: string): ElementContent[] {
  return fromHtml(html, { fragment: true }).children.filter(
    (node): node is ElementContent => node.type !== "doctype"
  )
}
function semantic(node: SemanticToken, context: RenderContext): ElementContent {
  const source = node.value
  switch (node.syntax) {
    case "math":
      return el("span", fragment(renderMath(source.slice(1, -1), false)), {
        className: ["eme-efm-math-inline"],
      })
    case "math-block": {
      const lines = source.split("\n")
      if (lines.length < 2 || !/^ {0,3}\$\$$/u.test(lines.at(-1) ?? ""))
        return el("pre", [text(source)])
      return el(
        "div",
        fragment(renderMath(lines.slice(1, -1).join("\n"), true)),
        { className: ["eme-efm-math-display"] }
      )
    }
    case "highlight":
      return el(
        "mark",
        fragment(context.renderFragment(source.slice(2, -2))).flatMap((node) =>
          node.type === "element" && node.tagName === "p"
            ? node.children
            : [node]
        )
      )
    case "frontmatter": {
      const data = parseFrontmatterPresentation(source, {
        obsidianWikilinks: context.extensions.includes("markdown.wikilink"),
      })
      return data.error
        ? el("pre", [text(source)])
        : el(
            "section",
            [
              el(
                "dl",
                data.entries.flatMap((entry) => [
                  el("dt", [text(entry.key)]),
                  el("dd", [frontmatterValue(entry.value, context)]),
                ])
              ),
            ],
            {
              className: ["eme-efm-frontmatter"],
              ariaLabel: "Document metadata",
            }
          )
    }
    default: {
      const data = vaultInlineMatches(source, () => true, []).find(
        (match) => match.data.kind === node.syntax
      )?.data
      if (!data)
        throw new Error(`Missing static semantic handler for ${node.syntax}`)
      switch (data.kind) {
        case "obsidian-link":
          return internalLink(
            {
              target: data.target ?? "",
              path: data.path ?? "",
              heading: data.heading,
              blockId: data.blockId,
            },
            data.label || data.target || source,
            context
          )
        case "obsidian-comment":
          return text("")
        case "obsidian-block-id":
          return el("span", [], {
            id: `obsidian-block-${data.identifier}`,
            className: ["eme-obsidian-block-id"],
          })
        case "obsidian-tag":
          return el("span", [text(`#${data.value}`)], {
            className: ["eme-obsidian-tag"],
          })
        case "obsidian-inline-footnote":
          return el("sup", [text("note")], {
            title: data.value,
            className: ["eme-obsidian-inline-footnote"],
          })
        default:
          throw new Error(`Unhandled inline semantics: ${data.kind}`)
      }
    }
  }
}

export const STATIC_EXTENSION_SUPPORT = {
  "eidos.math": "semantic",
  "eidos.footnote": "grammar",
  "eidos.frontmatter": "semantic",
  "eidos.highlight": "semantic",
  "markdown.wikilink": "semantic",
  "markdown.tag": "semantic",
  "markdown.comment": "semantic",
  "markdown.block-id": "semantic",
  "markdown.inline-footnote": "semantic",
  "markdown.callout": "blockquote",
  "markdown.attachment": "image",
  "markdown.vault-link": "link",
} satisfies Record<EidosExtensionId, string>

export function renderDocument(tree: Root, context: RenderContext): string {
  const enabled = new Set(context.extensions)
  const hast = toHast(tree, {
    handlers: {
      eidosSyntax: (_state, node: SemanticToken) => ({
        type: "eidosSemantic",
        semantic: node,
      }),
      html: (_state, node: Extract<Nodes, { type: "html" }>) =>
        ACTIVE_HTML.test(node.value)
          ? text(node.value)
          : { type: "raw", value: node.value },
      blockquote: (state, node: Extract<Nodes, { type: "blockquote" }>) => {
        const source = context.source.slice(
          node.position?.start.offset,
          node.position?.end.offset
        )
        const callout = enabled.has("markdown.callout")
          ? parseCallout(source)
          : null
        if (!callout) return el("blockquote", state.wrap(state.all(node), true))
        const children = [...node.children]
        // Preserve document-wide reference definitions by keeping the original
        // AST and removing only the marker/title line from its first paragraph.
        const first = children[0]
        if (first?.type === "paragraph") {
          const headerEnd =
            (node.position?.start.offset ?? 0) + source.indexOf("\n")
          const remaining = first.children.flatMap((child) => {
            const start = child.position?.start.offset ?? 0,
              end = child.position?.end.offset ?? 0
            if (source.indexOf("\n") < 0 || end <= headerEnd) return []
            if (start <= headerEnd && child.type === "text")
              return [
                {
                  ...child,
                  value: child.value.slice(child.value.indexOf("\n") + 1),
                },
              ]
            return [child]
          })
          if (remaining.length) children[0] = { ...first, children: remaining }
          else children.shift()
        }
        const body = [
          el("div", state.all({ ...node, children }), {
            className: ["eme-obsidian-callout-body"],
          }),
        ]
        return callout.calloutFold
          ? el(
              "details",
              [
                el("summary", [text(callout.calloutTitle)], {
                  className: ["eme-obsidian-callout-title"],
                }),
                ...body,
              ],
              {
                className: ["eme-obsidian-callout"],
                dataCallout: callout.calloutType,
                open: callout.calloutFold === "+",
              }
            )
          : el(
              "aside",
              [
                el("div", [text(callout.calloutTitle)], {
                  className: ["eme-obsidian-callout-title"],
                }),
                ...body,
              ],
              {
                className: ["eme-obsidian-callout"],
                dataCallout: callout.calloutType,
              }
            )
      },
      image: (_state, node: Extract<Nodes, { type: "image" }>) => {
        const presentation = enabled.has("markdown.attachment")
          ? obsidianImagePresentation(node.alt ?? "")
          : { alt: node.alt ?? "" }
        const src = safeUrl(node.url, true)
        return src
          ? el("img", [], {
              src,
              alt: presentation.alt,
              ...("width" in presentation
                ? { width: presentation.width, height: presentation.height }
                : {}),
              title: node.title ?? undefined,
            })
          : text(presentation.alt)
      },
      imageReference: (
        state,
        node: Extract<Nodes, { type: "imageReference" }>
      ) => {
        const definition = state.definitionById.get(
          node.identifier.toUpperCase()
        )
        return definition
          ? state.one(
              {
                type: "image",
                url: definition.url,
                title: definition.title,
                alt: node.alt,
              },
              undefined
            )
          : text(node.alt ?? "")
      },
    },
  })
  // Parse HTML once with a standards parser, sanitize user markup, then render
  // trusted semantic nodes. Source HTML cannot manufacture a custom AST node.
  const expanded = raw(hast, { passThrough: ["eidosSemantic"] })
  if (expanded.type !== "root")
    throw new Error("Markdown renderer must produce a document root")
  const safe = sanitizeDocument(expanded)
  const headings: { text: string; level: number; id: string }[] = []
  const plain = (node: ElementContent): string =>
    node.type === "text"
      ? node.value
      : node.type === "eidosSemantic"
        ? plain(semantic(node.semantic, context))
        : "children" in node
          ? node.children.map(plain).join("")
          : ""
  const collectHeadings = (node: typeof safe | ElementContent): void => {
    if (node.type === "element" && /^h[1-6]$/u.test(node.tagName)) {
      const id = `user-content-heading-${headings.length}`
      node.properties.id = id
      headings.push({ text: plain(node), level: Number(node.tagName[1]), id })
    }
    if ("children" in node)
      for (const child of node.children)
        if (child.type !== "doctype") collectHeadings(child)
  }
  collectHeadings(safe)
  const resolvedContext: RenderContext = {
    ...context,
    resolveInternalLink: (target) => {
      if (!target.path && target.heading) {
        const index = findHeadingIndex(headings, target.heading)
        return index === null ? null : `#${headings[index]!.id}`
      }
      return context.resolveInternalLink?.(target) ?? null
    },
  }
  const materialize = (node: typeof safe | ElementContent): void => {
    if ("children" in node)
      node.children = node.children.map((child) => {
        if (child.type === "eidosSemantic")
          return semantic(child.semantic, resolvedContext)
        if (child.type !== "doctype") materialize(child)
        return child
      }) as typeof node.children
  }
  materialize(safe)
  return toHtml(safe, { characterReferences: { useNamedReferences: true } })
}
