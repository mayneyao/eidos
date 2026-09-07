import { fromMarkdown } from "mdast-util-from-markdown"
import { gfm } from "micromark-extension-gfm"
import { gfmFromMarkdown } from "mdast-util-gfm"
import { findDocumentRanges, findLiteralText } from "./document-find"

/** Conservative mapping: only parser-confirmed literal text; never guess an ordinal across hidden syntax. */
export function findSourceTextRange(
  root: HTMLElement,
  source: string,
  start: number,
  end: number
): Range | null {
  const needle = source.slice(start, end)
  if (!needle || /\[\[|<|\\|&|\^\w/u.test(source)) return null
  const tree = fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  const offsets: number[] = []
  function visit(
    node:
      | typeof tree
      | (typeof tree.children)[number]
      | {
          type: string
          value?: string
          position?: { start: { offset?: number }; end: { offset?: number } }
          children?: unknown[]
        }
  ) {
    const a = node.position?.start.offset
    const b = node.position?.end.offset
    if (
      node.type === "text" &&
      "value" in node &&
      typeof node.value === "string" &&
      a !== undefined &&
      b !== undefined &&
      source.slice(a, b) === node.value
    ) {
      for (const match of findLiteralText(node.value, needle).matches)
        offsets.push(a + match.start)
    }
    if ("children" in node && node.children)
      for (const child of node.children)
        visit(child as Parameters<typeof visit>[0])
  }
  visit(tree)
  const index = offsets.indexOf(start)
  if (index < 0) return null
  const visible = findDocumentRanges(root, needle)
  return !visible.limited && visible.ranges.length === offsets.length
    ? (visible.ranges[index] ?? null)
    : null
}
