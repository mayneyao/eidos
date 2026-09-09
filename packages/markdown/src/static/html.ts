import type { Root, RootContent, ElementContent } from "hast"
import { ALLOWED_HTML_TAGS, DROPPED_HTML_TAGS } from "../core/html-elements"
import { safeUrl } from "./url"

/** Shared HTML element policy; no source-provided CSS, handlers or active nodes. */
export function sanitizeDocument(tree: Root): Root {
  function clean(node: RootContent): ElementContent[] {
    if (node.type === "text" || node.type === "eidosSemantic") return [node]
    if (node.type !== "element") return []
    const tag = node.tagName
    // Only generated GFM checkboxes reach this path: source input tags use the
    // same ACTIVE_HTML source fallback as the editor.
    const checkbox =
      tag === "input" &&
      node.properties.type === "checkbox" &&
      node.properties.disabled === true
    if (DROPPED_HTML_TAGS.has(tag) && !checkbox) return []
    const children = node.children.flatMap(clean)
    if (
      !ALLOWED_HTML_TAGS.has(tag) &&
      !["section", "aside"].includes(tag) &&
      !checkbox
    )
      return children
    const properties: typeof node.properties = {}
    for (const [key, value] of Object.entries(node.properties)) {
      if (key === "href" || key === "src") {
        if (typeof value === "string" && safeUrl(value, key === "src"))
          properties[key] = value
      } else if (
        ["title", "alt", "ariaLabel", "ariaDescribedBy"].includes(key) &&
        typeof value === "string"
      )
        properties[key] = value
      else if (
        ["width", "height", "colSpan", "rowSpan", "start"].includes(key) &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0
      )
        properties[key] = Number(value)
      else if (
        key === "align" &&
        typeof value === "string" &&
        /^(left|center|right|justify)$/u.test(value)
      )
        properties[key] = value
      else if (key === "open" && tag === "details") properties.open = !!value
      else if (checkbox && ["type", "disabled", "checked"].includes(key))
        properties[key] = value
      else if (
        key === "id" &&
        typeof value === "string" &&
        /^(user-content-|obsidian-block-)/u.test(value)
      )
        properties.id = value
      else if (key === "className" && Array.isArray(value))
        properties.className = value.filter(
          (v) =>
            typeof v === "string" &&
            /^(eme-|language-|task-list-item$|contains-task-list$|footnotes$|sr-only$)/u.test(
              v
            )
        )
      else if (
        key === "dataCallout" &&
        typeof value === "string" &&
        /^[\w-]+$/u.test(value)
      )
        properties[key] = value
      else if (
        ["dataFootnotes", "dataFootnoteRef", "dataFootnoteBackref"].includes(
          key
        )
      )
        properties[key] = value
    }
    return [{ ...node, properties, children }]
  }
  return { ...tree, children: tree.children.flatMap(clean) }
}
