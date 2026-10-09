import { $createLinkNode, $isLinkNode, type LinkNode } from "@lexical/link"
import { LINK, type TextMatchTransformer } from "@lexical/markdown"
import { $createTextNode, $getState, $setState, createState } from "lexical"
import { resolveEfmResourceUri } from "../../markdown/efm-uri"

// Link children remain ordinary TextNodes, so selection and deletion work at
// character boundaries. NodeState retains the Markdown spelling on export.
const autolinkSource = createState("eme-autolink-source", {
  parse: (value) => (typeof value === "string" ? value : ""),
})

export function $createEditableAutolink(
  source: string,
  label: string,
  url: string
): LinkNode {
  const node = $createLinkNode(url).append($createTextNode(label))
  $setState(node, autolinkSource, source)
  return node
}

export function $editableAutolinkDestination(node: LinkNode): string | null {
  if (!$getState(node, autolinkSource)) return null
  const text = node.getTextContent()
  const destination = /^www\./iu.test(text)
    ? `http://${text}`
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)
      ? `mailto:${text}`
      : text
  return resolveEfmResourceUri(destination)
}

export function $isEditableAutolink(node: LinkNode): boolean {
  return Boolean($getState(node, autolinkSource))
}

export const EDITABLE_LINK: TextMatchTransformer = {
  ...LINK,
  export: (node, exportChildren, exportFormat) => {
    if ($isLinkNode(node)) {
      const source = $getState(node, autolinkSource)
      if (source) {
        const text = node.getTextContent()
        return source.startsWith("<") ? `<${text}>` : text
      }
    }
    return LINK.export?.(node, exportChildren, exportFormat) ?? null
  },
}
